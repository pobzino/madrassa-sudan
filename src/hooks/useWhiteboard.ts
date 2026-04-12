'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import getStroke from 'perfect-freehand';

// ── Types ──

export type WhiteboardTool =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'rect'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticker'
  | 'laser';

export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export interface Stroke {
  id: string;
  tool: WhiteboardTool;
  color: string;
  width: number;
  // Pen strokes
  points: Point[];
  // Shapes
  start?: Point;
  end?: Point;
  // Text
  text?: string;
  position?: Point;
  fontSize?: number;
  // Sticker
  emoji?: string;
}

export interface WhiteboardSettings {
  tool: WhiteboardTool;
  color: string;
  strokeWidth: number;
  fontSize: number;
  selectedSticker: string;
}

// ── Event callback (for sim recorders) ──
//
// Tools that produce a recordable stroke event. Eraser/text/sticker/laser are
// handled separately because they don't participate in the start/point/end
// lifecycle.
export type WhiteboardEventTool =
  | 'pen'
  | 'highlighter'
  | 'rect'
  | 'circle'
  | 'line'
  | 'arrow';

export type WhiteboardEvent =
  | {
      type: 'stroke_start';
      id: string;
      tool: WhiteboardEventTool;
      color: string;
      width: number;
      point: Point;
    }
  | { type: 'stroke_point'; id: string; point: Point }
  | { type: 'stroke_end'; id: string; start?: Point; end?: Point }
  | {
      type: 'stroke_text';
      id: string;
      color: string;
      text: string;
      position: Point;
      fontSize: number;
    }
  | {
      type: 'stroke_sticker';
      id: string;
      emoji: string;
      position: Point;
      fontSize: number;
    }
  | { type: 'stroke_erase'; id: string }
  | { type: 'clear_strokes' };

export interface UseWhiteboardOptions {
  /** Optional observer called whenever the whiteboard state changes. */
  onEvent?: (event: WhiteboardEvent) => void;
}

function isEventTool(tool: WhiteboardTool): tool is WhiteboardEventTool {
  return (
    tool === 'pen' ||
    tool === 'highlighter' ||
    tool === 'rect' ||
    tool === 'circle' ||
    tool === 'line' ||
    tool === 'arrow'
  );
}

const DEFAULT_SETTINGS: WhiteboardSettings = {
  tool: 'pen',
  color: '#000000',
  strokeWidth: 4,
  fontSize: 32,
  selectedSticker: '⭐',
};

// ── Helpers ──

let nextId = 0;
function uid() {
  return `s-${Date.now()}-${nextId++}`;
}

/** Convert perfect-freehand output to an SVG-style path string for Path2D. */
function getSvgPathFromStroke(points: number[][]): string {
  if (!points.length) return '';

  const d: string[] = [];
  d.push(`M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`);

  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    d.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  d.push('Z');
  return d.join(' ');
}

function strokeBBox(stroke: Stroke): { x1: number; y1: number; x2: number; y2: number } {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;

  if ((stroke.tool === 'pen' || stroke.tool === 'highlighter') && stroke.points.length > 0) {
    for (const p of stroke.points) {
      if (p.x < x1) x1 = p.x;
      if (p.y < y1) y1 = p.y;
      if (p.x > x2) x2 = p.x;
      if (p.y > y2) y2 = p.y;
    }
    const pad = stroke.width * (stroke.tool === 'highlighter' ? 6 : 2);
    return { x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad };
  }

  if ((stroke.tool === 'rect' || stroke.tool === 'circle' || stroke.tool === 'line' || stroke.tool === 'arrow') && stroke.start && stroke.end) {
    x1 = Math.min(stroke.start.x, stroke.end.x);
    y1 = Math.min(stroke.start.y, stroke.end.y);
    x2 = Math.max(stroke.start.x, stroke.end.x);
    y2 = Math.max(stroke.start.y, stroke.end.y);
    const pad = stroke.width + 4;
    return { x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad };
  }

  if ((stroke.tool === 'text' || stroke.tool === 'sticker') && stroke.position) {
    const size = stroke.fontSize || 32;
    return {
      x1: stroke.position.x - 4,
      y1: stroke.position.y - size,
      x2: stroke.position.x + size * (stroke.text?.length || 1) * 0.6,
      y2: stroke.position.y + 8,
    };
  }

  return { x1: 0, y1: 0, x2: 0, y2: 0 };
}

// ── Rendering ──

export function renderStrokeToCtx(ctx: CanvasRenderingContext2D, stroke: Stroke, scaleX: number, scaleY: number) {
  ctx.save();

  if (stroke.tool === 'pen') {
    const outlinePoints = getStroke(
      stroke.points.map((p) => [p.x * scaleX, p.y * scaleY, p.pressure]),
      {
        size: stroke.width * Math.min(scaleX, scaleY),
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      }
    );
    const path = new Path2D(getSvgPathFromStroke(outlinePoints));
    ctx.fillStyle = stroke.color;
    ctx.fill(path);
  }

  if (stroke.tool === 'highlighter') {
    const outlinePoints = getStroke(
      stroke.points.map((p) => [p.x * scaleX, p.y * scaleY, p.pressure]),
      {
        size: stroke.width * 5 * Math.min(scaleX, scaleY),
        thinning: 0, // uniform width
        smoothing: 0.6,
        streamline: 0.6,
      }
    );
    const path = new Path2D(getSvgPathFromStroke(outlinePoints));
    ctx.globalAlpha = 0.35;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = stroke.color;
    ctx.fill(path);
  }

  if (stroke.tool === 'rect' && stroke.start && stroke.end) {
    const x = Math.min(stroke.start.x, stroke.end.x) * scaleX;
    const y = Math.min(stroke.start.y, stroke.end.y) * scaleY;
    const w = Math.abs(stroke.end.x - stroke.start.x) * scaleX;
    const h = Math.abs(stroke.end.y - stroke.start.y) * scaleY;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * Math.min(scaleX, scaleY);
    ctx.lineJoin = 'round';
    ctx.strokeRect(x, y, w, h);
  }

  if (stroke.tool === 'circle' && stroke.start && stroke.end) {
    const cx = ((stroke.start.x + stroke.end.x) / 2) * scaleX;
    const cy = ((stroke.start.y + stroke.end.y) / 2) * scaleY;
    const rx = (Math.abs(stroke.end.x - stroke.start.x) / 2) * scaleX;
    const ry = (Math.abs(stroke.end.y - stroke.start.y) / 2) * scaleY;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * Math.min(scaleX, scaleY);
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (stroke.tool === 'line' && stroke.start && stroke.end) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * Math.min(scaleX, scaleY);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.start.x * scaleX, stroke.start.y * scaleY);
    ctx.lineTo(stroke.end.x * scaleX, stroke.end.y * scaleY);
    ctx.stroke();
  }

  if (stroke.tool === 'arrow' && stroke.start && stroke.end) {
    const sx = stroke.start.x * scaleX;
    const sy = stroke.start.y * scaleY;
    const ex = stroke.end.x * scaleX;
    const ey = stroke.end.y * scaleY;
    const lineWidth = stroke.width * Math.min(scaleX, scaleY);
    const headLen = Math.max(lineWidth * 4, 14);
    const angle = Math.atan2(ey - sy, ex - sx);
    // Shorten the shaft slightly so it doesn't poke past the head
    const shaftEndX = ex - Math.cos(angle) * headLen * 0.6;
    const shaftEndY = ey - Math.sin(angle) * headLen * 0.6;

    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Shaft
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();

    // Arrowhead (filled triangle)
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(
      ex - headLen * Math.cos(angle - Math.PI / 6),
      ey - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      ex - headLen * Math.cos(angle + Math.PI / 6),
      ey - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  if (stroke.tool === 'text' && stroke.position && stroke.text) {
    const size = (stroke.fontSize || 32) * Math.min(scaleX, scaleY);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.fillStyle = stroke.color;
    ctx.textBaseline = 'top';
    ctx.fillText(stroke.text, stroke.position.x * scaleX, stroke.position.y * scaleY);
  }

  if (stroke.tool === 'sticker' && stroke.position && stroke.emoji) {
    const size = (stroke.fontSize || 48) * Math.min(scaleX, scaleY);
    ctx.font = `${size}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(stroke.emoji, stroke.position.x * scaleX, stroke.position.y * scaleY);
  }

  ctx.restore();
}

// ── Hook ──

export function useWhiteboard(options: UseWhiteboardOptions = {}) {
  const [settings, setSettings] = useState<WhiteboardSettings>(DEFAULT_SETTINGS);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const slideStrokesRef = useRef<Map<number, Stroke[]>>(new Map());
  const currentSlideRef = useRef(0);
  // Mirror `strokes` in a ref so stable callbacks can read the latest value
  // without needing to be recreated on every stroke change.
  const strokesRef = useRef<Stroke[]>(strokes);

  // Observer for sim recorders. Kept in a ref so callbacks stay stable.
  const onEventRef = useRef(options.onEvent);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    onEventRef.current = options.onEvent;
  }, [options.onEvent]);

  // Re-emit a fully-committed stroke as a creation sequence (used by redo).
  const emitStrokeCreation = useCallback((stroke: Stroke) => {
    const fire = onEventRef.current;
    if (!fire) return;
    if (stroke.tool === 'text' && stroke.text && stroke.position) {
      fire({
        type: 'stroke_text',
        id: stroke.id,
        color: stroke.color,
        text: stroke.text,
        position: stroke.position,
        fontSize: stroke.fontSize ?? 32,
      });
      return;
    }
    if (stroke.tool === 'sticker' && stroke.emoji && stroke.position) {
      fire({
        type: 'stroke_sticker',
        id: stroke.id,
        emoji: stroke.emoji,
        position: stroke.position,
        fontSize: stroke.fontSize ?? 48,
      });
      return;
    }
    if (!isEventTool(stroke.tool)) return;
    if (stroke.tool === 'pen' || stroke.tool === 'highlighter') {
      if (stroke.points.length === 0) return;
      fire({
        type: 'stroke_start',
        id: stroke.id,
        tool: stroke.tool,
        color: stroke.color,
        width: stroke.width,
        point: stroke.points[0],
      });
      for (let i = 1; i < stroke.points.length; i++) {
        fire({ type: 'stroke_point', id: stroke.id, point: stroke.points[i] });
      }
      fire({ type: 'stroke_end', id: stroke.id });
    } else if (stroke.start && stroke.end) {
      fire({
        type: 'stroke_start',
        id: stroke.id,
        tool: stroke.tool,
        color: stroke.color,
        width: stroke.width,
        point: stroke.start,
      });
      fire({
        type: 'stroke_end',
        id: stroke.id,
        start: stroke.start,
        end: stroke.end,
      });
    }
  }, []);

  // ── Tool setters ──

  const setTool = useCallback((tool: WhiteboardTool) => {
    setSettings((s) => ({ ...s, tool }));
  }, []);

  const setColor = useCallback((color: string) => {
    setSettings((s) => ({ ...s, color }));
  }, []);

  const setStrokeWidth = useCallback((strokeWidth: number) => {
    setSettings((s) => ({ ...s, strokeWidth }));
  }, []);

  const setFontSize = useCallback((fontSize: number) => {
    setSettings((s) => ({ ...s, fontSize }));
  }, []);

  const setSelectedSticker = useCallback((selectedSticker: string) => {
    setSettings((s) => ({ ...s, selectedSticker }));
  }, []);

  // ── Drawing operations ──

  const startStroke = useCallback(
    (point: Point) => {
      if (settings.tool === 'eraser') {
        // Erase strokes under the pointer
        const fire = onEventRef.current;
        setStrokes((prev) => {
          const remaining: Stroke[] = [];
          const erased: Stroke[] = [];
          for (const s of prev) {
            const bb = strokeBBox(s);
            if (point.x >= bb.x1 && point.x <= bb.x2 && point.y >= bb.y1 && point.y <= bb.y2) {
              erased.push(s);
            } else {
              remaining.push(s);
            }
          }
          if (erased.length > 0) {
            if (fire) {
              for (const s of erased) fire({ type: 'stroke_erase', id: s.id });
            }
            setRedoStack((r) => (r.length === 0 ? r : []));
          }
          return erased.length > 0 ? remaining : prev;
        });
        return;
      }

      if (settings.tool === 'text' || settings.tool === 'sticker') {
        // These are placed on click, handled separately
        return;
      }

      if (settings.tool === 'laser') {
        // Laser leaves no committed stroke — handled entirely by WhiteboardCanvas
        return;
      }

      const isFreehand = settings.tool === 'pen' || settings.tool === 'highlighter';
      const stroke: Stroke = {
        id: uid(),
        tool: settings.tool,
        color: settings.color,
        width: settings.strokeWidth,
        points: isFreehand ? [point] : [],
        start: !isFreehand ? point : undefined,
        end: !isFreehand ? point : undefined,
      };
      currentStrokeRef.current = stroke;

      const fire = onEventRef.current;
      if (fire && isEventTool(stroke.tool)) {
        fire({
          type: 'stroke_start',
          id: stroke.id,
          tool: stroke.tool,
          color: stroke.color,
          width: stroke.width,
          point,
        });
      }
    },
    [settings]
  );

  const continueStroke = useCallback(
    (point: Point) => {
      if (settings.tool === 'eraser') {
        // Continue erasing
        const fire = onEventRef.current;
        setStrokes((prev) => {
          const remaining: Stroke[] = [];
          const erased: Stroke[] = [];
          for (const s of prev) {
            const bb = strokeBBox(s);
            if (point.x >= bb.x1 && point.x <= bb.x2 && point.y >= bb.y1 && point.y <= bb.y2) {
              erased.push(s);
            } else {
              remaining.push(s);
            }
          }
          if (erased.length > 0 && fire) {
            for (const s of erased) fire({ type: 'stroke_erase', id: s.id });
          }
          return erased.length > 0 ? remaining : prev;
        });
        return;
      }

      const current = currentStrokeRef.current;
      if (!current) return;

      if (current.tool === 'pen' || current.tool === 'highlighter') {
        current.points.push(point);
        onEventRef.current?.({ type: 'stroke_point', id: current.id, point });
      } else {
        current.end = point;
      }
    },
    [settings.tool]
  );

  const endStroke = useCallback(() => {
    const current = currentStrokeRef.current;
    if (!current) return;
    currentStrokeRef.current = null;

    const fire = onEventRef.current;

    // Don't add empty strokes. We already fired `stroke_start` when the stroke
    // began, so rejected strokes must be cancelled with an explicit erase so
    // the sim replay stays consistent.
    const isFreehand = current.tool === 'pen' || current.tool === 'highlighter';
    if (isFreehand && current.points.length < 2) {
      fire?.({ type: 'stroke_erase', id: current.id });
      return;
    }
    if (!isFreehand && current.start && current.end) {
      const dx = Math.abs(current.end.x - current.start.x);
      const dy = Math.abs(current.end.y - current.start.y);
      if (dx < 3 && dy < 3) {
        fire?.({ type: 'stroke_erase', id: current.id });
        return;
      }
    }

    if (fire && isEventTool(current.tool)) {
      if (isFreehand) {
        fire({ type: 'stroke_end', id: current.id });
      } else if (current.start && current.end) {
        fire({
          type: 'stroke_end',
          id: current.id,
          start: current.start,
          end: current.end,
        });
      }
    }

    setStrokes((prev) => [...prev, current]);
    setRedoStack((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const addText = useCallback(
    (position: Point, text: string) => {
      if (!text.trim()) return;
      const stroke: Stroke = {
        id: uid(),
        tool: 'text',
        color: settings.color,
        width: settings.strokeWidth,
        points: [],
        text,
        position,
        fontSize: settings.fontSize,
      };
      setStrokes((prev) => [...prev, stroke]);
      setRedoStack((prev) => (prev.length === 0 ? prev : []));
      onEventRef.current?.({
        type: 'stroke_text',
        id: stroke.id,
        color: stroke.color,
        text,
        position,
        fontSize: stroke.fontSize ?? 32,
      });
    },
    [settings.color, settings.strokeWidth, settings.fontSize]
  );

  const addSticker = useCallback(
    (position: Point) => {
      const stroke: Stroke = {
        id: uid(),
        tool: 'sticker',
        color: '',
        width: 0,
        points: [],
        emoji: settings.selectedSticker,
        position,
        fontSize: 48,
      };
      setStrokes((prev) => [...prev, stroke]);
      setRedoStack((prev) => (prev.length === 0 ? prev : []));
      onEventRef.current?.({
        type: 'stroke_sticker',
        id: stroke.id,
        emoji: settings.selectedSticker,
        position,
        fontSize: stroke.fontSize ?? 48,
      });
    },
    [settings.selectedSticker]
  );

  // ── History ──

  const undo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      onEventRef.current?.({ type: 'stroke_erase', id: last.id });
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setStrokes((s) => [...s, last]);
      emitStrokeCreation(last);
      return prev.slice(0, -1);
    });
  }, [emitStrokeCreation]);

  const clear = useCallback(() => {
    setStrokes([]);
    setRedoStack((prev) => (prev.length === 0 ? prev : []));
    onEventRef.current?.({ type: 'clear_strokes' });
  }, []);

  // ── Per-slide persistence ──

  const setSlideIndex = useCallback((index: number) => {
    // No-op if we're already on this slide. Without this guard, the effect in
    // SlideEditor that calls setSlideIndex on every render would repeatedly
    // overwrite the live strokes with a stale snapshot (and clobber in-progress
    // drawings right after they're committed).
    if (index === currentSlideRef.current) return;

    // Save current slide strokes before switching.
    slideStrokesRef.current.set(currentSlideRef.current, strokesRef.current);
    currentSlideRef.current = index;
    const saved = slideStrokesRef.current.get(index) || [];
    setStrokes(saved);
    setRedoStack((prev) => (prev.length === 0 ? prev : []));
  }, []);

  // ── Rendering ──

  const renderToCanvas = useCallback(
    (ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, sourceW: number, sourceH: number) => {
      const scaleX = canvasW / sourceW;
      const scaleY = canvasH / sourceH;

      // Render committed strokes
      for (const stroke of strokes) {
        renderStrokeToCtx(ctx, stroke, scaleX, scaleY);
      }

      // Render in-progress stroke
      const current = currentStrokeRef.current;
      if (current) {
        renderStrokeToCtx(ctx, current, scaleX, scaleY);
      }
    },
    [strokes]
  );

  return {
    settings,
    strokes,
    currentStrokeRef,
    redoStack,
    setTool,
    setColor,
    setStrokeWidth,
    setFontSize,
    setSelectedSticker,
    startStroke,
    continueStroke,
    endStroke,
    addText,
    addSticker,
    undo,
    redo,
    clear,
    setSlideIndex,
    renderToCanvas,
  };
}

export type WhiteboardAPI = ReturnType<typeof useWhiteboard>;
