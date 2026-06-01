import { useEffect } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'info';
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  // Close on Escape while the modal is open. (Confirm is intentionally not
  // bound to Enter: it would conflict with the editor's global Enter handler
  // and risk accidental confirmation of destructive actions.)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const confirmBtnClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-500 text-white'
    : 'bg-white hover:bg-slate-200 text-slate-950';

  return (
    <div
      role="dialog" aria-modal="true" aria-label={title}
      onClick={onClose}
      className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative animate-scaleIn">
        <button onClick={onClose} aria-label="Close dialog" className="absolute top-4 right-4 text-slate-500 hover:text-slate-200 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h3 className="text-lg font-bold mb-2 text-slate-100">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed mb-6">{message}</p>
        <div className="flex gap-3">
          {variant !== 'info' && (
            <button onClick={onClose}
              className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-850 hover:border-slate-750 font-semibold py-2.5 rounded-xl text-sm transition-all duration-150">
              {cancelLabel}
            </button>
          )}
          <button onClick={() => { onConfirm(); onClose(); }} autoFocus
            className={`flex-1 font-semibold py-2.5 rounded-xl text-sm transition-colors ${confirmBtnClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
