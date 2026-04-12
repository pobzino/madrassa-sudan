'use client';

import { useMemo, useState } from 'react';
import type { Slide } from '@/lib/slides.types';

interface Props {
  slide: Slide;
  lessonId: string;
  onUpdate: (updates: Partial<Slide>) => void;
}

/**
 * Builds a rich default prompt from slide context so teachers can often just
 * click Generate without typing anything.
 */
function buildDefaultPrompt(slide: Slide): string {
  const hint = slide.visual_hint?.trim();
  if (hint) return hint;

  const title = slide.title_en?.trim() || slide.title_ar?.trim();
  const focus = slide.idea_focus_en?.trim();
  const body = slide.body_en?.trim() || slide.body_ar?.trim();
  const firstSentence = body
    ? body.split(/(?<=[.!?])\s+/)[0]?.slice(0, 180)
    : '';

  const parts: string[] = [];
  if (title) parts.push(title);
  if (focus && focus !== title) parts.push(focus);
  if (firstSentence && firstSentence !== title) parts.push(firstSentence);
  return parts.join(' — ');
}

export default function SlideImageGenerator({ slide, lessonId, onUpdate }: Props) {
  const defaultPrompt = useMemo(() => buildDefaultPrompt(slide), [slide]);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function reset() {
    setPreviewUrl(null);
    setError(null);
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError('Please describe the image you want.');
      return;
    }
    setLoading(true);
    setError(null);
    setPreviewUrl(null);
    try {
      const res = await fetch('/api/teacher/slides/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          slideId: slide.id,
          prompt: prompt.trim(),
          slideTitle: slide.title_en || slide.title_ar || null,
          ideaFocus: slide.idea_focus_en || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setPreviewUrl(data.imageUrl as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  function handleUseImage() {
    if (!previewUrl) return;
    onUpdate({
      image_url: previewUrl,
      image_fit: 'contain',
      image_position_x: 50,
      image_position_y: 50,
    });
    setOpen(false);
    reset();
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-emerald-800"
      >
        <span>Generate with AI ✨</span>
        <span className="text-emerald-600">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-emerald-200 p-3">
          {/* Prompt */}
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-1">
              What should the image show?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. a sunny classroom with colorful books and a chalkboard"
              className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <p className="mt-1 text-[10px] text-gray-500">
              Pre-filled from the slide&apos;s visual hint. Edit freely.
            </p>
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? 'Generating… (20–40s)' : 'Generate'}
          </button>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
              {error}
            </div>
          )}

          {/* Preview */}
          {previewUrl && (
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-gray-600">Preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt=""
                className="w-full rounded-md border border-gray-200"
              />
              <button
                type="button"
                onClick={handleUseImage}
                className="w-full rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Use this image
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
