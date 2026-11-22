import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useToast } from '../hooks/useToast';

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 end-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated px-4 py-3 shadow-lg"
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && (
                <CheckCircle2 className="w-4 h-4 text-success" />
              )}
              {toast.type === 'error' && (
                <AlertCircle className="w-4 h-4 text-danger" />
              )}
              {toast.type === 'info' && (
                <Info className="w-4 h-4 text-link" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-link font-medium text-text dark:text-text">
                {toast.title}
              </div>
              {toast.description && (
                <div className="text-link text-text dark:text-text mt-0.5 break-words">
                  {toast.description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 text-text-muted hover:text-text dark:text-text-muted dark:hover:text-text transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
