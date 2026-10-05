import { useEffect, useRef, useState } from "react";

type DiagramViewerProps = {
  sanitizedSvg: string;
  source: string;
  error?: string | null;
};

export function DiagramViewer({ sanitizedSvg, source, error }: DiagramViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => restoreFocusRef.current?.focus();
  }, [expanded]);

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      setCopyStatus("Diagram source copied.");
    } catch {
      setCopyStatus("Could not copy diagram source.");
    }
  }

  function onDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setExpanded(false);
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

  if (error) return <div className="mermaid-error" role="alert">{error}</div>;

  return (
    <div className="diagram-viewer">
      <div className="diagram-viewer-controls">
        <button aria-label="Expand diagram" onClick={() => setExpanded(true)} ref={expandButtonRef} type="button">
          Expand
        </button>
        <button onClick={() => void copySource()} type="button">Copy source</button>
      </div>
      {!expanded && (
        <div
          aria-label="Mermaid diagram"
          className="diagram-viewer-content"
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
        />
      )}
      {expanded && (
        <div
          className="diagram-viewer-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setExpanded(false);
          }}
        >
          <div
            aria-label="Expanded Mermaid diagram"
            aria-modal="true"
            className="diagram-viewer-dialog"
            onKeyDown={onDialogKeyDown}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="diagram-viewer-controls">
              <button aria-label="Close expanded diagram" onClick={() => setExpanded(false)} ref={closeButtonRef} type="button">
                Close
              </button>
              <button onClick={() => void copySource()} type="button">Copy source</button>
            </div>
            <div
              aria-label="Mermaid diagram"
              className="diagram-viewer-content is-expanded"
              dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
            />
          </div>
        </div>
      )}
      <span aria-live="polite" className="diagram-copy-status">{copyStatus}</span>
    </div>
  );
}
