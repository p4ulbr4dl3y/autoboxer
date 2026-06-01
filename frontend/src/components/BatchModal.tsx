import { useState, useEffect } from 'react';
import type { ClassCategory, ProjectStats } from '../types';

interface BatchModalProps {
  isOpen: boolean;
  classes: ClassCategory[];
  stats: ProjectStats | undefined;
  onClose: () => void;
  onConfirm: (config: {
    target_images: 'all' | 'unlabeled';
    mode: 'merge' | 'overwrite';
    target_classes: string[];
  }) => void;
}

export default function BatchModal({ isOpen, classes, stats, onClose, onConfirm }: BatchModalProps) {
  const [targetImages, setTargetImages] = useState<'all' | 'unlabeled'>(() => 
    stats && stats.unlabeled_images === 0 ? 'all' : 'unlabeled'
  );
  const [overlapMode, setOverlapMode] = useState<'merge' | 'overwrite'>('merge');
  const [selectedClasses, setSelectedClasses] = useState<string[]>(() => 
    classes.map(c => c.name)
  );

  // Close on Escape while the modal is open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggleClass = (name: string) => {
    setSelectedClasses(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const handleSelectAllClasses = () => {
    setSelectedClasses(classes.map(c => c.name));
  };

  const handleSelectNoneClasses = () => {
    setSelectedClasses([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClasses.length === 0) return;
    onConfirm({
      target_images: targetImages,
      mode: overlapMode,
      target_classes: selectedClasses,
    });
    onClose();
  };

  const totalImages = stats ? stats.total_images : 0;
  const unlabeledImages = stats ? stats.unlabeled_images : 0;

  return (
    <div
      role="dialog" aria-modal="true" aria-label="AI Grounding Settings"
      onClick={onClose}
      className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative animate-scaleIn select-none">
        <button onClick={onClose} aria-label="Close dialog" className="absolute top-4 right-4 text-slate-500 hover:text-slate-200 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="text-lg font-bold mb-1 text-slate-100">AI Grounding Project</h3>
        <p className="text-slate-400 text-xs mb-6">Configure LocateAnything visual grounding parameters for this run.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Target Images Selection */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Target Images</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTargetImages('unlabeled')}
                disabled={unlabeledImages === 0}
                className={`p-3 rounded-xl border text-left transition-all relative ${
                  targetImages === 'unlabeled'
                    ? 'border-white bg-white/5 text-white'
                    : 'border-slate-800 bg-slate-955/20 text-slate-400 hover:border-slate-700 disabled:opacity-40 disabled:hover:border-slate-800'
                }`}
              >
                <div className="font-semibold text-xs">Unlabeled Only</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{unlabeledImages} images left</div>
              </button>
              <button
                type="button"
                onClick={() => setTargetImages('all')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  targetImages === 'all'
                    ? 'border-white bg-white/5 text-white'
                    : 'border-slate-800 bg-slate-955/20 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-xs">All Images</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{totalImages} images total</div>
              </button>
            </div>
          </div>

          {/* Classes Selection */}
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Target Classes</label>
              <div className="flex gap-2 text-[10px]">
                <button type="button" onClick={handleSelectAllClasses} className="text-slate-500 hover:text-slate-350 font-semibold">Select All</button>
                <span className="text-slate-800">|</span>
                <button type="button" onClick={handleSelectNoneClasses} className="text-slate-500 hover:text-slate-350 font-semibold">Clear</button>
              </div>
            </div>
            <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-xl bg-slate-955/40 p-3.5 space-y-2">
              {classes.map(cls => {
                const isChecked = selectedClasses.includes(cls.name);
                return (
                  <label key={cls.id} className="flex items-center gap-2.5 cursor-pointer group text-xs text-slate-300 hover:text-white transition-colors">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleClass(cls.name)}
                      className="w-4 h-4 rounded border-slate-800 bg-slate-900 accent-white text-slate-950 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                    <span className="font-medium">{cls.name}</span>
                  </label>
                );
              })}
              {classes.length === 0 && (
                <p className="text-slate-500 text-xs italic">No project classes defined.</p>
              )}
            </div>
          </div>

          {/* Overlap Mode */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Conflict Resolution</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setOverlapMode('merge')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  overlapMode === 'merge'
                    ? 'border-white bg-white/5 text-white'
                    : 'border-slate-800 bg-slate-955/20 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-xs">Merge</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Keep existing annotations</div>
              </button>
              <button
                type="button"
                onClick={() => setOverlapMode('overwrite')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  overlapMode === 'overwrite'
                    ? 'border-white bg-white/5 text-white'
                    : 'border-slate-800 bg-slate-955/20 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-xs">Overwrite</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Replace target classes</div>
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex gap-4 pt-4 border-t border-slate-800/80">
            <button type="button" onClick={onClose}
              className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-850 hover:border-slate-750 font-semibold py-2.5 rounded-xl text-sm transition-all duration-150">
              Cancel
            </button>
            <button
              type="submit"
              disabled={selectedClasses.length === 0}
              className="flex-1 bg-white hover:bg-slate-200 disabled:bg-slate-850 disabled:text-slate-500 disabled:border-transparent text-slate-950 font-semibold py-2.5 rounded-xl text-sm shadow-md transition-all duration-150"
            >
              Start Grounding
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
