import type { Project, ProjectStats } from '../types';

interface DashboardProps {
  projects: Project[];
  stats: Record<number, ProjectStats>;
  onOpenProject: (id: number) => void;
  onDeleteProject: (id: number) => void;
  onCreateNew: () => void;
}

export default function Dashboard({ projects, stats, onOpenProject, onDeleteProject, onCreateNew }: DashboardProps) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 w-full flex-1 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-100">Your Projects</h2>
            <p className="text-slate-400 text-xs mt-0.5">Select a project to begin labeling or uploading image sets</p>
          </div>
          <button onClick={onCreateNew}
            className="bg-white hover:bg-slate-200 active:scale-95 text-slate-950 font-semibold px-4.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all duration-150 shadow-md">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Create Project
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/40 border border-slate-800 rounded-2xl">
            <svg className="w-12 h-12 mx-auto text-slate-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h3 className="text-sm font-semibold text-slate-350">No projects yet</h3>
            <p className="text-slate-500 text-xs mt-1">Get started by creating your first image labeling project</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(proj => {
              const pStats = stats[proj.id];
              const percent = pStats && pStats.total_images > 0
                ? Math.round((pStats.labeled_images / pStats.total_images) * 100)
                : 0;
              return (
                <div key={proj.id}
                  onClick={() => onOpenProject(proj.id)}
                  role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenProject(proj.id); } }}
                  className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-700/80 hover:shadow-xl hover:shadow-slate-950/20 hover:-translate-y-0.5 focus:outline-none focus:ring-1 focus:ring-slate-700 cursor-pointer group transition-all duration-200">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-bold text-base text-slate-100 group-hover:text-white transition-colors duration-150">{proj.name}</h3>
                      <button onClick={e => { e.stopPropagation(); onDeleteProject(proj.id); }}
                        aria-label={`Delete project ${proj.name}`} title="Delete project"
                        className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-850 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-slate-400 text-xs line-clamp-2 mb-6 h-9 leading-relaxed">{proj.description || 'No description provided.'}</p>
                  </div>
                  <div>
                    <div className="mb-5">
                      <div className="flex justify-between text-[11px] font-semibold text-slate-450 mb-1.5">
                        <span>Progress</span>
                        <span>{pStats ? `${pStats.labeled_images}/${pStats.total_images}` : '0/0'} images ({percent}%)</span>
                      </div>
                      <div className="w-full bg-slate-955 rounded-full h-1.5 overflow-hidden border border-slate-800">
                        <div className="bg-slate-100 h-full rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                    <button onClick={() => onOpenProject(proj.id)}
                      className="w-full bg-slate-850 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800 hover:border-slate-750 font-semibold py-2 rounded-xl text-xs transition-all duration-150">
                      Open Project
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
