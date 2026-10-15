import { lazy, type ComponentType } from 'react';
import type {
  ExplorationWidgetType,
  ExplorationWidgetProps,
  ExplorationWidgetConfig,
} from './types';

type WidgetComponent = ComponentType<ExplorationWidgetProps<ExplorationWidgetConfig>>;

/**
 * The raw chunk loaders behind EXPLORATION_WIDGETS. Exported so offline
 * downloads can load (and the service worker cache) every widget chunk ahead
 * of time — a widget first needed with no connection would otherwise fail.
 */
export const EXPLORATION_WIDGET_LOADERS = {
  number_line: () => import('@/components/explorations/NumberLineWidget'),
  slider_explore: () => import('@/components/explorations/SliderExploreWidget'),
  image_hotspot: () => import('@/components/explorations/ImageHotspotWidget'),
  letter_trace: () => import('@/components/explorations/LetterTraceWidget'),
  counting_objects: () => import('@/components/explorations/CountingObjectsWidget'),
  sorting: () => import('@/components/explorations/SortingWidget'),
  color_picker: () => import('@/components/explorations/ColorPickerWidget'),
} satisfies Record<ExplorationWidgetType, () => Promise<unknown>>;

export const EXPLORATION_WIDGETS: Record<ExplorationWidgetType, React.LazyExoticComponent<WidgetComponent>> = {
  number_line: lazy(EXPLORATION_WIDGET_LOADERS.number_line) as React.LazyExoticComponent<WidgetComponent>,
  slider_explore: lazy(EXPLORATION_WIDGET_LOADERS.slider_explore) as React.LazyExoticComponent<WidgetComponent>,
  image_hotspot: lazy(EXPLORATION_WIDGET_LOADERS.image_hotspot) as React.LazyExoticComponent<WidgetComponent>,
  letter_trace: lazy(EXPLORATION_WIDGET_LOADERS.letter_trace) as React.LazyExoticComponent<WidgetComponent>,
  counting_objects: lazy(EXPLORATION_WIDGET_LOADERS.counting_objects) as React.LazyExoticComponent<WidgetComponent>,
  sorting: lazy(EXPLORATION_WIDGET_LOADERS.sorting) as React.LazyExoticComponent<WidgetComponent>,
  color_picker: lazy(EXPLORATION_WIDGET_LOADERS.color_picker) as React.LazyExoticComponent<WidgetComponent>,
};

export function getExplorationWidget(
  type: ExplorationWidgetType
): React.LazyExoticComponent<WidgetComponent> | null {
  return EXPLORATION_WIDGETS[type] ?? null;
}

/** Labels for the widget type — used in the ExplorationOverlay header. */
export const WIDGET_LABELS: Record<ExplorationWidgetType, { ar: string; en: string }> = {
  number_line: { ar: 'خط الأعداد', en: 'Number Line' },
  slider_explore: { ar: 'استكشف بالشريط', en: 'Explore' },
  image_hotspot: { ar: 'اكتشف الصورة', en: 'Discover' },
  letter_trace: { ar: 'تتبع الحرف', en: 'Trace' },
  counting_objects: { ar: 'عد الأشياء', en: 'Count' },
  sorting: { ar: 'تصنيف', en: 'Sort' },
  color_picker: { ar: 'لوحة الألوان', en: 'Mix Colors' },
};
