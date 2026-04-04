'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CutRegion } from '@/lib/ffmpeg-editor';

export interface UseVideoEditorOptions {
  blob: Blob;
  duration: number;
}

export interface UseVideoEditorReturn {
  trimStart: number;
  trimEnd: number;
  cutRegions: CutRegion[];
  isProcessing: boolean;
  processProgress: number;
  processError: string | null;
  keptDuration: number;
  hasEdits: boolean;
  setTrimStart: (v: number) => void;
  setTrimEnd: (v: number) => void;
  addCutRegion: (time: number) => void;
  removeCutRegion: (index: number) => void;
  updateCutRegion: (index: number, region: CutRegion) => void;
  process: () => Promise<Blob | null>;
  reset: () => void;
}

export function useVideoEditor({ blob, duration }: UseVideoEditorOptions): UseVideoEditorReturn {
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(duration);
  const [cutRegions, setCutRegions] = useState<CutRegion[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processError, setProcessError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  // Update trimEnd when duration changes (initial load)
  useEffect(() => {
    setTrimEnd((prev) => (prev === 0 || prev > duration ? duration : prev));
  }, [duration]);

  const hasEdits = trimStart > 0.1 || trimEnd < duration - 0.1 || cutRegions.length > 0;

  const keptDuration = (() => {
    let kept = trimEnd - trimStart;
    for (const cut of cutRegions) {
      const overlapStart = Math.max(cut.start, trimStart);
      const overlapEnd = Math.min(cut.end, trimEnd);
      if (overlapEnd > overlapStart) {
        kept -= overlapEnd - overlapStart;
      }
    }
    return Math.max(0, kept);
  })();

  const addCutRegion = useCallback((time: number) => {
    // Default 2s cut region centered on the given time
    const halfWidth = 1;
    const start = Math.max(trimStart, time - halfWidth);
    const end = Math.min(trimEnd, time + halfWidth);
    if (end - start < 0.2) return;
    setCutRegions((prev) => [...prev, { start, end }]);
  }, [trimStart, trimEnd]);

  const removeCutRegion = useCallback((index: number) => {
    setCutRegions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateCutRegion = useCallback((index: number, region: CutRegion) => {
    setCutRegions((prev) => prev.map((r, i) => (i === index ? region : r)));
  }, []);

  const process = useCallback(async (): Promise<Blob | null> => {
    setIsProcessing(true);
    setProcessProgress(0);
    setProcessError(null);
    cancelledRef.current = false;

    try {
      // Dynamic import to avoid loading ffmpeg.wasm until needed
      const { trimAndCut } = await import('@/lib/ffmpeg-editor');

      const result = await trimAndCut(
        blob,
        trimStart,
        trimEnd,
        cutRegions,
        (progress) => {
          if (!cancelledRef.current) {
            setProcessProgress(Math.round(progress * 100));
          }
        }
      );

      if (cancelledRef.current) return null;

      setIsProcessing(false);
      setProcessProgress(100);
      return result;
    } catch (err) {
      if (cancelledRef.current) return null;
      const message = err instanceof Error ? err.message : 'Video processing failed.';
      setProcessError(message);
      setIsProcessing(false);
      return null;
    }
  }, [blob, trimStart, trimEnd, cutRegions]);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setTrimStart(0);
    setTrimEnd(duration);
    setCutRegions([]);
    setIsProcessing(false);
    setProcessProgress(0);
    setProcessError(null);
  }, [duration]);

  return {
    trimStart,
    trimEnd,
    cutRegions,
    isProcessing,
    processProgress,
    processError,
    keptDuration,
    hasEdits,
    setTrimStart,
    setTrimEnd,
    addCutRegion,
    removeCutRegion,
    updateCutRegion,
    process,
    reset,
  };
}
