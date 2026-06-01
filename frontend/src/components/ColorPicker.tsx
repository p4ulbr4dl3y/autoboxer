import { useState, useRef, useEffect } from 'react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

const PRESET_COLORS = [
  '#34C759', // Green
  '#007AFF', // Blue
  '#FF9500', // Orange
  '#FF3B30', // Red
  '#AF52DE', // Purple
  '#5AC8FA', // Light Blue
  '#FFCC00', // Yellow
  '#E458A3', // Pink
  '#2EBCB3', // Turquoise
  '#C6A48F', // Sand
];

export default function ColorPicker({ color, onChange }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{ backgroundColor: color }}
        className="w-8 h-8 rounded-xl border border-slate-800 hover:scale-105 active:scale-95 transition-all shadow-sm focus:outline-none flex items-center justify-center relative cursor-pointer"
        title="Choose color"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-xs" />
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-2 p-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-30 animate-fadeIn w-48">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Color</p>
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setIsOpen(false);
                }}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-lg transition-transform hover:scale-115 active:scale-90 border relative flex items-center justify-center ${
                  color.toLowerCase() === c.toLowerCase()
                    ? 'border-white/80 shadow-md'
                    : 'border-slate-850 hover:border-slate-700'
                }`}
              >
                {color.toLowerCase() === c.toLowerCase() && (
                  <span className="w-1 h-1 rounded-full bg-white" />
                )}
              </button>
            ))}
            
            {/* Custom Color Selector via Native Input */}
            <button
              type="button"
              onClick={() => colorInputRef.current?.click()}
              className="w-6 h-6 rounded-lg border border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-850 flex items-center justify-center text-slate-450 hover:text-slate-200 transition-colors"
              title="Custom Color"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <input
                ref={colorInputRef}
                type="color"
                value={color}
                onChange={e => {
                  onChange(e.target.value);
                }}
                className="sr-only"
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
