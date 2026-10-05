import { useEffect, useRef, useState } from "react";

type ImageLightboxProps = {
  open: boolean;
  src: string;
  alt: string;
  onClose: () => void;
};

export function ImageLightbox({ open, src, alt, onClose }: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [fullSize, setFullSize] = useState(false);

  useEffect(() => {
    if (!open || !src) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => restoreFocusRef.current?.focus();
  }, [open, src]);

  if (!open || !src) return null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="image-lightbox-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-label={alt ? `Image preview: ${alt}` : "Image preview"}
        aria-modal="true"
        className="image-lightbox"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="image-lightbox-controls">
          <button
            aria-label={fullSize ? "Fit image to window" : "Show image full size"}
            onClick={() => setFullSize((value) => !value)}
            type="button"
          >
            {fullSize ? "Fit to window" : "Full size"}
          </button>
          <button aria-label="Close image preview" onClick={onClose} ref={closeButtonRef} type="button">
            Close
          </button>
        </div>
        <img
          alt={alt}
          className={fullSize ? "image-lightbox-image is-full-size" : "image-lightbox-image"}
          src={src}
          style={fullSize ? { maxHeight: "none", maxWidth: "none", objectFit: "none" } : undefined}
        />
      </div>
    </div>
  );
}
