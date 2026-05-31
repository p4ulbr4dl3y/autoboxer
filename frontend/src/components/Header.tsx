interface HeaderProps {
  view: 'dashboard' | 'project' | 'editor';
  selectedProjectId: number | null;
  onNavigate: (view: 'dashboard' | 'project') => void;
}

export default function Header({ view, selectedProjectId, onNavigate }: HeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-50 to-slate-200">Autoboxer</h1>
          <p className="text-xs text-slate-400">Model-Assisted Image Labeling Studio</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => onNavigate('dashboard')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${view === 'dashboard' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-white'}`}
        >
          Dashboard
        </button>
        {selectedProjectId && (
          <button
            onClick={() => onNavigate('project')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${view === 'project' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-white'}`}
          >
            Gallery
          </button>
        )}
      </div>
    </header>
  );
}
