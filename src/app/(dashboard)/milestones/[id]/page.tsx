import { redirect } from "next/navigation";

// There is no intro screen any more: the boss's entrance is the intro.
// Old links (and the teacher's "play it") go straight into the battle,
// which shows its own locked screen when the challenge isn't open yet.
export default async function MilestonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { boss } = await searchParams;
  const query = typeof boss === "string" ? `?boss=${encodeURIComponent(boss)}` : "";
  redirect(`/milestones/${encodeURIComponent(id)}/battle${query}`);
}
