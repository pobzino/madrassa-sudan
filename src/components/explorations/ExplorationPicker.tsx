'use client';

import { useState } from 'react';
import {
  Ruler,
  SlidersHorizontal,
  MapPin,
  PenTool,
  Hash,
  ArrowUpDown,
  Palette,
  type LucideIcon,
} from 'lucide-react';
import {
  EXPLORATION_WIDGET_OPTIONS,
  type ExplorationWidgetType,
  type ExplorationWidgetConfig,
  type NumberLineConfig,
  type SliderExploreConfig,
  type ImageHotspotConfig,
  type LetterTraceConfig,
  type CountingObjectsConfig,
  type SortingConfig,
  type ColorPickerConfig,
} from '@/lib/explorations/types';

type PickerStep = 'pick_type' | 'configure';

const ICON_MAP: Record<string, LucideIcon> = {
  ruler: Ruler,
  'sliders-horizontal': SlidersHorizontal,
  'map-pin': MapPin,
  'pen-tool': PenTool,
  hash: Hash,
  'arrow-up-down': ArrowUpDown,
  palette: Palette,
};

interface ExplorationPickerProps {
  onInsert: (type: ExplorationWidgetType, config: ExplorationWidgetConfig) => void;
  onClose: () => void;
  currentSlideImageUrl?: string | null;
  /** 'dark' for sim recording toolbar, 'light' for slide toolbar modal */
  variant?: 'dark' | 'light';
}

export default function ExplorationPicker({
  onInsert,
  onClose,
  currentSlideImageUrl,
  variant = 'dark',
}: ExplorationPickerProps) {
  const [step, setStep] = useState<PickerStep>('pick_type');
  const [selectedType, setSelectedType] = useState<ExplorationWidgetType | null>(null);

  // Number Line config
  const [nlMin, setNlMin] = useState(0);
  const [nlMax, setNlMax] = useState(10);
  const [nlTarget, setNlTarget] = useState(5);
  const [nlTolerance, setNlTolerance] = useState(0.5);

  // Slider Explore config
  const [slLabel, setSlLabel] = useState('');
  const [slMin, setSlMin] = useState(0);
  const [slMax, setSlMax] = useState(100);
  const [slStep, setSlStep] = useState(1);
  const [slStages, setSlStages] = useState([
    { threshold: 0, label_ar: '', label_en: 'Stage 1', emoji: '1' },
    { threshold: 50, label_ar: '', label_en: 'Stage 2', emoji: '2' },
    { threshold: 80, label_ar: '', label_en: 'Stage 3', emoji: '3' },
  ]);

  // Image Hotspot config
  const [ihImageUrl, setIhImageUrl] = useState(currentSlideImageUrl || '');
  const [ihHotspots, setIhHotspots] = useState([
    { x_pct: 30, y_pct: 40, label_ar: '', label_en: 'Label 1', emoji: '' },
    { x_pct: 70, y_pct: 60, label_ar: '', label_en: 'Label 2', emoji: '' },
  ]);

  // Letter Trace config
  const [ltText, setLtText] = useState('');
  const [ltScript, setLtScript] = useState<'ar' | 'en'>('ar');
  const [ltTolerance, setLtTolerance] = useState(25);

  // Counting Objects config
  const [coObjects, setCoObjects] = useState([
    { icon: '🍎', x_pct: 20, y_pct: 30, size: 48 },
    { icon: '🍎', x_pct: 50, y_pct: 50, size: 48 },
    { icon: '🍎', x_pct: 75, y_pct: 35, size: 48 },
  ]);

  // Sorting config
  const [sortCategories, setSortCategories] = useState([
    { label_en: 'Category A', label_ar: 'فئة أ', color: '#3b82f6' },
    { label_en: 'Category B', label_ar: 'فئة ب', color: '#ef4444' },
  ]);
  const [sortItems, setSortItems] = useState([
    { label_en: 'Item 1', label_ar: 'عنصر ١', correct_category: 0 },
    { label_en: 'Item 2', label_ar: 'عنصر ٢', correct_category: 1 },
    { label_en: 'Item 3', label_ar: 'عنصر ٣', correct_category: 0 },
  ]);

  // Color Picker config
  const [cpTargetColor, setCpTargetColor] = useState('#FF6B35');
  const [cpTolerance, setCpTolerance] = useState(30);

  const handleSelectType = (type: ExplorationWidgetType) => {
    setSelectedType(type);
    setStep('configure');
  };

  const handleConfirm = () => {
    if (!selectedType) return;

    switch (selectedType) {
      case 'number_line': {
        const config: NumberLineConfig = {
          type: 'number_line',
          min: nlMin,
          max: nlMax,
          target: nlTarget,
          tolerance: nlTolerance,
        };
        onInsert(selectedType, config);
        break;
      }
      case 'slider_explore': {
        const config: SliderExploreConfig = {
          type: 'slider_explore',
          label_ar: slLabel,
          label_en: slLabel || 'Explore',
          min: slMin,
          max: slMax,
          step: slStep,
          initial: slMin,
          stages: slStages,
        };
        onInsert(selectedType, config);
        break;
      }
      case 'image_hotspot': {
        const config: ImageHotspotConfig = {
          type: 'image_hotspot',
          image_url: ihImageUrl,
          hotspots: ihHotspots,
        };
        onInsert(selectedType, config);
        break;
      }
      case 'letter_trace': {
        const config: LetterTraceConfig = {
          type: 'letter_trace',
          text: ltText,
          script: ltScript,
          tolerance: ltTolerance,
        };
        onInsert(selectedType, config);
        break;
      }
      case 'counting_objects': {
        const config: CountingObjectsConfig = {
          type: 'counting_objects',
          objects: coObjects,
          target_count: coObjects.length,
        };
        onInsert(selectedType, config);
        break;
      }
      case 'sorting': {
        const config: SortingConfig = {
          type: 'sorting',
          categories: sortCategories,
          items: sortItems,
        };
        onInsert(selectedType, config);
        break;
      }
      case 'color_picker': {
        const config: ColorPickerConfig = {
          type: 'color_picker',
          target_color: cpTargetColor,
          tolerance: cpTolerance,
        };
        onInsert(selectedType, config);
        break;
      }
    }
  };

  const isDark = variant === 'dark';
  const inputCls = isDark
    ? 'w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-blue-400 focus:border-blue-400'
    : 'w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-blue-400 focus:border-blue-400';
  const labelCls = isDark
    ? 'block text-[10px] font-medium text-slate-400 mb-0.5'
    : 'block text-xs font-medium text-gray-600 mb-0.5';
  const containerCls = isDark
    ? 'w-72 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden'
    : 'w-full overflow-hidden';
  const headingCls = isDark ? 'text-xs font-semibold text-slate-300' : 'text-sm font-semibold text-gray-800';
  const btnBackCls = isDark ? 'flex-1 text-xs text-slate-400 hover:text-white py-1.5' : 'flex-1 text-xs text-gray-500 hover:text-gray-700 py-1.5';
  const addBtnCls = isDark ? 'text-[10px] text-blue-400 hover:text-blue-300 mt-1' : 'text-xs text-blue-600 hover:text-blue-500 mt-1';
  const cancelCls = isDark ? 'w-full text-center text-[10px] text-slate-500 hover:text-slate-300 pt-1' : 'w-full text-center text-xs text-gray-400 hover:text-gray-600 pt-1';
  const iconCls = isDark ? 'w-5 h-5 text-slate-400' : 'w-5 h-5 text-gray-500';

  return (
    <div className={containerCls}>
      {step === 'pick_type' && (
        <div className="p-3 space-y-1.5">
          <p className={`${headingCls} mb-2`}>{isDark ? 'Insert Exploration' : 'Choose Exploration Type'}</p>
          {EXPLORATION_WIDGET_OPTIONS.map((opt) => {
            const Icon = ICON_MAP[opt.icon];
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => handleSelectType(opt.type)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                  isDark ? 'hover:bg-slate-800' : 'hover:bg-blue-50 border border-transparent hover:border-blue-200'
                }`}
              >
                {Icon ? <Icon className={iconCls} /> : <span className={iconCls}>?</span>}
                <div>
                  <p className={`text-xs font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{opt.label_en}</p>
                  <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{opt.description_en}</p>
                </div>
              </button>
            );
          })}
          <button type="button" onClick={onClose} className={cancelCls}>
            Cancel
          </button>
        </div>
      )}

      {step === 'configure' && selectedType === 'number_line' && (
        <div className="p-3 space-y-2">
          <p className={headingCls}>Number Line</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Min</label>
              <input type="number" value={nlMin} onChange={(e) => setNlMin(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Max</label>
              <input type="number" value={nlMax} onChange={(e) => setNlMax(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Target</label>
              <input type="number" value={nlTarget} onChange={(e) => setNlTarget(Number(e.target.value))} step="any" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Tolerance</label>
              <input type="number" value={nlTolerance} onChange={(e) => setNlTolerance(Number(e.target.value))} step="any" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep('pick_type')} className={btnBackCls}>Back</button>
            <button type="button" onClick={handleConfirm} className="flex-1 rounded-lg bg-blue-600 text-white text-xs font-semibold py-1.5 hover:bg-blue-500">Add</button>
          </div>
        </div>
      )}

      {step === 'configure' && selectedType === 'slider_explore' && (
        <div className="p-3 space-y-2">
          <p className={headingCls}>Slider Explore</p>
          <div>
            <label className={labelCls}>Label</label>
            <input type="text" value={slLabel} onChange={(e) => setSlLabel(e.target.value)} placeholder="e.g. Temperature" className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>Min</label>
              <input type="number" value={slMin} onChange={(e) => setSlMin(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Max</label>
              <input type="number" value={slMax} onChange={(e) => setSlMax(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Step</label>
              <input type="number" value={slStep} onChange={(e) => setSlStep(Number(e.target.value))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Stages ({slStages.length})</label>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {slStages.map((s, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input type="number" value={s.threshold} onChange={(e) => { const next = [...slStages]; next[i] = { ...next[i], threshold: Number(e.target.value) }; setSlStages(next); }} className={`${inputCls} w-14`} placeholder="val" />
                  <input type="text" value={s.label_en} onChange={(e) => { const next = [...slStages]; next[i] = { ...next[i], label_en: e.target.value }; setSlStages(next); }} className={`${inputCls} flex-1`} placeholder="Label" />
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setSlStages([...slStages, { threshold: slMax, label_ar: '', label_en: '', emoji: '' }])} className={addBtnCls}>+ Add stage</button>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep('pick_type')} className={btnBackCls}>Back</button>
            <button type="button" onClick={handleConfirm} className="flex-1 rounded-lg bg-blue-600 text-white text-xs font-semibold py-1.5 hover:bg-blue-500">Add</button>
          </div>
        </div>
      )}

      {step === 'configure' && selectedType === 'image_hotspot' && (
        <div className="p-3 space-y-2">
          <p className={headingCls}>Image Hotspot</p>
          <div>
            <label className={labelCls}>Image URL</label>
            <input type="text" value={ihImageUrl} onChange={(e) => setIhImageUrl(e.target.value)} placeholder="https://..." className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Hotspots ({ihHotspots.length})</label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {ihHotspots.map((h, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <input type="number" value={h.x_pct} onChange={(e) => { const next = [...ihHotspots]; next[i] = { ...next[i], x_pct: Number(e.target.value) }; setIhHotspots(next); }} className={`${inputCls} w-12`} placeholder="X%" />
                  <input type="number" value={h.y_pct} onChange={(e) => { const next = [...ihHotspots]; next[i] = { ...next[i], y_pct: Number(e.target.value) }; setIhHotspots(next); }} className={`${inputCls} w-12`} placeholder="Y%" />
                  <input type="text" value={h.label_en} onChange={(e) => { const next = [...ihHotspots]; next[i] = { ...next[i], label_en: e.target.value }; setIhHotspots(next); }} className={`${inputCls} flex-1`} placeholder="Label" />
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setIhHotspots([...ihHotspots, { x_pct: 50, y_pct: 50, label_ar: '', label_en: '', emoji: '' }])} className={addBtnCls}>+ Add hotspot</button>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep('pick_type')} className={btnBackCls}>Back</button>
            <button type="button" onClick={handleConfirm} className="flex-1 rounded-lg bg-blue-600 text-white text-xs font-semibold py-1.5 hover:bg-blue-500">Add</button>
          </div>
        </div>
      )}

      {step === 'configure' && selectedType === 'letter_trace' && (
        <div className="p-3 space-y-2">
          <p className={headingCls}>Letter / Word Trace</p>
          <div>
            <label className={labelCls}>Text to trace</label>
            <input
              type="text"
              value={ltText}
              onChange={(e) => setLtText(e.target.value)}
              placeholder="e.g. Hello, ب, 123"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Script</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setLtScript('ar')}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  ltScript === 'ar'
                    ? 'bg-blue-600 text-white'
                    : isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600'
                }`}
              >
                العربية
              </button>
              <button
                type="button"
                onClick={() => setLtScript('en')}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  ltScript === 'en'
                    ? 'bg-blue-600 text-white'
                    : isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600'
                }`}
              >
                English
              </button>
            </div>
          </div>
          <div>
            <label className={labelCls}>Tolerance (smaller = stricter)</label>
            <input type="number" value={ltTolerance} onChange={(e) => setLtTolerance(Number(e.target.value))} className={inputCls} />
          </div>
          {ltText && (
            <div className="flex items-center justify-center py-2">
              <span className={`text-4xl font-bold ${isDark ? 'text-slate-500' : 'text-slate-300'} ${ltScript === 'ar' ? 'font-cairo' : ''}`}>
                {ltText}
              </span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep('pick_type')} className={btnBackCls}>Back</button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!ltText.trim()}
              className="flex-1 rounded-lg bg-blue-600 text-white text-xs font-semibold py-1.5 hover:bg-blue-500 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {step === 'configure' && selectedType === 'counting_objects' && (
        <div className="p-3 space-y-2">
          <p className={headingCls}>Counting Objects</p>
          <div>
            <label className={labelCls}>Objects ({coObjects.length})</label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {coObjects.map((obj, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <input type="text" value={obj.icon} onChange={(e) => { const next = [...coObjects]; next[i] = { ...next[i], icon: e.target.value }; setCoObjects(next); }} className={`${inputCls} w-12`} placeholder="Icon" />
                  <input type="number" value={obj.x_pct} onChange={(e) => { const next = [...coObjects]; next[i] = { ...next[i], x_pct: Number(e.target.value) }; setCoObjects(next); }} className={`${inputCls} w-14`} placeholder="X%" />
                  <input type="number" value={obj.y_pct} onChange={(e) => { const next = [...coObjects]; next[i] = { ...next[i], y_pct: Number(e.target.value) }; setCoObjects(next); }} className={`${inputCls} w-14`} placeholder="Y%" />
                  <button type="button" onClick={() => setCoObjects(coObjects.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 text-xs px-1">x</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setCoObjects([...coObjects, { icon: '🍎', x_pct: Math.round(Math.random() * 70 + 15), y_pct: Math.round(Math.random() * 60 + 20), size: 48 }])} className={addBtnCls}>+ Add object</button>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep('pick_type')} className={btnBackCls}>Back</button>
            <button type="button" onClick={handleConfirm} disabled={coObjects.length === 0} className="flex-1 rounded-lg bg-blue-600 text-white text-xs font-semibold py-1.5 hover:bg-blue-500 disabled:opacity-50">Add</button>
          </div>
        </div>
      )}

      {step === 'configure' && selectedType === 'sorting' && (
        <div className="p-3 space-y-2">
          <p className={headingCls}>Sorting / Categorization</p>
          <div>
            <label className={labelCls}>Categories ({sortCategories.length})</label>
            <div className="space-y-1 max-h-20 overflow-y-auto">
              {sortCategories.map((cat, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <input type="text" value={cat.label_en} onChange={(e) => { const next = [...sortCategories]; next[i] = { ...next[i], label_en: e.target.value }; setSortCategories(next); }} className={`${inputCls} flex-1`} placeholder="Name" />
                  <input type="color" value={cat.color} onChange={(e) => { const next = [...sortCategories]; next[i] = { ...next[i], color: e.target.value }; setSortCategories(next); }} className="w-8 h-6 rounded border cursor-pointer" />
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setSortCategories([...sortCategories, { label_en: '', label_ar: '', color: '#10b981' }])} className={addBtnCls}>+ Add category</button>
          </div>
          <div>
            <label className={labelCls}>Items ({sortItems.length})</label>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {sortItems.map((item, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <input type="text" value={item.label_en} onChange={(e) => { const next = [...sortItems]; next[i] = { ...next[i], label_en: e.target.value }; setSortItems(next); }} className={`${inputCls} flex-1`} placeholder="Item name" />
                  <select
                    value={item.correct_category}
                    onChange={(e) => { const next = [...sortItems]; next[i] = { ...next[i], correct_category: Number(e.target.value) }; setSortItems(next); }}
                    className={`${inputCls} w-20`}
                  >
                    {sortCategories.map((cat, ci) => (
                      <option key={ci} value={ci}>{cat.label_en || `Cat ${ci + 1}`}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setSortItems(sortItems.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 text-xs px-1">x</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setSortItems([...sortItems, { label_en: '', label_ar: '', correct_category: 0 }])} className={addBtnCls}>+ Add item</button>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep('pick_type')} className={btnBackCls}>Back</button>
            <button type="button" onClick={handleConfirm} disabled={sortItems.length === 0 || sortCategories.length < 2} className="flex-1 rounded-lg bg-blue-600 text-white text-xs font-semibold py-1.5 hover:bg-blue-500 disabled:opacity-50">Add</button>
          </div>
        </div>
      )}

      {step === 'configure' && selectedType === 'color_picker' && (
        <div className="p-3 space-y-2">
          <p className={headingCls}>Color Mixer</p>
          <div>
            <label className={labelCls}>Target Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={cpTargetColor}
                onChange={(e) => setCpTargetColor(e.target.value)}
                className="w-10 h-8 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={cpTargetColor}
                onChange={(e) => setCpTargetColor(e.target.value)}
                className={`${inputCls} flex-1`}
                placeholder="#FF6B35"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Tolerance (0-255, higher = easier)</label>
            <input type="number" value={cpTolerance} onChange={(e) => setCpTolerance(Number(e.target.value))} min={1} max={255} className={inputCls} />
          </div>
          <div className="flex items-center justify-center py-2">
            <div className="w-16 h-16 rounded-xl shadow-inner border" style={{ backgroundColor: cpTargetColor }} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep('pick_type')} className={btnBackCls}>Back</button>
            <button type="button" onClick={handleConfirm} className="flex-1 rounded-lg bg-blue-600 text-white text-xs font-semibold py-1.5 hover:bg-blue-500">Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
