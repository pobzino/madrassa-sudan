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

// The picker grid renders the real SVG (OwlImage), so no text fallback is kept here.
export interface OwlOption {
  key: string;
  label: string;
}

export const OWL_OPTIONS: OwlOption[] = [
  { key: 'OwlWaving', label: 'Waving' },
  { key: 'OwlCelebrating', label: 'Celebrating' },
  { key: 'OwlThinking', label: 'Thinking' },
  { key: 'OwlReading', label: 'Reading' },
  { key: 'OwlExcited', label: 'Excited' },
  { key: 'OwlPointing', label: 'Pointing' },
  { key: 'OwlTeacher', label: 'Teacher' },
  { key: 'OwlWriting', label: 'Writing' },
  { key: 'OwlCorrect', label: 'Correct' },
  { key: 'OwlWrong', label: 'Wrong' },
  { key: 'OwlEncouraging', label: 'Encouraging' },
  { key: 'OwlConfused', label: 'Confused' },
  { key: 'OwlSad', label: 'Sad' },
  { key: 'OwlSleeping', label: 'Sleeping' },
  { key: 'OwlWelcome', label: 'Welcome' },
  { key: 'OwlBye', label: 'Bye' },
  { key: 'OwlMath', label: 'Math' },
  { key: 'OwlScience', label: 'Science' },
  { key: 'OwlEnglish', label: 'English' },
  { key: 'OwlStreak', label: 'Streak' },
  { key: 'OwlMedal', label: 'Medal' },
  { key: 'OwlHead', label: 'Head' },
];
