import CharacterGallery from "./CharacterGallery";

/**
 * Dev-only gallery for the Big Challenge characters and arenas: every boss
 * and the owl with a button per pose and action, plus each arena backdrop.
 *
 * Query params render a single item for screenshots:
 *   ?shot=boss&key=number_giant&pose=hit
 *   ?shot=owl&pose=block
 *   ?shot=arena&key=letter_camel
 *
 * Renders nothing useful in production.
 */
export default async function CharactersDevPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") {
    return <div>Not available.</div>;
  }
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return <CharacterGallery shot={one("shot")} bossKey={one("key")} pose={one("pose")} />;
}
