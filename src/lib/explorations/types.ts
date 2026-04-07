/**
 * Exploration widget types for sim playback.
 *
 * Exploration gates pause the sim and present a manipulable interactive widget
 * where the student discovers a concept (as opposed to activity gates which
 * assess understanding). The widget signals "explored enough" when the student
 * has interacted sufficiently, then the sim resumes.
 */

export type ExplorationWidgetType =
  | 'number_line'
  | 'slider_explore'
  | 'image_hotspot'
  | 'letter_trace'
  | 'counting_objects'
  | 'sorting'
  | 'color_picker';

// ── Per-widget configs ──────────────────────────────────────────────────────

export interface NumberLineConfig {
  type: 'number_line';
  min: number;
  max: number;
  target: number;
  /** How close the student's placement must be to count as correct. */
  tolerance: number;
  step?: number;
  unit_label_ar?: string;
  unit_label_en?: string;
}

export interface SliderExploreStage {
  /** Value at which this stage activates (≥ threshold). */
  threshold: number;
  label_ar: string;
  label_en: string;
  emoji: string;
}

export interface SliderExploreConfig {
  type: 'slider_explore';
  label_ar: string;
  label_en: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  stages: SliderExploreStage[];
}

export interface ImageHotspot {
  x_pct: number;
  y_pct: number;
  label_ar: string;
  label_en: string;
  emoji?: string;
}

export interface ImageHotspotConfig {
  type: 'image_hotspot';
  image_url: string;
  hotspots: ImageHotspot[];
}

export interface LetterTraceConfig {
  type: 'letter_trace';
  /** The text to trace — a letter, number, or word. */
  text: string;
  /** @deprecated Use `text` instead. Kept for backward compatibility. */
  letter?: string;
  script: 'ar' | 'en';
  /** Pre-built guide path(s). When absent, canvas text rendering is used. */
  stroke_paths?: Array<{ points: Array<{ x: number; y: number }> }>;
  /** Max average distance (in SVG units) from guide for a passing trace. */
  tolerance: number;
}

export interface CountingObjectsConfig {
  type: 'counting_objects';
  objects: Array<{ icon: string; x_pct: number; y_pct: number; size?: number }>;
  target_count: number;
}

export interface SortingConfig {
  type: 'sorting';
  categories: Array<{ label_en: string; label_ar: string; color: string }>;
  items: Array<{ label_en: string; label_ar: string; correct_category: number }>;
}

export interface ColorPickerConfig {
  type: 'color_picker';
  target_color: string;
  tolerance: number;
}

export type ExplorationWidgetConfig =
  | NumberLineConfig
  | SliderExploreConfig
  | ImageHotspotConfig
  | LetterTraceConfig
  | CountingObjectsConfig
  | SortingConfig
  | ColorPickerConfig;

// ── Widget component props ──────────────────────────────────────────────────

export interface ExplorationWidgetProps<
  C extends ExplorationWidgetConfig = ExplorationWidgetConfig,
> {
  config: C;
  language: 'ar' | 'en';
  /** Call when the student has explored enough to proceed. */
  onComplete: () => void;
}

// ── Picker option shape ─────────────────────────────────────────────────────

export interface ExplorationWidgetOption {
  type: ExplorationWidgetType;
  label_ar: string;
  label_en: string;
  description_en: string;
  /** Lucide icon name. */
  icon: string;
}

export const EXPLORATION_WIDGET_OPTIONS: ExplorationWidgetOption[] = [
  {
    type: 'number_line',
    label_ar: 'خط الأعداد',
    label_en: 'Number Line',
    description_en: 'Drag a handle to place a number on a line',
    icon: 'ruler',
  },
  {
    type: 'slider_explore',
    label_ar: 'شريط التمرير',
    label_en: 'Slider Explore',
    description_en: 'Adjust a value and watch what changes',
    icon: 'sliders-horizontal',
  },
  {
    type: 'image_hotspot',
    label_ar: 'نقاط على صورة',
    label_en: 'Image Hotspot',
    description_en: 'Tap regions on an image to reveal labels',
    icon: 'map-pin',
  },
  {
    type: 'letter_trace',
    label_ar: 'تتبع الحرف',
    label_en: 'Letter / Word Trace',
    description_en: 'Trace letters, numbers, or words with your finger',
    icon: 'pen-tool',
  },
  {
    type: 'counting_objects',
    label_ar: 'عد الأشياء',
    label_en: 'Counting Objects',
    description_en: 'Tap objects to count them one by one',
    icon: 'hash',
  },
  {
    type: 'sorting',
    label_ar: 'تصنيف',
    label_en: 'Sorting',
    description_en: 'Drag items into the correct category',
    icon: 'arrow-up-down',
  },
  {
    type: 'color_picker',
    label_ar: 'لوحة الألوان',
    label_en: 'Color Mixer',
    description_en: 'Mix colors with sliders to match a target',
    icon: 'palette',
  },
];
