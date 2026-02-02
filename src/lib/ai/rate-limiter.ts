// AI Tool Rate Limiter

import { SupabaseClient } from "@supabase/supabase-js";
import { RateLimitResult } from "./types";

// Rate limit configurations
const RATE_LIMITS = {
  // Tool-specific limits
  create_homework_assignment: {
    maxPerDay: 5,
    cooldownSeconds: 10,
    description: "homework creation",
  },
  get_student_progress: {
    maxPerDay: 50,
    cooldownSeconds: 2,
    description: "progress queries",
  },
  get_weak_areas: {
    maxPerDay: 20,
    cooldownSeconds: 5,
    description: "weak area analysis",
  },
  suggest_learning_path: {
    maxPerDay: 10,
    cooldownSeconds: 10,
    description: "learning path suggestions",
  },
  search_lessons: {
    maxPerDay: 50,
    cooldownSeconds: 2,
    description: "lesson searches",
  },
  get_lesson_content_chunk: {
    maxPerDay: 100,
    cooldownSeconds: 1,
    description: "lesson content lookups",
  },
  get_lesson_context: {
    maxPerDay: 80,
    cooldownSeconds: 2,
    description: "lesson context lookups",
  },
  get_mistake_patterns: {
    maxPerDay: 20,
    cooldownSeconds: 5,
    description: "mistake pattern analysis",
  },
  get_homework_question_context: {
    maxPerDay: 80,
    cooldownSeconds: 2,
    description: "homework question lookups",
  },
  // Default for other tools
  default: {
    maxPerDay: 100,
    cooldownSeconds: 1,
    description: "API calls",
  },
};

export async function checkRateLimit(
  supabase: SupabaseClient,
  studentId: string,
  toolName: string
): Promise<RateLimitResult> {
  try {
    const config = RATE_LIMITS[toolName as keyof typeof RATE_LIMITS] || RATE_LIMITS.default;

    // Get today's start in UTC
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Count tool executions today
    const { count: todayCount, error: countError } = await supabase
      .from("ai_tool_executions")
      .select("*", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("tool_name", toolName)
      .eq("status", "success")
      .gte("created_at", todayStart.toISOString());

    if (countError) {
      console.error("Rate limit count error:", countError);
      // Allow on error to not block legitimate use
      return { allowed: true };
    }

    // Check daily limit
    if ((todayCount || 0) >= config.maxPerDay) {
      const resetAt = new Date(todayStart);
      resetAt.setDate(resetAt.getDate() + 1);

      return {
        allowed: false,
        reason: `Daily limit for ${config.description} reached (${config.maxPerDay}/day). Resets at midnight UTC.`,
        remaining: 0,
        reset_at: resetAt.toISOString(),
      };
    }

    // Check cooldown (last execution time)
    const { data: lastExecution } = await supabase
      .from("ai_tool_executions")
      .select("created_at")
      .eq("student_id", studentId)
      .eq("tool_name", toolName)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lastExecution) {
      const lastTime = new Date(lastExecution.created_at);
      const now = new Date();
      const secondsSinceLast = (now.getTime() - lastTime.getTime()) / 1000;

      if (secondsSinceLast < config.cooldownSeconds) {
        const waitSeconds = Math.ceil(config.cooldownSeconds - secondsSinceLast);
        return {
          allowed: false,
          reason: `Please wait ${waitSeconds} seconds before next ${config.description}`,
          remaining: config.maxPerDay - (todayCount || 0),
          reset_at: new Date(lastTime.getTime() + config.cooldownSeconds * 1000).toISOString(),
        };
      }
    }

    return {
      allowed: true,
      remaining: config.maxPerDay - (todayCount || 0) - 1,
    };
  } catch (error) {
    console.error("Rate limit check error:", error);
    // Allow on error to not block legitimate use
    return { allowed: true };
  }
}

// Get rate limit status for a student
export async function getRateLimitStatus(
  supabase: SupabaseClient,
  studentId: string
): Promise<Record<string, { used: number; limit: number; remaining: number }>> {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Get all tool executions today
    const { data: executions, error } = await supabase
      .from("ai_tool_executions")
      .select("tool_name")
      .eq("student_id", studentId)
      .eq("status", "success")
      .gte("created_at", todayStart.toISOString());

    if (error) throw error;

    // Count by tool
    const counts: Record<string, number> = {};
    executions?.forEach((e) => {
      counts[e.tool_name] = (counts[e.tool_name] || 0) + 1;
    });

    // Build status for all known tools
    const status: Record<string, { used: number; limit: number; remaining: number }> = {};

    Object.entries(RATE_LIMITS).forEach(([toolName, config]) => {
      if (toolName !== "default") {
        const used = counts[toolName] || 0;
        status[toolName] = {
          used,
          limit: config.maxPerDay,
          remaining: Math.max(0, config.maxPerDay - used),
        };
      }
    });

    return status;
  } catch (error) {
    console.error("Get rate limit status error:", error);
    return {};
  }
}

// Check if student can create more homework today
export async function canCreateHomework(
  supabase: SupabaseClient,
  studentId: string
): Promise<{ allowed: boolean; remaining: number; message?: string }> {
  const result = await checkRateLimit(supabase, studentId, "create_homework_assignment");

  return {
    allowed: result.allowed,
    remaining: result.remaining || 0,
    message: result.allowed
      ? `You can create ${result.remaining} more homework assignments today`
      : result.reason,
  };
}
