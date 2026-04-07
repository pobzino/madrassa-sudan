import { lazy, type ComponentType } from 'react';
import type {
  ExplorationWidgetType,
  ExplorationWidgetProps,
  ExplorationWidgetConfig,
} from './types';

type WidgetComponent = ComponentType<ExplorationWidgetProps<ExplorationWidgetConfig>>;

export const EXPLORATION_WIDGETS: Record<ExplorationWidgetType, React.LazyExoticComponent<WidgetComponent>> = {
  number_line: lazy(() => import('@/components/explorations/NumberLineWidget')) as React.LazyExoticComponent<WidgetComponent>,
  slider_explore: lazy(() => import('@/components/explorations/SliderExploreWidget')) as React.LazyExoticComponent<WidgetComponent>,
  image_hotspot: lazy(() => import('@/components/explorations/ImageHotspotWidget')) as React.LazyExoticComponent<WidgetComponent>,
  letter_trace: lazy(() => import('@/components/explorations/LetterTraceWidget')) as React.LazyExoticComponent<WidgetComponent>,
  counting_objects: lazy(() => import('@/components/explorations/CountingObjectsWidget')) as React.LazyExoticComponent<WidgetComponent>,
  sorting: lazy(() => import('@/components/explorations/SortingWidget')) as React.LazyExoticComponent<WidgetComponent>,
  color_picker: lazy(() => import('@/components/explorations/ColorPickerWidget')) as React.LazyExoticComponent<WidgetComponent>,
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
