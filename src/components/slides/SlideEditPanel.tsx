'use client';

import { useState } from 'react';
import type { Slide, SlideType, SlideLayout, SlideTextSize, SlideInteractionType } from '@/lib/slides.types';

interface SlideEditPanelProps {
  slide: Slide;
  onUpdate: (updates: Partial<Slide>) => void;
  onDelete: () => void;
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

const INTERACTION_TYPES: Array<{ value: SlideInteractionType; label: string }> = [
  { value: 'choose_correct', label: 'Choose Correct' },
  { value: 'true_false', label: 'True / False' },
  { value: 'tap_to_count', label: 'Tap to Count' },
];

const hasBullets = (type: SlideType) => type === 'key_points' || type === 'summary';
const hasRevealItems = (type: SlideType) => type === 'question_answer';
const hasLayout = (type: SlideType) => type === 'content' || type === 'diagram_description' || type === 'key_points';
const supportsStudentInteraction = (type: SlideType) =>
  type === 'activity' || type === 'quiz_preview' || type === 'question_answer';

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#007229] focus:border-[#007229]';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

export default function SlideEditPanel({ slide, onUpdate, onDelete }: SlideEditPanelProps) {
  const [bulletLang, setBulletLang] = useState<'ar' | 'en'>('ar');
  const [revealLang, setRevealLang] = useState<'ar' | 'en'>('ar');
  const [interactionOptionLang, setInteractionOptionLang] = useState<'ar' | 'en'>('ar');

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

  const interactionOptions =
    interactionOptionLang === 'ar'
      ? (slide.interaction_options_ar || [])
      : (slide.interaction_options_en || []);
  const interactionOptionsKey =
    interactionOptionLang === 'ar' ? 'interaction_options_ar' : 'interaction_options_en';

  function handleInteractionTypeChange(nextType: SlideInteractionType | '') {
    if (!nextType) {
      onUpdate({
        interaction_type: null,
        interaction_prompt_ar: null,
        interaction_prompt_en: null,
        interaction_options_ar: null,
        interaction_options_en: null,
        interaction_correct_index: null,
        interaction_true_false_answer: null,
        interaction_count_target: null,
        interaction_visual_emoji: null,
      });
      return;
    }

    const updates: Partial<Slide> = {
      interaction_type: nextType,
      interaction_prompt_ar: slide.interaction_prompt_ar ?? slide.body_ar ?? '',
      interaction_prompt_en: slide.interaction_prompt_en ?? slide.body_en ?? '',
    };

    if (nextType === 'choose_correct') {
      updates.interaction_options_ar = slide.interaction_options_ar?.length
        ? slide.interaction_options_ar
        : ['', '', ''];
      updates.interaction_options_en = slide.interaction_options_en?.length
        ? slide.interaction_options_en
        : ['', '', ''];
      updates.interaction_correct_index = slide.interaction_correct_index ?? 0;
      updates.interaction_true_false_answer = null;
      updates.interaction_count_target = null;
      updates.interaction_visual_emoji = null;
    }

    if (nextType === 'true_false') {
      updates.interaction_options_ar = null;
      updates.interaction_options_en = null;
      updates.interaction_correct_index = null;
      updates.interaction_true_false_answer = slide.interaction_true_false_answer ?? true;
      updates.interaction_count_target = null;
      updates.interaction_visual_emoji = null;
    }

    if (nextType === 'tap_to_count') {
      updates.interaction_options_ar = null;
      updates.interaction_options_en = null;
      updates.interaction_correct_index = null;
      updates.interaction_true_false_answer = null;
      updates.interaction_count_target = slide.interaction_count_target ?? 5;
      updates.interaction_visual_emoji = slide.interaction_visual_emoji ?? '🍎';
    }

    onUpdate(updates);
  }

  function updateInteractionOption(index: number, value: string) {
    const next = [...interactionOptions];
    next[index] = value;
    onUpdate({ [interactionOptionsKey]: next } as Partial<Slide>);
  }

  function addInteractionOption() {
    onUpdate({ [interactionOptionsKey]: [...interactionOptions, ''] } as Partial<Slide>);
  }

  function removeInteractionOption(index: number) {
    if (interactionOptions.length <= 2) return;
    onUpdate({
      [interactionOptionsKey]: interactionOptions.filter((_, itemIndex) => itemIndex !== index),
    } as Partial<Slide>);

    if (slide.interaction_correct_index != null && slide.interaction_correct_index >= interactionOptions.length - 1) {
      onUpdate({ interaction_correct_index: Math.max(0, interactionOptions.length - 2) });
    }
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

      {/* Image URL */}
      <div>
        <label className={labelClass}>Image URL</label>
        <div className="space-y-2">
          <div className="flex gap-1">
            <input
              value={slide.image_url || ''}
              onChange={(e) => onUpdate({ image_url: e.target.value || null })}
              placeholder="https://example.com/image.jpg"
              className={inputClass}
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
          {slide.image_url && (
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
        </div>
      </div>

      {supportsStudentInteraction(slide.type) && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
          <div>
            <label className={labelClass}>Lesson Interaction</label>
            <select
              value={slide.interaction_type || ''}
              onChange={(e) => handleInteractionTypeChange(e.target.value as SlideInteractionType | '')}
              className={inputClass}
            >
              <option value="">None</option>
              {INTERACTION_TYPES.map((interactionType) => (
                <option key={interactionType.value} value={interactionType.value}>
                  {interactionType.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Trigger Time (seconds)</label>
            <input
              type="number"
              min={0}
              value={slide.timestamp_seconds ?? ''}
              onChange={(e) => onUpdate({
                timestamp_seconds: e.target.value === '' ? null : Number(e.target.value),
              })}
              placeholder="Auto-place if blank"
              className={inputClass}
            />
          </div>

          {slide.interaction_type && (
            <>
              <div>
                <label className={labelClass}>Prompt (Arabic)</label>
                <textarea
                  dir="rtl"
                  value={slide.interaction_prompt_ar || ''}
                  onChange={(e) => onUpdate({ interaction_prompt_ar: e.target.value })}
                  rows={2}
                  className={`${inputClass} font-cairo`}
                  placeholder="Defaults to slide body if left blank"
                />
              </div>

              <div>
                <label className={labelClass}>Prompt (English)</label>
                <textarea
                  value={slide.interaction_prompt_en || ''}
                  onChange={(e) => onUpdate({ interaction_prompt_en: e.target.value })}
                  rows={2}
                  className={inputClass}
                  placeholder="Defaults to slide body if left blank"
                />
              </div>
            </>
          )}

          {slide.interaction_type === 'choose_correct' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelClass}>Answer Choices</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setInteractionOptionLang('ar')}
                      className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                        interactionOptionLang === 'ar' ? 'bg-[#007229] text-white' : 'bg-white text-gray-600 border border-gray-200'
                      }`}
                    >
                      عربي
                    </button>
                    <button
                      onClick={() => setInteractionOptionLang('en')}
                      className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                        interactionOptionLang === 'en' ? 'bg-[#007229] text-white' : 'bg-white text-gray-600 border border-gray-200'
                      }`}
                    >
                      EN
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {interactionOptions.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <button
                        onClick={() => onUpdate({ interaction_correct_index: index })}
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${
                          slide.interaction_correct_index === index
                            ? 'border-[#007229] bg-[#007229] text-white'
                            : 'border-gray-300 text-gray-500 bg-white'
                        }`}
                        title="Mark correct choice"
                      >
                        {index + 1}
                      </button>
                      <input
                        dir={interactionOptionLang === 'ar' ? 'rtl' : 'ltr'}
                        value={option}
                        onChange={(e) => updateInteractionOption(index, e.target.value)}
                        className={`${inputClass} ${interactionOptionLang === 'ar' ? 'font-cairo' : ''}`}
                        placeholder={`Choice ${index + 1}`}
                      />
                      <button
                        onClick={() => removeInteractionOption(index)}
                        disabled={interactionOptions.length <= 2}
                        className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
                        title="Remove choice"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addInteractionOption}
                  className="mt-1.5 w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
                >
                  + Add Choice
                </button>
              </div>
            </>
          )}

          {slide.interaction_type === 'true_false' && (
            <div>
              <label className={labelClass}>Correct Answer</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onUpdate({ interaction_true_false_answer: true })}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    slide.interaction_true_false_answer === true
                      ? 'border-[#007229] bg-green-50 text-[#007229]'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  True
                </button>
                <button
                  onClick={() => onUpdate({ interaction_true_false_answer: false })}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    slide.interaction_true_false_answer === false
                      ? 'border-[#D21034] bg-red-50 text-[#D21034]'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  False
                </button>
              </div>
            </div>
          )}

          {slide.interaction_type === 'tap_to_count' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Target Count</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={slide.interaction_count_target ?? 5}
                  onChange={(e) => onUpdate({ interaction_count_target: Number(e.target.value) || 1 })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Visual Token</label>
                <input
                  value={slide.interaction_visual_emoji || '🍎'}
                  onChange={(e) => onUpdate({ interaction_visual_emoji: e.target.value })}
                  className={inputClass}
                  placeholder="🍎"
                />
              </div>
            </div>
          )}
        </div>
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
      <button
        onClick={onDelete}
        className="w-full py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
      >
        Delete Slide
      </button>
    </div>
  );
}
