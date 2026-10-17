'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import getStroke from 'perfect-freehand';

// ── Types ──

export type WhiteboardTool =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'rect'
  | 'rounded_rect'
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'speech_bubble'
  | 'line'
  | 'arrow'
  | 'check'
  | 'cross'
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
  // Sticker: a `StickerKey` drawn from `STICKER_SHAPES`. Older recordings
  // carry a platform emoji here instead; those still render as text.
  emoji?: string;
}

// ── Stickers ──
//
// The stamps a teacher can drop on the board, drawn from the app's own icon
// paths (24-unit squares, same drawings as `AmalIcons`) so nothing on the
// canvas depends on the viewer's emoji font.
export const STICKER_KEYS = [
  'star',
  'heart',
  'check',
  'cross',
  'question',
  'tap',
  'thumbs_up',
  'dot_red',
  'dot_blue',
  'dot_green',
] as const;
export type StickerKey = (typeof STICKER_KEYS)[number];

export function isStickerKey(value: string): value is StickerKey {
  return (STICKER_KEYS as readonly string[]).includes(value);
}

interface StickerPath {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

const INK = '#1a1a1a';
const CIRCLE_D = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z';

export const STICKER_SHAPES: Record<StickerKey, StickerPath[]> = {
  star: [{ d: 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1L3.2 9.4l6.1-.8L12 3Z', fill: '#F59E0B', stroke: INK }],
  heart: [
    { d: 'M12 20.5 4.5 13A4.3 4.3 0 0 1 10.6 6.9L12 8.3l1.4-1.4A4.3 4.3 0 0 1 19.5 13L12 20.5Z', fill: '#D21034', stroke: '#D21034' },
    { d: 'M7.2 9.3c.4-1 1.1-1.6 2-1.9', stroke: '#fff', strokeWidth: 1.5 },
  ],
  check: [
    { d: CIRCLE_D, fill: '#007229' },
    { d: 'M7.5 12.5l3 3 6-6.5', stroke: '#fff', strokeWidth: 2.6 },
  ],
  cross: [
    { d: CIRCLE_D, fill: '#D21034' },
    { d: 'M8.5 8.5l7 7M15.5 8.5l-7 7', stroke: '#fff', strokeWidth: 2.6 },
  ],
  question: [
    { d: CIRCLE_D, fill: '#2563EB' },
    { d: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01', stroke: '#fff', strokeWidth: 2.4 },
  ],
  tap: [
    { d: 'M10 13V5.5a1.5 1.5 0 0 1 3 0V11l3.6.7a2.5 2.5 0 0 1 2 2.8l-.7 4.1A3 3 0 0 1 15 21h-3.4a4 4 0 0 1-3.2-1.6L5.6 15.6A1.4 1.4 0 0 1 7.8 14L10 16v-3Z', fill: '#FBD5A6', stroke: INK },
    { d: 'M8 4.5A4.5 4.5 0 0 1 14.5 3M7 7.5a3 3 0 0 1 1-2', stroke: '#F59E0B' },
  ],
  thumbs_up: [
    { d: 'M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Z', fill: '#007229', stroke: INK },
    { d: 'M7 11l4.2-7.6a1.8 1.8 0 0 1 3.3 1.3L13.8 9H19a2 2 0 0 1 2 2.4l-1.4 6.8A2 2 0 0 1 17.6 20H7v-9Z', fill: '#FBD5A6', stroke: INK },
  ],
  dot_red: [{ d: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16Z', fill: '#DC2626' }],
  dot_blue: [{ d: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16Z', fill: '#2563EB' }],
  dot_green: [{ d: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16Z', fill: '#16A34A' }],
};

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
  | 'rounded_rect'
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'speech_bubble'
  | 'line'
  | 'arrow'
  | 'check'
  | 'cross';

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
    tool === 'rounded_rect' ||
    tool === 'circle' ||
    tool === 'triangle' ||
    tool === 'diamond' ||
    tool === 'star' ||
    tool === 'speech_bubble' ||
    tool === 'line' ||
    tool === 'arrow' ||
    tool === 'check' ||
    tool === 'cross'
  );
}

const DEFAULT_SETTINGS: WhiteboardSettings = {
  tool: 'pen',
  color: '#000000',
  strokeWidth: 4,
  fontSize: 32,
  selectedSticker: 'star',
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

  if (isBoundedStrokeTool(stroke.tool) && stroke.start && stroke.end) {
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

function isBoundedStrokeTool(tool: WhiteboardTool): tool is Exclude<WhiteboardEventTool, 'pen' | 'highlighter'> {
  return isEventTool(tool) && tool !== 'pen' && tool !== 'highlighter';
}

function getScaledBounds(stroke: Stroke, scaleX: number, scaleY: number) {
  const start = stroke.start;
  const end = stroke.end;
  if (!start || !end) return null;
  const x = Math.min(start.x, end.x) * scaleX;
  const y = Math.min(start.y, end.y) * scaleY;
  const w = Math.abs(end.x - start.x) * scaleX;
  const h = Math.abs(end.y - start.y) * scaleY;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

function applyShapeStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  scaleX: number,
  scaleY: number
) {
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width * Math.min(scaleX, scaleY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  const outer = Math.max(radius, 1);
  const inner = outer * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
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

  if (isBoundedStrokeTool(stroke.tool) && stroke.start && stroke.end) {
    const bounds = getScaledBounds(stroke, scaleX, scaleY);
    if (bounds) {
      const { x, y, w, h, cx, cy } = bounds;
      const sx = stroke.start.x * scaleX;
      const sy = stroke.start.y * scaleY;
      const ex = stroke.end.x * scaleX;
      const ey = stroke.end.y * scaleY;
      applyShapeStroke(ctx, stroke, scaleX, scaleY);

      if (stroke.tool === 'rect') {
        ctx.strokeRect(x, y, w, h);
      }

      if (stroke.tool === 'rounded_rect') {
        roundedRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.18);
        ctx.stroke();
      }

      if (stroke.tool === 'circle') {
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(w / 2, 1), Math.max(h / 2, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (stroke.tool === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.stroke();
      }

      if (stroke.tool === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(x + w, cy);
        ctx.lineTo(cx, y + h);
        ctx.lineTo(x, cy);
        ctx.closePath();
        ctx.stroke();
      }

      if (stroke.tool === 'star') {
        starPath(ctx, cx, cy, Math.min(w, h) / 2);
        ctx.stroke();
      }

      if (stroke.tool === 'speech_bubble') {
        const tailHeight = Math.min(Math.max(h * 0.18, 6), Math.max(h - 1, 1));
        const bubbleHeight = Math.max(h - tailHeight, 1);
        roundedRectPath(ctx, x, y, w, bubbleHeight, Math.min(w, bubbleHeight) * 0.14);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + w * 0.25, y + bubbleHeight);
        ctx.lineTo(x + w * 0.18, y + h);
        ctx.lineTo(x + w * 0.42, y + bubbleHeight);
        ctx.stroke();
      }

      if (stroke.tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }

      if (stroke.tool === 'arrow') {
        const lineWidth = stroke.width * Math.min(scaleX, scaleY);
        const headLen = Math.max(lineWidth * 4, 14);
        const angle = Math.atan2(ey - sy, ex - sx);
        const shaftEndX = ex - Math.cos(angle) * headLen * 0.6;
        const shaftEndY = ey - Math.sin(angle) * headLen * 0.6;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

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

      if (stroke.tool === 'check') {
        ctx.beginPath();
        ctx.moveTo(x + w * 0.18, y + h * 0.55);
        ctx.lineTo(x + w * 0.42, y + h * 0.78);
        ctx.lineTo(x + w * 0.82, y + h * 0.25);
        ctx.stroke();
      }

      if (stroke.tool === 'cross') {
        ctx.beginPath();
        ctx.moveTo(x + w * 0.2, y + h * 0.2);
        ctx.lineTo(x + w * 0.8, y + h * 0.8);
        ctx.moveTo(x + w * 0.8, y + h * 0.2);
        ctx.lineTo(x + w * 0.2, y + h * 0.8);
        ctx.stroke();
      }
    }
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
    const x = stroke.position.x * scaleX;
    const y = stroke.position.y * scaleY;
    if (isStickerKey(stroke.emoji) && typeof Path2D !== 'undefined') {
      // Our own sticker drawing, scaled from its 24-unit box to the font size.
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 24, size / 24);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const part of STICKER_SHAPES[stroke.emoji]) {
        const path = new Path2D(part.d);
        if (part.fill) {
          ctx.fillStyle = part.fill;
          ctx.fill(path);
        }
        if (part.stroke) {
          ctx.strokeStyle = part.stroke;
          ctx.lineWidth = part.strokeWidth ?? 2;
          ctx.stroke(path);
        }
      }
      ctx.restore();
    } else {
      // Legacy recordings stored a platform emoji; keep replaying them as text.
      ctx.font = `${size}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(stroke.emoji, x, y);
    }
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
