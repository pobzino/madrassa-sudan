import type { SlideSpan } from '@/lib/sim-splice';

/** A slide occurrence on a saved sim's timeline that a tutor can re-record. */
export interface SimPatchTarget extends SlideSpan {
  /** Index in the deck, so the editor can jump to the right slide. */
  slideIndex: number;
  /** Human label for the confirm dialog ("Adding to 20", "… (visit 2)"). */
  label: string;
}
