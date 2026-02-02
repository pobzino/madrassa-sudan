import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, Profile } from "@/lib/database.types";

let cachedUser: User | null | undefined;
let cachedUserId: string | null | undefined;
let userPromise: Promise<User | null> | null = null;
const profileCache = new Map<string, Profile | null>();
const profilePromises = new Map<string, Promise<Profile | null>>();

export async function getCachedUser(
  supabase: SupabaseClient<Database>
): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    cachedUser = null;
    cachedUserId = null;
    return null;
  }

  if (cachedUser && cachedUserId === session.user.id) {
    return cachedUser;
  }

  if (userPromise) {
    return userPromise;
  }

  userPromise = supabase.auth.getUser().then(({ data }) => {
    cachedUser = data.user ?? null;
    cachedUserId = data.user?.id ?? null;
    return cachedUser;
  }).finally(() => {
    userPromise = null;
  });

  return userPromise;
}

export async function getCachedProfile(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Profile | null> {
  if (profileCache.has(userId)) {
    return profileCache.get(userId) ?? null;
  }

  const existingPromise = profilePromises.get(userId);
  if (existingPromise) {
    return existingPromise;
  }

  const profilePromise = Promise.resolve(
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()
  )
    .then(({ data }) => {
      const profile = data ?? null;
      profileCache.set(userId, profile);
      return profile;
    })
    .finally(() => {
      profilePromises.delete(userId);
    });

  profilePromises.set(userId, profilePromise);
  return profilePromise;
}

export function primeCachedProfile(profile: Profile | null) {
  if (profile?.id) {
    profileCache.set(profile.id, profile);
  }
}

export function clearAuthCache() {
  cachedUser = undefined;
  cachedUserId = undefined;
  userPromise = null;
  profileCache.clear();
  profilePromises.clear();
}
