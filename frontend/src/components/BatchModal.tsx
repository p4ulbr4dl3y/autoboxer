import { useState, useEffect } from 'react';
import type { ClassCategory } from '../types';

interface BatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (prompt: string, targetImages: 'unlabeled' | 'all', mode: 'overwrite' | 'merge', filterByClasses: boolean, targetClasses: string[]) => void;
  classes: ClassCategory[];
}

export default function BatchModal({ isOpen, onClose, onRun, classes }: BatchModalProps) {
  const [prompt, setPrompt] = useState('');
  const [targetImages, setTargetImages] = useState<'unlabeled' | 'all'>('unlabeled');
  const [mode, setMode] = useState<'overwrite' | 'merge'>('overwrite');
  const [filterByClasses, setFilterByClasses] = useState(true);
  const [targetClasses, setTargetClasses] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setTargetClasses(classes.map(c => c.name));
    }
  }, [isOpen, classes]);

  if (!isOpen) return null;

  const toggleClass = (name: string) => {
    setTargetClasses(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h3 className="text-xl font-bold mb-4">Batch Auto-Label Dataset</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">AI Detection Prompt (Optional Override)</label>
            <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="Leave empty to use class-specific prompts (recommended)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors" />
            <p className="text-[10px] text-slate-500 mt-1">
              💡 <strong>Default behavior:</strong> Left blank, the model runs sequentially class-by-class, using each class's own prompt.
            </p>
          </div>

          {/* Target Classes */}
          <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Target Classes</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setTargetClasses(classes.map(c => c.name))}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold">Select All</button>
                <span className="text-[10px] text-slate-650">|</span>
                <button type="button" onClick={() => setTargetClasses([])}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold">Clear All</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {classes.map(cls => (
                <button key={cls.id} type="button" onClick={() => toggleClass(cls.name)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                    targetClasses.includes(cls.name)
                      ? 'bg-indigo-600/20 border-indigo-500/80 text-indigo-200 shadow-sm'
                      : 'bg-slate-950/60 border-slate-850 text-slate-450 hover:border-slate-800'
                  }`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cls.color }} />
                  {cls.name}
                </button>
              ))}
            </div>
          </div>

          {/* Target Images */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Target Images</label>
            <div className="grid grid-cols-2 gap-3">
              {(['unlabeled', 'all'] as const).map(opt => (
                <button key={opt} type="button" onClick={() => setTargetImages(opt)}
                  className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    targetImages === opt
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                      : 'bg-slate-950 border-slate-850 text-slate-450 hover:border-slate-800'
                  }`}>
                  {opt === 'unlabeled' ? 'Unlabeled images only' : 'All images in dataset'}
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Labeling Mode</label>
            <div className="grid grid-cols-2 gap-3">
              {(['overwrite', 'merge'] as const).map(opt => (
                <button key={opt} type="button" onClick={() => setMode(opt)}
                  className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    mode === opt
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                      : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-800'
                  }`}>
                  {opt === 'overwrite' ? 'Overwrite existing' : 'Merge / Incremental'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-550 mt-1">
              {mode === 'overwrite'
                ? 'Overwrite deletes existing boxes of the selected target classes. Other classes remain intact.'
                : 'Merge appends new predictions without deleting any existing boxes.'}
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-850/60 p-3 rounded-xl">
            <input type="checkbox" id="batch-filter-classes" checked={filterByClasses}
              onChange={e => setFilterByClasses(e.target.checked)}
              className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer" />
            <label htmlFor="batch-filter-classes" className="text-xs font-medium text-slate-350 cursor-pointer select-none">
              Filter detections by project classes
            </label>
          </div>

          <div className="flex gap-4 pt-4 mt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-330 font-semibold py-2.5 rounded-xl text-sm transition-colors">Cancel</button>
            <button type="button" onClick={() => { onRun(prompt, targetImages, mode, filterByClasses, targetClasses); onClose(); }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm shadow-lg shadow-indigo-500/10 transition-colors">Run Auto-Labeling</button>
          </div>
        </div>
      </div>
    </div>
  );
}
