'use client';

import { useState } from 'react';
import type { Slide, SlideType, SlideLayout, SlideTextSize } from '@/lib/slides.types';
import SlideInteractionFields from './SlideInteractionFields';
import { OWL_OPTIONS, OWL_PREFIX, isOwlImage, getOwlKey } from '@/lib/owl-illustrations';
import OwlImage from './OwlImage';

interface SlideEditPanelProps {
  slide: Slide;
  onUpdate: (updates: Partial<Slide>) => void;
  onDelete: () => void;
  canDelete?: boolean;
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

const hasBullets = (type: SlideType) => type === 'key_points' || type === 'summary';
const hasRevealItems = (type: SlideType) => type === 'question_answer';
const hasLayout = (type: SlideType) => type === 'content' || type === 'diagram_description' || type === 'key_points';
const supportsStudentInteraction = (type: SlideType) =>
  type === 'activity' || type === 'quiz_preview' || type === 'question_answer';

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#007229] focus:border-[#007229]';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

export default function SlideEditPanel({ slide, onUpdate, onDelete, canDelete = true }: SlideEditPanelProps) {
  const [bulletLang, setBulletLang] = useState<'ar' | 'en'>('ar');
  const [revealLang, setRevealLang] = useState<'ar' | 'en'>('ar');

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

  return (
    <div className="space-y-4 p-4 overflow-y-auto h-full">
      <h3 className="text-sm font-semibold text-gray-900">Edit Slide</h3>

      {/* Type */}
      <div>
        <label className={labelClass}>Slide Type</label>
        <select
          value={slide.type}
          onChange={(e) => handleTypeChange(e.target.value as SlideType)}
          className={inputClass}
        >
          {SLIDE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Layout picker */}
      {hasLayout(slide.type) && (
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

      {/* Image / Owl Illustration */}
      <div>
        <label className={labelClass}>Image</label>
        <div className="space-y-2">
          {/* URL input */}
          <div className="flex gap-1">
            <input
              value={isOwlImage(slide.image_url) ? '' : (slide.image_url || '')}
              onChange={(e) => onUpdate({ image_url: e.target.value || null })}
              placeholder="https://example.com/image.jpg"
              className={inputClass}
              disabled={isOwlImage(slide.image_url)}
            />
            {slide.image_url && (
              <button
                onClick={() => onUpdate({ image_url: null })}
                className="flex-shrink-0 px-2 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
                title="Remove image"
              >
                ✕
              </button>
            )}
          </div>

          {/* Image preview */}
          {slide.image_url && !isOwlImage(slide.image_url) && (
            <div className="relative w-full h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.image_url}
                alt="Slide image preview"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
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
                    onClick={() => onUpdate({ image_url: isSelected ? null : `${OWL_PREFIX}${owl.key}` })}
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
      <div>
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

      {/* Delete */}
      {canDelete ? (
        <button
          onClick={onDelete}
          className="w-full py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
        >
          Delete Slide
        </button>
      ) : (
        <p className="w-full py-2 text-center text-xs font-medium text-gray-400">
          Required slide — cannot be deleted
        </p>
      )}
    </div>
  );
}
