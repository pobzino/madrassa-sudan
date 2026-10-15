import HomePage from "@/components/home/HomePage";
import { loadHomeStats } from "@/lib/server/home-stats";

// The counters also refresh in the browser, so the page itself only needs to be
// roughly current when it first loads.
export const revalidate = 60;

export default async function Home() {
  const stats = await loadHomeStats();
  return <HomePage stats={stats} />;
}
