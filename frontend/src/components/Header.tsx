import { Link } from 'react-router-dom';

interface HeaderProps {
  view: 'dashboard' | 'project' | 'editor';
  selectedProjectId: number | null;
}

export default function Header({ view, selectedProjectId }: HeaderProps) {
  return (
    <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-8 py-3.5 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        {/* Sleek monochromatic logo icon matching oMLX */}
        <div className="w-8 h-8 rounded-lg bg-slate-850 border border-slate-750 flex items-center justify-center shadow-md">
          <svg className="w-4 h-4 text-slate-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-bold text-slate-50 tracking-tight">Autoboxer</h1>
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider bg-slate-850 px-1.5 py-0.5 rounded-md border border-slate-800">Studio</span>
        </div>
      </div>

      {/* Centered navigation pill container, exactly like oMLX Status/Models tabs */}
      <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-full border border-slate-800/80">
        <Link
          to="/"
          className={`px-4 py-1 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 ${
            view === 'dashboard'
              ? 'bg-slate-850 text-white border border-slate-750/80 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          Dashboard
        </Link>
        {selectedProjectId && (
          <Link
            to={`/projects/${selectedProjectId}`}
            className={`px-4 py-1 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 ${
              view === 'project'
                ? 'bg-slate-850 text-white border border-slate-750/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Gallery
          </Link>
        )}
      </div>

      {/* Right placeholder side to match the balanced oMLX header */}
      <div className="flex items-center gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 bg-slate-850 border border-slate-800 px-2.5 py-1 rounded-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span className="text-[10px] font-medium tracking-wide">MLX Active</span>
        </div>
      </div>
    </header>
  );
}
