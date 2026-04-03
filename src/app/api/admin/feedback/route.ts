import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GITHUB_REPO = "pobzino/madrassa-sudan";

const CATEGORY_LABELS: Record<string, string> = {
  bug: "bug",
  feature: "enhancement",
  change: "enhancement",
  other: "feedback",
};

const CATEGORY_EMOJI: Record<string, string> = {
  bug: "🐛",
  feature: "✨",
  change: "🔄",
  other: "💬",
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { category, title, description, page_url, screenshot_url } = body;

    if (!category || !title || !description) {
      return NextResponse.json(
        { error: "Missing required fields: category, title, description" },
        { status: 400 }
      );
    }

    // Insert feedback row
    const { data: feedback, error: insertError } = await supabase
      .from("feedback")
      .insert({
        user_id: user.id,
        category,
        title,
        description,
        page_url: page_url || null,
        screenshot_url: screenshot_url || null,
      })
      .select()
      .single();

    if (insertError || !feedback) {
      console.error("Feedback insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save feedback" },
        { status: 500 }
      );
    }

    // Create GitHub Issue
    let github_issue_number: number | null = null;
    let github_issue_url: string | null = null;

    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      try {
        const emoji = CATEGORY_EMOJI[category] || "💬";
        const label = CATEGORY_LABELS[category] || "feedback";

        const issueBody = [
          `${emoji} **${category.charAt(0).toUpperCase() + category.slice(1)}** reported by **${profile.full_name}** (${profile.role})`,
          "",
          "## Description",
          description,
          "",
          page_url ? `**Page:** ${page_url}` : "",
          screenshot_url ? `**Screenshot:** ${screenshot_url}` : "",
          "",
          `---`,
          `Feedback ID: \`${feedback.id}\``,
        ]
          .filter(Boolean)
          .join("\n");

        const ghRes = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/issues`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: `[${category}] ${title}`,
              body: issueBody,
              labels: [label],
            }),
          }
        );

        if (ghRes.ok) {
          const issue = await ghRes.json();
          github_issue_number = issue.number;
          github_issue_url = issue.html_url;

          // Update feedback row with GitHub issue info
          await supabase
            .from("feedback")
            .update({ github_issue_number, github_issue_url })
            .eq("id", feedback.id);
        } else {
          const errText = await ghRes.text();
          console.error("GitHub Issue creation failed:", ghRes.status, errText);
        }
      } catch (ghErr) {
        console.error("GitHub Issue creation error:", ghErr);
        // Don't fail the request — feedback is still saved in DB
      }
    }

    return NextResponse.json({
      id: feedback.id,
      github_issue_number,
      github_issue_url,
    });
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // RLS handles filtering: admins see all, teachers see own
    const { data: items, error } = await supabase
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to load feedback" }, { status: 500 });
    }

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Feedback GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
