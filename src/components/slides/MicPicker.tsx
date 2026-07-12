'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Compact microphone selector shown next to the sim "Record" button.
 *
 * The MacBook failure mode this fixes: with a bare `audio: true` capture the OS
 * default input often wins, which on macOS is frequently a dead/virtual device
 * (Continuity "iPhone Microphone"), so the recording comes out silent. Letting
 * the teacher pick the built-in mic — and remembering it — avoids the problem.
 */
export default function MicPicker({
  devices,
  selectedDeviceId,
  onSelect,
  onOpen,
  disabled,
}: {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string | null) => void;
  /** Called when the picker is opened, to reveal device labels. */
  onOpen: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selected = devices.find((d) => d.deviceId === selectedDeviceId);
  const labelFor = (d: MediaDeviceInfo, i: number) =>
    d.label || `Microphone ${i + 1}`;
  const currentLabel = selected ? labelFor(selected, devices.indexOf(selected)) : 'Default mic';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        title="Choose microphone"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onOpen();
        }}
        className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-40 max-w-[160px]"
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
        </svg>
        <span className="truncate">{currentLabel}</span>
      </button>

      {open && (
        <div className="absolute z-[80] mt-1 right-0 w-64 bg-white border border-gray-200 rounded-xl shadow-xl py-1 text-sm">
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${selectedDeviceId === null ? 'text-[#007229] font-semibold' : 'text-gray-700'}`}
          >
            System default
          </button>
          {devices.map((d, i) => (
            <button
              key={d.deviceId || i}
              type="button"
              onClick={() => { onSelect(d.deviceId); setOpen(false); }}
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 truncate ${d.deviceId === selectedDeviceId ? 'text-[#007229] font-semibold' : 'text-gray-700'}`}
            >
              {labelFor(d, i)}
            </button>
          ))}
          {devices.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">No microphones found</p>
          )}
        </div>
      )}
    </div>
  );
}
