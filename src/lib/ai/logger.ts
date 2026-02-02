// AI Action Logger - Audit trail for AI tool executions

import { SupabaseClient } from "@supabase/supabase-js";
import { ToolExecutionLog, ToolExecutionResult } from "./types";

// Log a tool execution start
export async function logToolStart(
  supabase: SupabaseClient,
  conversationId: string | null,
  studentId: string,
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("ai_tool_executions")
      .insert({
        conversation_id: conversationId,
        student_id: studentId,
        tool_name: toolName,
        tool_input: toolInput,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to log tool start:", error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error("Logger error:", error);
    return null;
  }
}

// Update tool execution with result
export async function logToolComplete(
  supabase: SupabaseClient,
  logId: string,
  result: ToolExecutionResult
): Promise<void> {
  try {
    const updateData: Partial<ToolExecutionLog> = {
      status: result.success ? "success" : "failed",
      executed_at: new Date().toISOString(),
    };

    if (result.success) {
      updateData.tool_output = result.data as Record<string, unknown>;
    } else {
      updateData.error_message = result.error;
    }

    const { error } = await supabase
      .from("ai_tool_executions")
      .update(updateData)
      .eq("id", logId);

    if (error) {
      console.error("Failed to log tool completion:", error);
    }
  } catch (error) {
    console.error("Logger error:", error);
  }
}

// Log rate limit hit
export async function logRateLimited(
  supabase: SupabaseClient,
  conversationId: string | null,
  studentId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  reason: string
): Promise<void> {
  try {
    await supabase.from("ai_tool_executions").insert({
      conversation_id: conversationId,
      student_id: studentId,
      tool_name: toolName,
      tool_input: toolInput,
      status: "rate_limited",
      error_message: reason,
      executed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to log rate limit:", error);
  }
}

// Get recent tool executions for a student
export async function getRecentExecutions(
  supabase: SupabaseClient,
  studentId: string,
  limit: number = 20
): Promise<ToolExecutionLog[]> {
  try {
    const { data, error } = await supabase
      .from("ai_tool_executions")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Failed to get recent executions:", error);
    return [];
  }
}

// Get tool execution statistics for a student
export async function getExecutionStats(
  supabase: SupabaseClient,
  studentId: string,
  days: number = 7
): Promise<{
  total: number;
  success: number;
  failed: number;
  rate_limited: number;
  by_tool: Record<string, number>;
}> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from("ai_tool_executions")
      .select("tool_name, status")
      .eq("student_id", studentId)
      .gte("created_at", startDate.toISOString());

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      success: 0,
      failed: 0,
      rate_limited: 0,
      by_tool: {} as Record<string, number>,
    };

    data?.forEach((exec) => {
      // Count by status
      if (exec.status === "success") stats.success++;
      else if (exec.status === "failed") stats.failed++;
      else if (exec.status === "rate_limited") stats.rate_limited++;

      // Count by tool
      stats.by_tool[exec.tool_name] = (stats.by_tool[exec.tool_name] || 0) + 1;
    });

    return stats;
  } catch (error) {
    console.error("Failed to get execution stats:", error);
    return {
      total: 0,
      success: 0,
      failed: 0,
      rate_limited: 0,
      by_tool: {},
    };
  }
}

// Clean up old execution logs (for maintenance)
export async function cleanupOldLogs(
  supabase: SupabaseClient,
  daysToKeep: number = 30
): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { data, error } = await supabase
      .from("ai_tool_executions")
      .delete()
      .lt("created_at", cutoffDate.toISOString())
      .select("id");

    if (error) throw error;
    return data?.length || 0;
  } catch (error) {
    console.error("Failed to cleanup old logs:", error);
    return 0;
  }
}
