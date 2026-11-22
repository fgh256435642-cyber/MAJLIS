import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ImagePreviewState {
  src: string;
  alt: string;
}

export function ImagePreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<ImagePreviewState | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const handleImageClick = (event: MouseEvent) => {
      if (event.button !== 0) return;

      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (!target.dataset.imagePreview) return;
      if (target.closest('[data-image-preview-modal="true"]')) return;

      const src = target.currentSrc || target.src;
      if (!src) return;

      event.preventDefault();
      event.stopPropagation();
      setZoom(1);
      setPreview({ src, alt: target.alt || 'Image preview' });
    };

    document.addEventListener('click', handleImageClick, true);
    return () => document.removeEventListener('click', handleImageClick, true);
  }, []);

  useEffect(() => {
    if (!preview) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(null);
      if (event.key === '+' || event.key === '=') {
        setZoom((value) => Math.min(4, value + 0.25));
      }
      if (event.key === '-') {
        setZoom((value) => Math.max(0.5, value - 0.25));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [preview]);

  useEffect(() => {
    if (!preview) setZoom(1);
  }, [preview]);

  if (!preview) return <>{children}</>;

  return (
    <>
      {children}
      {createPortal(
        <div
          data-image-preview-modal="true"
          role="dialog"
          aria-modal="true"
          aria-label={preview.alt}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-rail/90 backdrop-blur-sm p-4 sm:p-8"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative flex max-h-full max-w-full items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={preview.src}
              alt={preview.alt}
              data-image-preview-modal="true"
              referrerPolicy="no-referrer"
              className="max-h-[82vh] max-w-[92vw] rounded-lg object-contain shadow-2xl transition-transform duration-150"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>

          <div
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-elevated/95 p-1 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
              className="h-9 w-9 rounded-full text-text hover:bg-main"
            >
              -
            </button>
            <button
              type="button"
              aria-label="Reset zoom"
              title="Reset zoom"
              onClick={() => setZoom(1)}
              className="h-9 min-w-14 rounded-full px-2 text-[12px] font-semibold text-text hover:bg-main"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
              className="h-9 w-9 rounded-full text-text hover:bg-main"
            >
              +
            </button>
          </div>

          <button
            type="button"
            aria-label="Close image preview"
            title="Close"
            onClick={() => setPreview(null)}
            className="absolute end-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-elevated/95 text-xl font-bold text-text shadow-xl hover:bg-main"
          >
            x
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
