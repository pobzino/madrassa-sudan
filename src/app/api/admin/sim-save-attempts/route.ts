import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import { SIM_AUDIO_BUCKET } from '@/lib/server/sim-storage';

async function listFallbackAttemptPaths(prefix = '_save-attempts'): Promise<string[]> {
  const service = createServiceClient();
  const { data, error } = await service.storage
    .from(SIM_AUDIO_BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

  if (error) throw error;

  const paths: string[] = [];
  for (const item of data || []) {
    const path = `${prefix}/${item.name}`;
    if (!item.metadata || item.id === null) {
      paths.push(...await listFallbackAttemptPaths(path));
    } else if (path.endsWith('.json')) {
      paths.push(path);
    }
  }
  return paths;
}

async function loadFallbackAttempts(limit: number) {
  const service = createServiceClient();
  const paths = (await listFallbackAttemptPaths()).slice(-limit);
  const attempts: unknown[] = [];

  for (const path of paths.reverse()) {
    const { data, error } = await service.storage.from(SIM_AUDIO_BUCKET).download(path);
    if (error || !data) continue;
    const text = await data.text();
    try {
      attempts.push(JSON.parse(text));
    } catch {
      attempts.push({ storage_path: path, parse_error: true });
    }
  }

  return attempts;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('role, is_approved')
      .eq('id', user.id)
      .single();

    if (!adminProfile || adminProfile.role !== 'admin' || !adminProfile.is_approved) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { error: 'Server is missing Supabase service role credentials.' },
        { status: 500 }
      );
    }

    const status = request.nextUrl.searchParams.get('status');
    const lessonId = request.nextUrl.searchParams.get('lesson_id');
    const userId = request.nextUrl.searchParams.get('user_id');
    const limit = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get('limit') || 100), 1),
      250
    );
    const includeSaved = request.nextUrl.searchParams.get('include_saved') === 'true';

    const service = createServiceClient();
    let query = service
      .from('sim_save_attempts')
      .select(
        `
        *,
        lesson:lessons (
          id,
          title_en,
          title_ar,
          is_published,
          submitted_for_review
        ),
        user:profiles!sim_save_attempts_user_id_fkey (
          id,
          full_name,
          role,
          is_approved
        )
      `
      )
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    } else if (!includeSaved) {
      query = query.not('status', 'in', '(saved,discarded,retake)');
    }

    if (lessonId) query = query.eq('lesson_id', lessonId);
    if (userId) query = query.eq('user_id', userId);

    const { data: attempts, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        const fallbackAttempts = await loadFallbackAttempts(limit);
        return NextResponse.json({ attempts: fallbackAttempts, storage_fallback: true });
      }
      console.error('Admin sim save attempts error:', error);
      return NextResponse.json({ error: 'Failed to load sim save attempts' }, { status: 500 });
    }

    return NextResponse.json({ attempts });
  } catch (error) {
    console.error('Admin sim save attempts GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
