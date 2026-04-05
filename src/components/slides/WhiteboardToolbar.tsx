'use client';

import { useState } from 'react';
import {
  Pencil,
  Highlighter,
  Square,
  Circle,
  Minus,
  MoveRight,
  Zap,
  Type,
  Smile,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
} from 'lucide-react';
import type { WhiteboardAPI, WhiteboardTool } from '@/hooks/useWhiteboard';

interface WhiteboardToolbarProps {
  whiteboard: WhiteboardAPI;
}

const COLORS = [
  '#000000', // black
  '#DC2626', // red
  '#2563EB', // blue
  '#16A34A', // green
  '#EAB308', // yellow
  '#EA580C', // orange
  '#9333EA', // purple
  '#FFFFFF', // white
];

const STICKERS = ['⭐', '❤️', '✅', '❌', '❓', '👆', '👍', '🔴', '🔵', '🟢'];

const WIDTHS = [2, 4, 8];

const TOOLS: { tool: WhiteboardTool; icon: typeof Pencil; label: string }[] = [
  { tool: 'pen', icon: Pencil, label: 'Pen' },
  { tool: 'highlighter', icon: Highlighter, label: 'Highlighter' },
  { tool: 'rect', icon: Square, label: 'Rectangle' },
  { tool: 'circle', icon: Circle, label: 'Circle' },
  { tool: 'line', icon: Minus, label: 'Line' },
  { tool: 'arrow', icon: MoveRight, label: 'Arrow' },
  { tool: 'laser', icon: Zap, label: 'Laser pointer' },
  { tool: 'text', icon: Type, label: 'Text' },
  { tool: 'sticker', icon: Smile, label: 'Sticker' },
  { tool: 'eraser', icon: Eraser, label: 'Eraser' },
];

export default function WhiteboardToolbar({ whiteboard }: WhiteboardToolbarProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { settings } = whiteboard;

  const handleClear = () => {
    if (showClearConfirm) {
      whiteboard.clear();
      setShowClearConfirm(false);
    } else {
      setShowClearConfirm(true);
      setTimeout(() => setShowClearConfirm(false), 3000);
    }
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-2">
      {/* Sticker picker */}
      {settings.tool === 'sticker' && (
        <div className="flex gap-1 bg-black/80 backdrop-blur-md rounded-2xl px-3 py-2">
          {STICKERS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => whiteboard.setSelectedSticker(emoji)}
              className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${
                settings.selectedSticker === emoji
                  ? 'bg-white/30 scale-110'
                  : 'hover:bg-white/15'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Main toolbar */}
      <div className="flex items-center gap-1 bg-black/80 backdrop-blur-md rounded-2xl px-3 py-2 shadow-2xl">
        {/* Drawing tools */}
        {TOOLS.map(({ tool, icon: Icon, label }) => (
          <button
            key={tool}
            onClick={() => whiteboard.setTool(tool)}
            title={label}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              settings.tool === tool
                ? 'bg-white/30 text-white scale-105'
                : 'text-white/70 hover:bg-white/15 hover:text-white'
            }`}
          >
            <Icon className="w-[18px] h-[18px]" />
          </button>
        ))}

        {/* Separator */}
        <div className="w-px h-6 bg-white/20 mx-1" />

        {/* Color palette */}
        {COLORS.map((color) => (
          <button
            key={color}
            onClick={() => whiteboard.setColor(color)}
            title={color}
            className={`w-6 h-6 rounded-full border-2 transition-all ${
              settings.color === color
                ? 'border-white scale-110'
                : 'border-transparent hover:border-white/50'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}

        {/* Separator */}
        <div className="w-px h-6 bg-white/20 mx-1" />

        {/* Stroke widths */}
        {WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => whiteboard.setStrokeWidth(w)}
            title={`Width ${w}`}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
              settings.strokeWidth === w
                ? 'bg-white/30'
                : 'hover:bg-white/15'
            }`}
          >
            <span
              className="rounded-full bg-white"
              style={{ width: w + 2, height: w + 2 }}
            />
          </button>
        ))}

        {/* Separator */}
        <div className="w-px h-6 bg-white/20 mx-1" />

        {/* Undo / Redo / Clear */}
        <button
          onClick={() => whiteboard.undo()}
          disabled={whiteboard.strokes.length === 0}
          title="Undo"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:bg-white/15 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Undo2 className="w-[18px] h-[18px]" />
        </button>
        <button
          onClick={() => whiteboard.redo()}
          disabled={whiteboard.redoStack.length === 0}
          title="Redo"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:bg-white/15 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Redo2 className="w-[18px] h-[18px]" />
        </button>
        <button
          onClick={handleClear}
          title={showClearConfirm ? 'Click again to confirm' : 'Clear all'}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            showClearConfirm
              ? 'bg-red-500/40 text-red-300 animate-pulse'
              : 'text-white/70 hover:bg-white/15 hover:text-white'
          }`}
        >
          <Trash2 className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}
