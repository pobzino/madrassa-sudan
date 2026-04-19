'use client';

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import type {
  Slide,
  SlideType,
  SlideLayout,
  SlideTextSize,
  SlideTextAlign,
  SlideEntranceAnimation,
  SlideImageFit,
} from '@/lib/slides.types';
import { createClient } from '@/lib/supabase/client';
import SlideInteractionFields from './SlideInteractionFields';
import SlideImageGenerator from './SlideImageGenerator';
import { OWL_OPTIONS, OWL_PREFIX, isOwlImage, getOwlKey } from '@/lib/owl-illustrations';
import OwlImage from './OwlImage';
import { WIDGET_LABELS } from '@/lib/explorations/registry';
import SlideImage from './templates/SlideImage';

interface SlideEditPanelProps {
  slide: Slide;
  onUpdate: (updates: Partial<Slide>) => void;
  onDelete: () => void;
  canDelete?: boolean;
  canEditType?: boolean;
  lessonId?: string;
}

const SLIDE_TYPES: { value: SlideType; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'content', label: 'Content' },
  { value: 'key_points', label: 'Key Points' },
  { value: 'diagram_description', label: 'Diagram' },
  { value: 'activity', label: 'Activity' },
  { value: 'quiz_preview', label: 'Quiz Preview' },
  { value: 'question_answer', label: 'Q&A Reveal' },
  { value: 'summary', label: 'Summary' },
  { value: 'exploration', label: 'Exploration' },
  { value: 'whiteboard', label: 'Whiteboard' },
];

const LAYOUTS: { value: SlideLayout; label: string; icon: string }[] = [
  { value: 'default', label: 'Default', icon: '▣' },
  { value: 'image_left', label: 'Image Left', icon: '◧' },
  { value: 'image_right', label: 'Image Right', icon: '◨' },
  { value: 'image_top', label: 'Image Top', icon: '⬒' },
  { value: 'full_image', label: 'Full Image', icon: '▩' },
];

const TEXT_SIZES: { value: SlideTextSize; label: string }[] = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
  { value: 'xl', label: 'XL' },
];

const TEXT_ALIGNS: { value: SlideTextAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const IMAGE_FITS: { value: SlideImageFit; label: string; description: string }[] = [
  { value: 'contain', label: 'Contain', description: 'Show the full image' },
  { value: 'cover', label: 'Cover', description: 'Fill the frame, may crop' },
  { value: 'fill', label: 'Stretch', description: 'Force-fill the frame' },
];

const ENTRANCE_ANIMATIONS: { value: SlideEntranceAnimation; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide_up', label: 'Slide' },
  { value: 'pop', label: 'Pop' },
];

const hasBullets = (type: SlideType) => type === 'key_points' || type === 'summary';
const hasRevealItems = (type: SlideType) => type === 'question_answer';
const hasLayout = (type: SlideType) => type === 'content' || type === 'diagram_description' || type === 'key_points';
const supportsStudentInteraction = (type: SlideType) =>
  type === 'activity' || type === 'quiz_preview' || type === 'question_answer';
const supportsProgressiveReveal = (type: SlideType) =>
  type === 'key_points' || type === 'summary' || type === 'content';
/** Slide types that don't use standard content fields (title, body, image, notes, etc.) */
const isSpecialSlide = (type: SlideType) => type === 'exploration' || type === 'whiteboard';

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#007229] focus:border-[#007229]';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getSlideImageZoom(slide: Slide): number {
  return typeof slide.image_zoom === 'number' && Number.isFinite(slide.image_zoom)
    ? Math.max(0.5, Math.min(3, slide.image_zoom))
    : 1;
}

export default function SlideEditPanel({
  slide,
  onUpdate,
  onDelete,
  canDelete = true,
  canEditType = true,
  lessonId,
}: SlideEditPanelProps) {
  const supabase = createClient();
  const [bulletLang, setBulletLang] = useState<'ar' | 'en'>('ar');
  const [revealLang, setRevealLang] = useState<'ar' | 'en'>('ar');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagePositionX = slide.image_position_x ?? 50;
  const imagePositionY = slide.image_position_y ?? 50;
  const imageZoom = getSlideImageZoom(slide);

  const handleTextControlKeyDownCapture = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLElement)) {
      return;
    }

    const editable = event.target.closest('input, textarea, [contenteditable="true"]');
    if (!editable) {
      return;
    }

    event.stopPropagation();

    if (!(editable instanceof HTMLInputElement)) {
      return;
    }

    const allowsEnterDefault = [
      'button',
      'checkbox',
      'file',
      'radio',
      'range',
      'reset',
      'submit',
    ].includes(editable.type);

    if (!allowsEnterDefault) {
      event.preventDefault();
    }
  }, []);

  const updateImagePositionFromPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
      const y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
      onUpdate({ image_position_x: x, image_position_y: y });
    },
    [onUpdate]
  );

  const setImageAnchor = useCallback(
    (x: number, y: number) => {
      onUpdate({ image_position_x: x, image_position_y: y });
    },
    [onUpdate]
  );

  function handleTypeChange(newType: SlideType) {
    const updates: Partial<Slide> = { type: newType };
    // Auto-init bullets when switching to bullet-supporting type
    if (hasBullets(newType) && !slide.bullets_ar?.length) {
      const bodyLines = slide.body_ar.split('\n').filter(Boolean);
      updates.bullets_ar = bodyLines.length > 0 ? bodyLines : [''];
    }
    if (hasBullets(newType) && !slide.bullets_en?.length) {
      const bodyLines = slide.body_en.split('\n').filter(Boolean);
      updates.bullets_en = bodyLines.length > 0 ? bodyLines : [''];
    }
    // Auto-init reveal items when switching to question_answer type
    if (hasRevealItems(newType) && !slide.reveal_items_ar?.length) {
      const bodyLines = slide.body_ar.split('\n').filter(Boolean);
      updates.reveal_items_ar = bodyLines.length > 0 ? bodyLines : [''];
    }
    if (hasRevealItems(newType) && !slide.reveal_items_en?.length) {
      const bodyLines = slide.body_en.split('\n').filter(Boolean);
      updates.reveal_items_en = bodyLines.length > 0 ? bodyLines : [''];
    }
    onUpdate(updates);
  }

  // Bullet helpers
  const bullets = bulletLang === 'ar' ? (slide.bullets_ar || []) : (slide.bullets_en || []);
  const bulletKey = bulletLang === 'ar' ? 'bullets_ar' : 'bullets_en';

  function updateBullet(index: number, value: string) {
    const next = [...bullets];
    next[index] = value;
    onUpdate({ [bulletKey]: next });
  }

  function addBullet() {
    onUpdate({ [bulletKey]: [...bullets, ''] });
  }

  function removeBullet(index: number) {
    if (bullets.length <= 1) return;
    onUpdate({ [bulletKey]: bullets.filter((_, i) => i !== index) });
  }

  function moveBullet(from: number, to: number) {
    if (to < 0 || to >= bullets.length) return;
    const next = [...bullets];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onUpdate({ [bulletKey]: next });
  }

  // Reveal item helpers
  const revealItems = revealLang === 'ar' ? (slide.reveal_items_ar || []) : (slide.reveal_items_en || []);
  const revealKey = revealLang === 'ar' ? 'reveal_items_ar' : 'reveal_items_en';

  function updateRevealItem(index: number, value: string) {
    const next = [...revealItems];
    next[index] = value;
    onUpdate({ [revealKey]: next });
  }

  function addRevealItem() {
    onUpdate({ [revealKey]: [...revealItems, ''] });
  }

  function removeRevealItem(index: number) {
    if (revealItems.length <= 1) return;
    onUpdate({ [revealKey]: revealItems.filter((_, i) => i !== index) });
  }

  function moveRevealItem(from: number, to: number) {
    if (to < 0 || to >= revealItems.length) return;
    const next = [...revealItems];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onUpdate({ [revealKey]: next });
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setImageUploadError('Only image files are allowed.');
      event.target.value = '';
      return;
    }

    setImageUploading(true);
    setImageUploadError(null);

    try {
      const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : 'png';
      const safeExtension = extension && /^[a-z0-9]+$/.test(extension) ? extension : 'png';
      const path = `slides/${slide.id}/${crypto.randomUUID()}.${safeExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('lessons')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('lessons').getPublicUrl(path);
      onUpdate({
        image_url: data.publicUrl,
        image_fit: 'contain',
        image_position_x: 50,
        image_position_y: 50,
        image_zoom: 1,
      });
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setImageUploading(false);
      event.target.value = '';
    }
  }

  return (
    <div
      className="space-y-4 p-4 overflow-y-auto h-full"
      onKeyDownCapture={handleTextControlKeyDownCapture}
    >
      <h3 className="text-sm font-semibold text-gray-900">Edit Slide</h3>

      {slide.is_required && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This slide is part of the required lesson skeleton and cannot be deleted or changed into another type.
        </div>
      )}

      {/* Type */}
      <div>
        <label className={labelClass}>Slide Type</label>
        <select
          value={slide.type}
          onChange={(e) => handleTypeChange(e.target.value as SlideType)}
          disabled={!canEditType || isSpecialSlide(slide.type)}
          className={inputClass}
        >
          {SLIDE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Exploration info panel */}
      {slide.type === 'exploration' && slide.exploration_widget_type && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 space-y-2">
          <p className="text-xs font-semibold text-blue-800">Exploration Widget</p>
          <p className="text-sm font-medium text-blue-700">
            {WIDGET_LABELS[slide.exploration_widget_type]?.en || slide.exploration_widget_type}
          </p>
          <p className="text-[10px] text-blue-600/70">
            This slide contains an interactive exploration widget. To change the widget, delete this slide and add a new exploration.
          </p>
        </div>
      )}

      {/* Whiteboard info */}
      {slide.type === 'whiteboard' && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-3">
          <p className="text-xs font-semibold text-violet-800">Whiteboard</p>
          <p className="text-[10px] text-violet-600/70 mt-1">
            A blank drawing surface. Content is drawn live during recording.
          </p>
        </div>
      )}

      {/* Layout picker */}
      {!isSpecialSlide(slide.type) && hasLayout(slide.type) && (
        <div>
          <label className={labelClass}>Layout</label>
          <div className="grid grid-cols-5 gap-1">
            {LAYOUTS.map((l) => (
              <button
                key={l.value}
                onClick={() => onUpdate({ layout: l.value })}
                title={l.label}
                className={`flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg border text-xs transition-colors ${
                  (slide.layout || 'default') === l.value
                    ? 'border-[#007229] bg-green-50 text-[#007229]'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <span className="text-base leading-none">{l.icon}</span>
                <span className="text-[9px] leading-tight truncate w-full text-center">{l.label.split(' ').pop()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!isSpecialSlide(slide.type) && <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Title Size</label>
          <div className="grid grid-cols-4 gap-1">
            {TEXT_SIZES.map((size) => (
              <button
                key={`title-${size.value}`}
                onClick={() => onUpdate({ title_size: size.value })}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  (slide.title_size || 'md') === size.value
                    ? 'border-[#007229] bg-green-50 text-[#007229]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {size.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Content Size</label>
          <div className="grid grid-cols-4 gap-1">
            {TEXT_SIZES.map((size) => (
              <button
                key={`body-${size.value}`}
                onClick={() => onUpdate({ body_size: size.value })}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  (slide.body_size || 'md') === size.value
                    ? 'border-[#007229] bg-green-50 text-[#007229]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {size.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass}>Text Alignment</label>
        <div className="grid grid-cols-3 gap-1">
          {TEXT_ALIGNS.map((a) => (
            <button
              key={a.value}
              onClick={() => onUpdate({ text_align: a.value })}
              title={a.label}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                slide.text_align === a.value
                  ? 'border-[#007229] bg-green-50 text-[#007229]'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Entrance Animation */}
      <div>
        <label className={labelClass}>Entrance Animation</label>
        <div className="grid grid-cols-4 gap-1">
          {ENTRANCE_ANIMATIONS.map((a) => {
            const current = slide.entrance_animation || 'none';
            return (
              <button
                key={a.value}
                onClick={() => onUpdate({ entrance_animation: a.value })}
                title={a.label}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  current === a.value
                    ? 'border-[#007229] bg-green-50 text-[#007229]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] text-gray-400">
          Plays when this slide first appears in present mode or replay.
        </p>
      </div>

      {/* Progressive reveal toggle */}
      {supportsProgressiveReveal(slide.type) && (
        <div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!slide.progressive_reveal}
              onChange={(e) => onUpdate({ progressive_reveal: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#007229] focus:ring-[#007229]"
            />
            <span className="text-xs font-medium text-gray-700">
              Reveal one at a time
              <span className="block text-[10px] font-normal text-gray-400">
                {slide.type === 'content'
                  ? 'Body paragraphs (separated by blank lines) appear one at a time.'
                  : 'Bullets appear one at a time on tap/arrow.'}
              </span>
            </span>
          </label>
        </div>
      )}

      {/* Image / Owl Illustration */}
      <div>
        <label className={labelClass}>Image</label>
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageUploading}
              className="rounded-lg border border-[#007229] px-3 py-2 text-sm font-medium text-[#007229] transition-colors hover:bg-[#007229]/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {imageUploading ? 'Uploading…' : 'Upload image'}
            </button>
            {slide.image_url && (
              <button
                type="button"
                onClick={() => {
                  setImageUploadError(null);
                  onUpdate({
                    image_url: null,
                    image_fit: 'contain',
                    image_position_x: 50,
                    image_position_y: 50,
                    image_zoom: 1,
                  });
                }}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
              >
                Remove image
              </button>
            )}
          </div>

          <p className="text-[10px] text-gray-400">
            Upload an image file for this slide. External image URLs are disabled.
          </p>

          {imageUploadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {imageUploadError}
            </div>
          )}

          {/* AI image generator */}
          {lessonId && (
            <SlideImageGenerator slide={slide} lessonId={lessonId} onUpdate={onUpdate} />
          )}

          {/* Image preview */}
          {slide.image_url && !isOwlImage(slide.image_url) && (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div
                className="relative h-28 w-full cursor-crosshair overflow-hidden rounded-lg border border-gray-200 bg-white"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateImagePositionFromPointer(event);
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  updateImagePositionFromPointer(event);
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
                title="Drag to reposition the image focus"
              >
                <SlideImage
                  src={slide.image_url}
                  className="h-full w-full"
                  objectFit={slide.image_fit ?? 'contain'}
                  positionX={imagePositionX}
                  positionY={imagePositionY}
                  zoom={imageZoom}
                />
                <div
                  className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#007229] shadow"
                  style={{ left: `${imagePositionX}%`, top: `${imagePositionY}%` }}
                  aria-hidden
                />
              </div>

              <div>
                <label className={labelClass}>Image Fit</label>
                <div className="grid grid-cols-3 gap-2">
                  {IMAGE_FITS.map((fit) => {
                    const isActive = (slide.image_fit ?? 'contain') === fit.value;
                    return (
                      <button
                        key={fit.value}
                        type="button"
                        onClick={() => onUpdate({ image_fit: fit.value })}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                          isActive
                            ? 'border-[#007229] bg-green-50 text-[#007229]'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <span className="block text-xs font-semibold">{fit.label}</span>
                        <span className="block text-[10px] text-gray-400">{fit.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">Zoom</label>
                  <span className="font-mono text-[10px] text-gray-400">{Math.round(imageZoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={250}
                  step={5}
                  value={Math.round(imageZoom * 100)}
                  onChange={(e) => onUpdate({ image_zoom: Number(e.target.value) / 100 })}
                  className="w-full accent-[#007229]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>
                    Focus X <span className="text-[10px] text-gray-400">Left to right</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={imagePositionX}
                    onChange={(e) => onUpdate({ image_position_x: Number(e.target.value) })}
                    className="w-full accent-[#007229]"
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Focus Y <span className="text-[10px] text-gray-400">Top to bottom</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={imagePositionY}
                    onChange={(e) => onUpdate({ image_position_y: Number(e.target.value) })}
                    className="w-full accent-[#007229]"
                  />
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10px] font-medium text-gray-500">Quick position</p>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    ['Top left', 0, 0],
                    ['Top', 50, 0],
                    ['Top right', 100, 0],
                    ['Left', 0, 50],
                    ['Center', 50, 50],
                    ['Right', 100, 50],
                    ['Bottom left', 0, 100],
                    ['Bottom', 50, 100],
                    ['Bottom right', 100, 100],
                  ].map(([label, x, y]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setImageAnchor(x as number, y as number)}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-500 hover:border-[#007229]/40 hover:text-[#007229]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    image_fit: 'contain',
                    image_position_x: 50,
                    image_position_y: 50,
                    image_zoom: 1,
                  })
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Reset image placement
              </button>

              <p className="text-[10px] text-gray-400">
                Drag the preview to set the focal point. Use <span className="font-medium text-gray-500">Contain</span> to avoid cropping, <span className="font-medium text-gray-500">Cover</span> to fill neatly, or <span className="font-medium text-gray-500">Stretch</span> when you need the image to force-fit the frame.
              </p>
            </div>
          )}

          {/* Owl preview */}
          {isOwlImage(slide.image_url) && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50">
              <div className="w-10 h-10 flex-shrink-0">
                <OwlImage url={slide.image_url!} className="w-full h-full" />
              </div>
              <span className="text-xs font-medium text-emerald-700">
                {OWL_OPTIONS.find(o => o.key === getOwlKey(slide.image_url!))?.label || 'Owl'} illustration
              </span>
            </div>
          )}

          {/* Owl picker grid */}
          <div>
            <p className="text-[10px] text-gray-400 mb-1.5">Or pick an illustration:</p>
            <div className="grid grid-cols-6 gap-1">
              {OWL_OPTIONS.map((owl) => {
                const isSelected = slide.image_url === `${OWL_PREFIX}${owl.key}`;
                return (
                  <button
                    key={owl.key}
                    type="button"
                    onClick={() =>
                      onUpdate({
                        image_url: isSelected ? null : `${OWL_PREFIX}${owl.key}`,
                        image_fit: 'contain',
                        image_position_x: 50,
                        image_position_y: 50,
                        image_zoom: 1,
                      })
                    }
                    className={`relative w-full aspect-square rounded-lg border-2 transition-all flex items-center justify-center ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-300'
                        : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    title={owl.label}
                  >
                    <OwlImage url={`${OWL_PREFIX}${owl.key}`} className="w-full h-full p-0.5" />
                    {isSelected && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center">
                        <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {supportsStudentInteraction(slide.type) && (
        <SlideInteractionFields slide={slide} onUpdate={onUpdate} />
      )}

      {/* Title AR */}
      <div>
        <label className={labelClass}>Title (Arabic)</label>
        <input
          dir="rtl"
          value={slide.title_ar}
          onChange={(e) => onUpdate({ title_ar: e.target.value })}
          className={`${inputClass} font-cairo`}
        />
      </div>

      {/* Title EN */}
      <div>
        <label className={labelClass}>Title (English)</label>
        <input
          value={slide.title_en}
          onChange={(e) => onUpdate({ title_en: e.target.value })}
          className={inputClass}
        />
      </div>

      {/* Bullet editor for key_points / summary */}
      {hasBullets(slide.type) && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelClass}>Bullets</label>
            <div className="flex gap-1">
              <button
                onClick={() => setBulletLang('ar')}
                className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                  bulletLang === 'ar' ? 'bg-[#007229] text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                عربي
              </button>
              <button
                onClick={() => setBulletLang('en')}
                className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                  bulletLang === 'en' ? 'bg-[#007229] text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                EN
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {bullets.map((bullet, i) => (
              <div key={i} className="flex items-center gap-1">
                {/* Reorder buttons */}
                <div className="flex flex-col flex-shrink-0">
                  <button
                    onClick={() => moveBullet(i, i - 1)}
                    disabled={i === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-[10px] leading-none"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveBullet(i, i + 1)}
                    disabled={i === bullets.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-[10px] leading-none"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <input
                  dir={bulletLang === 'ar' ? 'rtl' : 'ltr'}
                  value={bullet}
                  onChange={(e) => updateBullet(i, e.target.value)}
                  className={`flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-[#007229] focus:border-[#007229] ${
                    bulletLang === 'ar' ? 'font-cairo' : ''
                  }`}
                  placeholder={`Bullet ${i + 1}`}
                />
                <button
                  onClick={() => removeBullet(i)}
                  disabled={bullets.length <= 1}
                  className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addBullet}
            className="mt-1.5 w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
          >
            + Add Bullet
          </button>
        </div>
      )}

      {/* Reveal items editor for question_answer */}
      {hasRevealItems(slide.type) && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelClass}>Reveal Items</label>
            <div className="flex gap-1">
              <button
                onClick={() => setRevealLang('ar')}
                className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                  revealLang === 'ar' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                عربي
              </button>
              <button
                onClick={() => setRevealLang('en')}
                className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                  revealLang === 'en' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                EN
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {revealItems.map((item, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="flex flex-col flex-shrink-0">
                  <button
                    onClick={() => moveRevealItem(i, i - 1)}
                    disabled={i === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-[10px] leading-none"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveRevealItem(i, i + 1)}
                    disabled={i === revealItems.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-[10px] leading-none"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <input
                  dir={revealLang === 'ar' ? 'rtl' : 'ltr'}
                  value={item}
                  onChange={(e) => updateRevealItem(i, e.target.value)}
                  className={`flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                    revealLang === 'ar' ? 'font-cairo' : ''
                  }`}
                  placeholder={`Answer ${i + 1}`}
                />
                <button
                  onClick={() => removeRevealItem(i)}
                  disabled={revealItems.length <= 1}
                  className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addRevealItem}
            className="mt-1.5 w-full py-1.5 text-xs font-medium text-teal-600 border border-dashed border-teal-400/30 rounded-lg hover:bg-teal-50 transition-colors"
          >
            + Add Reveal Item
          </button>
        </div>
      )}

      {/* Body AR — hide for bullet types since bullets replace body */}
      {!hasBullets(slide.type) && (
        <div>
          <label className={labelClass}>Body (Arabic)</label>
          <textarea
            dir="rtl"
            value={slide.body_ar}
            onChange={(e) => onUpdate({ body_ar: e.target.value })}
            rows={3}
            className={`${inputClass} font-cairo`}
          />
        </div>
      )}

      {/* Body EN */}
      {!hasBullets(slide.type) && (
        <div>
          <label className={labelClass}>Body (English)</label>
          <textarea
            value={slide.body_en}
            onChange={(e) => onUpdate({ body_en: e.target.value })}
            rows={3}
            className={inputClass}
          />
        </div>
      )}

      {/* Speaker Notes AR */}
      <div data-tour="speaker-notes">
        <label className={labelClass}>Speaker Notes (Arabic)</label>
        <textarea
          dir="rtl"
          value={slide.speaker_notes_ar}
          onChange={(e) => onUpdate({ speaker_notes_ar: e.target.value })}
          rows={3}
          className={`${inputClass} font-cairo`}
        />
      </div>

      {/* Speaker Notes EN */}
      <div>
        <label className={labelClass}>Speaker Notes (English)</label>
        <textarea
          value={slide.speaker_notes_en}
          onChange={(e) => onUpdate({ speaker_notes_en: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </div>

      {/* Visual Hint */}
      <div>
        <label className={labelClass}>Visual Hint</label>
        <textarea
          value={slide.visual_hint}
          onChange={(e) => onUpdate({ visual_hint: e.target.value })}
          rows={2}
          className={inputClass}
          placeholder="Description of ideal image or diagram..."
        />
      </div>
      </>}

      {/* Delete */}
      <button
        onClick={onDelete}
        disabled={!canDelete}
        className="w-full py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
      >
        {canDelete ? 'Delete Slide' : 'Required Slide'}
      </button>
    </div>
  );
}
