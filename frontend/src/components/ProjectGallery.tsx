import { useState } from 'react';
import { api } from '../api/client';
import type { Project, ProjectStats, ClassCategory, ImageItem } from '../types';

interface ProjectGalleryProps {
  project: Project;
  stats: ProjectStats | undefined;
  images: ImageItem[];
  classes: ClassCategory[];
  statusFilter: string;
  isBatchLabeling: boolean;
  setStatusFilter: (f: string) => void;
  setClasses: React.Dispatch<React.SetStateAction<ClassCategory[]>>;
  onOpenEditor: (imageId: number) => void;
  onBatchLabel: () => void;
  onDeleteClass: (classId: number) => void;
  onRefresh: () => void;
}

export default function ProjectGallery({
  project, stats, images, classes, statusFilter, isBatchLabeling,
  setStatusFilter, setClasses, onOpenEditor, onBatchLabel, onDeleteClass, onRefresh,
}: ProjectGalleryProps) {
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#34C759');
  const [classError, setClassError] = useState<string | null>(null);

  const handleUploadImages = async () => {
    if (!uploadFiles) return;
    setIsUploading(true);
    try {
      await api.images.upload(project.id, uploadFiles);
      setUploadFiles(null);
      const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName) return;
    setClassError(null);
    try {
      const added = await api.classes.create(project.id, { name: newClassName, color: newClassColor });
      setClasses(prev => [...prev, added]);
      setNewClassName('');
    } catch (e: any) {
      setClassError(e.message);
    }
  };

  const handleUpdateClassPrompt = async (classId: number, newPrompt: string) => {
    try {
      const updated = await api.classes.update(classId, { prompt: newPrompt });
      setClasses(prev => prev.map(c => c.id === classId ? updated : c));
    } catch (e) {
      console.error(e);
    }
  };

  const handleExport = (format: 'yolo' | 'coco') => {
    window.open(api.projects.exportUrl(project.id, format));
  };

  const isRunning = isBatchLabeling || (stats && stats.batch_in_progress);

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 px-6 py-6 max-w-7xl mx-auto w-full">
      {/* Gallery Section */}
      <div className="lg:col-span-3 bg-slate-900/30 border border-slate-850 rounded-2xl p-6 flex flex-col">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-800/80 pb-5">
          <div>
            <h2 className="text-2xl font-bold">{project.name}</h2>
            <p className="text-slate-400 text-xs mt-1">Manage project images and trigger auto-annotations</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              {['all', 'unlabeled', 'labeled'].map(filter => (
                <button key={filter} onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${statusFilter === filter ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
            <div className="relative group">
              <button className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-500/10 transition-all">
                Export Data
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="absolute right-0 mt-2 w-40 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden hidden group-hover:block z-20">
                <button onClick={() => handleExport('yolo')}
                  className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-800 text-slate-350 hover:text-white transition-colors">YOLO Dataset (ZIP)</button>
                <button onClick={() => handleExport('coco')}
                  className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-800 border-t border-slate-850 text-slate-350 hover:text-white transition-colors">COCO JSON (ZIP)</button>
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {stats && isRunning && (
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl mb-6 flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-indigo-400 animate-pulse">Running Batch Auto-Labeling...</span>
              <span className="font-mono text-slate-400">{stats.labeled_images} / {stats.total_images} Labeled</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-850">
              <div className="bg-indigo-500 h-full rounded-full transition-all duration-500 animate-pulse"
                style={{ width: `${Math.round((stats.labeled_images / stats.total_images) * 100)}%` }} />
            </div>
          </div>
        )}

        {/* Images Grid */}
        <div className="flex-1 min-h-[300px] overflow-y-auto mb-6">
          {images.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center">
              <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-slate-400 font-medium text-sm">No images in this dataset yet</p>
              <p className="text-slate-500 text-xs mt-1">Upload images using the control panel on the right</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {images.map(img => (
                <div key={img.id} onClick={() => onOpenEditor(img.id)}
                  className="bg-slate-950/80 border border-slate-855 rounded-xl overflow-hidden hover:border-slate-700 group cursor-pointer relative transition-all duration-200">
                  <div className="aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden">
                    <img src={api.images.fileUrl(img.id)} alt={img.filename} loading="lazy"
                      className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <div className="p-3">
                    <p className="text-slate-350 text-xs font-semibold truncate">{img.filename}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[10px] font-mono text-slate-500">{img.width ? `${img.width}x${img.height}` : 'loading'}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        img.status === 'labeled' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        img.status === 'in_progress' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse' :
                        'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>{img.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Uploader */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Upload Image Files</h3>
          <div className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl p-6 text-center cursor-pointer transition-all relative group bg-slate-950/40">
            <input type="file" multiple accept="image/*" id="file-upload-input"
              onChange={e => setUploadFiles(e.target.files)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <svg className="w-8 h-8 mx-auto text-slate-500 mb-2 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-xs text-slate-350 font-semibold truncate">{uploadFiles ? `${uploadFiles.length} files selected` : 'Drag files here or Browse'}</p>
          </div>
          {uploadFiles && (
            <button onClick={handleUploadImages} disabled={isUploading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl mt-4 shadow-lg shadow-indigo-500/10 active:scale-95 transition-all duration-200">
              {isUploading ? 'Uploading...' : 'Confirm Upload'}
            </button>
          )}
        </div>

        {/* Class Manager */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Label Classes ({classes.length})</h3>
          <form onSubmit={handleAddClass} className="flex gap-2 mb-4">
            <input type="text" required value={newClassName} onChange={e => { setNewClassName(e.target.value); setClassError(null); }}
              placeholder="New class name..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
            <input type="color" value={newClassColor} onChange={e => setNewClassColor(e.target.value)}
              className="w-8 h-8 rounded-lg overflow-hidden border border-slate-800 bg-transparent cursor-pointer p-0" />
            <button type="submit"
              className="bg-slate-800 hover:bg-indigo-600 border border-slate-750 hover:border-transparent text-white p-2 rounded-xl transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </form>
          {classError && (
            <p className="text-red-400 text-[11px] mb-3 px-1">{classError}</p>
          )}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {classes.length === 0 ? (
              <p className="text-slate-500 text-xs italic">No custom classes registered yet.</p>
            ) : (
              classes.map(cls => (
                <div key={cls.id} className="bg-slate-950/60 border border-slate-850 p-2.5 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                    <span className="text-slate-300 font-mono font-bold truncate flex-1">{cls.name}</span>
                    <button onClick={() => onDeleteClass(cls.id)}
                      className="text-slate-600 hover:text-red-400 p-1 rounded transition-colors flex-shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div>
                    <label className="block text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Locating Prompt</label>
                    <input type="text" value={cls.prompt || `Locate ${cls.name}.`}
                      onChange={e => setClasses(prev => prev.map(c => c.id === cls.id ? { ...c, prompt: e.target.value } : c))}
                      onBlur={e => handleUpdateClassPrompt(cls.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <button onClick={onBatchLabel} disabled={isBatchLabeling}
          className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Auto-Label All Images
        </button>
      </div>

    </div>
  );
}
