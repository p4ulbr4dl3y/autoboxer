import { useState } from 'react';
import { api } from '../api/client';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateProjectModal({ isOpen, onClose, onCreated }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [projectClasses, setProjectClasses] = useState<{ name: string; prompt: string; color: string }[]>([
    { name: '', prompt: '', color: '#34C759' }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name) return;

    const classesList = projectClasses
      .map(cls => ({
        name: cls.name.trim(),
        prompt: cls.prompt.trim() || `Locate ${cls.name.trim()}.`,
        color: cls.color,
      }))
      .filter(cls => cls.name.length > 0);

    if (classesList.length === 0) {
      setError('Please specify at least one class category.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.projects.create({
        name,
        description: desc || null,
        classes: classesList,
      });
      setName(''); setDesc('');
      setProjectClasses([{ name: '', prompt: '', color: '#34C759' }]);
      onClose();
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addClass = () => {
    const colors = ['#34C759', '#007AFF', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA'];
    setProjectClasses(prev => [...prev, { name: '', prompt: '', color: colors[prev.length % colors.length] }]);
  };

  const removeClass = (index: number) => {
    setProjectClasses(prev => prev.filter((_, idx) => idx !== index));
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h3 className="text-xl font-bold mb-4">Create New Project</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Project Name</label>
            <input type="text" required value={name} onChange={e => { setName(e.target.value); setError(null); }}
              placeholder="e.g. Traffic Sign Detection"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              placeholder="Project description..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors resize-none" />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Classes & Prompts</label>
              <button type="button" onClick={addClass}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1 px-3 rounded-lg text-xs transition-colors flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Add Class
              </button>
            </div>
            <div className="space-y-3.5 max-h-52 overflow-y-auto pr-1">
              {projectClasses.map((cls, index) => (
                <div key={index} className="flex gap-2.5 items-end bg-slate-950/40 p-2.5 rounded-xl border border-slate-855">
                  <div className="flex-shrink-0">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Color</label>
                    <input type="color" value={cls.color}
                      onChange={e => { const u = [...projectClasses]; u[index].color = e.target.value; setProjectClasses(u); }}
                      className="w-8 h-8 rounded-lg border border-slate-800 bg-transparent cursor-pointer p-0" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Class Name</label>
                    <input type="text" required value={cls.name} placeholder="e.g. cat"
                      onChange={e => {
                        const u = [...projectClasses]; const old = u[index].name;
                        u[index].name = e.target.value;
                        if (!u[index].prompt || u[index].prompt === `Locate ${old}.`) {
                          u[index].prompt = e.target.value ? `Locate ${e.target.value}.` : '';
                        }
                        setProjectClasses(u);
                        setError(null);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="flex-[2]">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Locate Prompt</label>
                    <input type="text" value={cls.prompt} placeholder="e.g. Locate cat."
                      onChange={e => { const u = [...projectClasses]; u[index].prompt = e.target.value; setProjectClasses(u); }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
                  </div>
                  {projectClasses.length > 1 && (
                    <button type="button" onClick={() => removeClass(index)}
                      className="bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 p-2 rounded-lg border border-slate-750 hover:border-red-900 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          {error && (
            <p className="text-red-400 text-xs px-1">{error}</p>
          )}
          <div className="flex gap-4 pt-4 mt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-xl text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-semibold py-2.5 rounded-xl text-sm shadow-lg shadow-indigo-500/10 transition-colors">
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
