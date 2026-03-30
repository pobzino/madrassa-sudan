/**
 * Registry of owl illustration components available for slides.
 * Teachers can pick an owl illustration instead of providing an image URL.
 * When image_url starts with "owl:", templates render the SVG component.
 */

export const OWL_PREFIX = 'owl:';

export function isOwlImage(url: string | null | undefined): boolean {
  return !!url && url.startsWith(OWL_PREFIX);
}

export function getOwlKey(url: string): string {
  return url.slice(OWL_PREFIX.length);
}

export interface OwlOption {
  key: string;
  label: string;
  emoji: string; // preview fallback for the picker grid
}

export const OWL_OPTIONS: OwlOption[] = [
  { key: 'OwlWaving', label: 'Waving', emoji: '👋' },
  { key: 'OwlCelebrating', label: 'Celebrating', emoji: '🎉' },
  { key: 'OwlThinking', label: 'Thinking', emoji: '🤔' },
  { key: 'OwlReading', label: 'Reading', emoji: '📖' },
  { key: 'OwlExcited', label: 'Excited', emoji: '🤩' },
  { key: 'OwlPointing', label: 'Pointing', emoji: '👉' },
  { key: 'OwlTeacher', label: 'Teacher', emoji: '🎓' },
  { key: 'OwlWriting', label: 'Writing', emoji: '✏️' },
  { key: 'OwlCorrect', label: 'Correct', emoji: '✅' },
  { key: 'OwlWrong', label: 'Wrong', emoji: '❌' },
  { key: 'OwlEncouraging', label: 'Encouraging', emoji: '💪' },
  { key: 'OwlConfused', label: 'Confused', emoji: '😕' },
  { key: 'OwlSad', label: 'Sad', emoji: '😢' },
  { key: 'OwlSleeping', label: 'Sleeping', emoji: '😴' },
  { key: 'OwlWelcome', label: 'Welcome', emoji: '🏠' },
  { key: 'OwlBye', label: 'Bye', emoji: '👋' },
  { key: 'OwlMath', label: 'Math', emoji: '🔢' },
  { key: 'OwlScience', label: 'Science', emoji: '🔬' },
  { key: 'OwlEnglish', label: 'English', emoji: '🔤' },
  { key: 'OwlStreak', label: 'Streak', emoji: '🔥' },
  { key: 'OwlMedal', label: 'Medal', emoji: '🏅' },
  { key: 'OwlHead', label: 'Head', emoji: '🦉' },
];
