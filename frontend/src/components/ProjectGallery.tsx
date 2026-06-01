import { useState } from 'react';
import { api } from '../api/client';
import type { Project, ProjectStats, ClassCategory, ImageItem } from '../types';
import BatchModal from './BatchModal';
import ColorPicker from './ColorPicker';
import { useAppContext } from '../context/AppContext';

const DEFAULT_COLORS = ['#34C759', '#007AFF', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA'];

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
  onBatchLabel: (config: {
    target_images: 'all' | 'unlabeled';
    mode: 'merge' | 'overwrite';
    target_classes: string[];
  }) => void;
  onDeleteClass: (classId: number) => void;
  onRefresh: () => void;
  onError?: (title: string, message: string) => void;
}

export default function ProjectGallery({
  project, stats, images, classes, statusFilter, isBatchLabeling,
  setStatusFilter, setClasses, onOpenEditor, onBatchLabel, onDeleteClass, onRefresh, onError,
}: ProjectGalleryProps) {
  const { setDeleteImageInfo } = useAppContext();
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState(() => {
    const nextIndex = classes.length % DEFAULT_COLORS.length;
    return DEFAULT_COLORS[nextIndex];
  });
  const [classError, setClassError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

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
      onError?.('Upload Failed', (e as Error)?.message || 'Could not upload the selected images. Please try again.');
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
      setClasses(prev => {
        const nextClasses = [...prev, added];
        const nextIndex = nextClasses.length % DEFAULT_COLORS.length;
        setNewClassColor(DEFAULT_COLORS[nextIndex]);
        return nextClasses;
      });
      setNewClassName('');
    } catch (e) {
      setClassError((e as Error).message);
    }
  };

  const handleUpdateClassPrompt = async (classId: number, newPrompt: string) => {
    try {
      const updated = await api.classes.update(classId, { prompt: newPrompt });
      setClasses(prev => prev.map(c => c.id === classId ? updated : c));
    } catch (e) {
      console.error(e);
      onError?.('Could Not Save Prompt', (e as Error)?.message || 'Failed to update the locating prompt.');
    }
  };

  const handleExport = (format: 'yolo' | 'coco') => {
    setExportOpen(false);
    window.open(api.projects.exportUrl(project.id, format));
  };

  const canExport = !!stats && stats.labeled_images > 0;

  const isRunning = isBatchLabeling || (stats && stats.batch_in_progress);
  const totalImages = stats ? stats.total_images : images.length;
  const batchDisabled = isRunning || classes.length === 0 || totalImages === 0;
  const batchHint = classes.length === 0
    ? 'Add at least one class first'
    : totalImages === 0
      ? 'Upload some images first'
      : 'Configure and run AI grounding';

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 px-6 py-6 max-w-7xl mx-auto w-full">
      {/* Gallery Section */}
      <div className="lg:col-span-3 bg-slate-900/30 border border-slate-850 rounded-2xl p-6 flex flex-col">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-800/80 pb-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{project.name}</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex bg-slate-955 border border-slate-800 rounded-full p-1 text-xs">
              {['all', 'unlabeled', 'labeled'].map(filter => (
                <button key={filter} onClick={() => setStatusFilter(filter)}
                  className={`px-4.5 py-1 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 ${
                    statusFilter === filter
                      ? 'bg-slate-850 text-white border border-slate-750/80 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}>
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
            <div className="relative">
              <button
                onClick={() => canExport && setExportOpen(o => !o)}
                disabled={!canExport}
                aria-haspopup="menu" aria-expanded={exportOpen}
                title={canExport ? 'Export labeled dataset' : 'Label at least one image to enable export'}
                className="bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-750 disabled:bg-slate-900/60 disabled:text-slate-600 disabled:border-slate-850 disabled:cursor-not-allowed text-slate-200 hover:text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all duration-150">
                Export Data
                <svg className={`w-3.5 h-3.5 transition-transform ${exportOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                  <div role="menu" className="absolute right-0 mt-2 w-40 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden z-20 animate-fadeIn">
                    <button role="menuitem" onClick={() => handleExport('yolo')}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-850 text-slate-350 hover:text-white transition-colors">YOLO Dataset</button>
                    <button role="menuitem" onClick={() => handleExport('coco')}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-850 border-t border-slate-800 text-slate-350 hover:text-white transition-colors">COCO JSON</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {stats && isRunning && (
          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl mb-6 flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-amber-400 animate-pulse">Running Batch Grounding...</span>
              <span className="font-mono text-slate-450">{stats.labeled_images} / {stats.total_images} Labeled</span>
            </div>
            <div className="w-full bg-slate-955 rounded-full h-1.5 overflow-hidden border border-slate-850">
              <div className="bg-white h-full rounded-full transition-all duration-500 animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                style={{ width: `${stats.total_images > 0 ? Math.round((stats.labeled_images / stats.total_images) * 100) : 0}%` }} />
            </div>
          </div>
        )}

        {/* Images Grid */}
        <div className="flex-1 min-h-[300px] overflow-y-auto mb-6">
          {images.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center">
              <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-slate-450 font-semibold text-sm">No images in this dataset yet</p>
              <p className="text-slate-500 text-xs mt-1">Upload images using the control panel on the right</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {images.map(img => (
                <div key={img.id} onClick={() => onOpenEditor(img.id)}
                  className="bg-slate-950/40 border border-slate-850 rounded-xl overflow-hidden hover:border-slate-700/80 hover:shadow-lg hover:shadow-slate-950/20 group cursor-pointer relative transition-all duration-200">
                  <div className="aspect-video w-full bg-slate-955 flex items-center justify-center overflow-hidden border-b border-slate-850">
                    <img src={api.images.fileUrl(img.id)} alt={img.filename} loading="lazy"
                      className="object-cover w-full h-full group-hover:scale-102 transition-transform duration-300" />
                  </div>
                  
                  {/* Delete Image Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteImageInfo({ id: img.id, filename: img.filename });
                    }}
                    title="Delete Image"
                    className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-rose-900/50 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 transition-all opacity-0 group-hover:opacity-100 backdrop-blur z-10 shadow-lg"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  <div className="p-3">
                    <p className="text-slate-350 text-xs font-semibold truncate group-hover:text-white transition-colors">{img.filename}</p>
                    <div className="flex justify-between items-center mt-2.5">
                      <span className="text-[10px] font-mono text-slate-500">{img.width ? `${img.width}x${img.height}` : 'loading'}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        img.status === 'labeled' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        img.status === 'in_progress' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' :
                        'bg-slate-850 text-slate-450 border border-slate-800'
                      }`}>{img.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-6 lg:h-full lg:flex lg:flex-col min-h-0">
        {/* Uploader */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Upload Image Files</h3>
          <div className="border border-dashed border-slate-800 hover:border-slate-700 rounded-xl p-6 text-center cursor-pointer transition-all relative group bg-slate-955/20">
            <input type="file" multiple accept="image/*" id="file-upload-input"
              onChange={e => setUploadFiles(e.target.files)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <svg className="w-8 h-8 mx-auto text-slate-500 mb-2 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-xs text-slate-400 font-medium truncate">{uploadFiles ? `${uploadFiles.length} files selected` : 'Drag files here or Browse'}</p>
          </div>
          {uploadFiles && (
            <button onClick={handleUploadImages} disabled={isUploading}
              className="w-full bg-white hover:bg-slate-200 active:scale-95 text-slate-950 text-xs font-bold py-2.5 rounded-xl mt-4 shadow-md transition-all duration-150">
              {isUploading ? 'Uploading...' : 'Confirm Upload'}
            </button>
          )}
        </div>

        {/* Class Manager */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-lg lg:flex-1 lg:flex lg:flex-col min-h-0">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Label Classes ({classes.length})</h3>
          <form onSubmit={handleAddClass} className="flex gap-2 mb-3">
            <input type="text" required value={newClassName} onChange={e => { setNewClassName(e.target.value); setClassError(null); }}
              placeholder="New class..."
              className="flex-1 bg-slate-955 border border-slate-800 rounded-xl px-3 text-xs text-slate-200 focus:outline-none focus:border-slate-700 placeholder:text-slate-600 h-8 min-w-0" />
            <ColorPicker color={newClassColor} onChange={setNewClassColor} align="right" />
            <button type="submit" aria-label="Add class" title="Add class"
              className="bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 w-8 h-8 rounded-xl transition-all flex items-center justify-center p-0 flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </form>
          {classError && (
            <p className="text-red-400 text-[11px] mb-3 px-1">{classError}</p>
          )}
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[180px]">
            {classes.length === 0 ? (
              <p className="text-slate-500 text-xs italic">No custom classes registered yet.</p>
            ) : (
              classes.map(cls => (
                <div key={cls.id} className="bg-slate-955/40 border border-slate-850 p-3 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                    <span className="text-slate-350 font-mono font-bold text-xs truncate flex-1">{cls.name}</span>
                    <button onClick={() => onDeleteClass(cls.id)}
                      aria-label={`Delete class ${cls.name}`} title="Delete class"
                      className="text-slate-600 hover:text-red-400 p-1 rounded transition-colors flex-shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">Locating Prompt</label>
                    <input type="text" value={cls.prompt || `Locate ${cls.name}.`}
                      onChange={e => setClasses(prev => prev.map(c => c.id === cls.id ? { ...c, prompt: e.target.value } : c))}
                      onBlur={e => handleUpdateClassPrompt(cls.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 text-xs text-slate-200 focus:outline-none focus:border-slate-700 transition-colors h-8" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <button onClick={() => setIsBatchModalOpen(true)} disabled={batchDisabled} title={batchHint}
          className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-850 disabled:text-slate-500 disabled:border-slate-900 disabled:cursor-not-allowed text-slate-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-95 shadow-md">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {isBatchLabeling ? 'Grounding…' : 'Run Grounding'}
        </button>
      </div>

      {isBatchModalOpen && (
        <BatchModal
          isOpen={isBatchModalOpen}
          classes={classes}
          stats={stats}
          onClose={() => setIsBatchModalOpen(false)}
          onConfirm={onBatchLabel}
        />
      )}

    </div>
  );
}
