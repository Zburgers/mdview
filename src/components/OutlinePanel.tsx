import { useEffect, useState } from "react";
import type { HeadingEntry } from "../rendering/types";

type OutlinePanelProps = {
  headings: readonly HeadingEntry[];
  activeHeadingId?: string | null;
  open?: boolean;
  overlay?: boolean;
  onOpenChange?: (open: boolean) => void;
  onNavigate: (headingId: string) => void;
};

export function OutlinePanel({
  headings,
  activeHeadingId,
  open: controlledOpen,
  overlay = false,
  onOpenChange,
  onNavigate
}: OutlinePanelProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;

  function changeOpen(next: boolean) {
    if (controlledOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (!open || !overlay) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") changeOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, overlay]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-controls="document-outline"
        aria-label={open ? "Hide outline" : "Show outline"}
        className="outline-toggle"
        onClick={() => changeOpen(!open)}
        type="button"
      >
        Outline
      </button>
      {open && (
        <aside
          aria-label="Document outline"
          className={`outline-panel${overlay ? " is-overlay" : ""}`}
          id="document-outline"
        >
          <div className="outline-panel-heading">
            <h2>Outline</h2>
            {overlay && (
              <button aria-label="Close outline" onClick={() => changeOpen(false)} type="button">
                Close
              </button>
            )}
          </div>
          {headings.length === 0 ? (
            <p className="outline-empty">No headings in this document.</p>
          ) : (
            <nav aria-label="Headings">
              <ol className="outline-list">
                {headings.map((heading) => (
                  <li key={`${heading.id}-${heading.ordinal}`}>
                    <button
                      aria-current={activeHeadingId === heading.id ? "location" : undefined}
                      className={`outline-item${activeHeadingId === heading.id ? " is-active" : ""}`}
                      onClick={() => {
                        onNavigate(heading.id);
                        if (overlay) changeOpen(false);
                      }}
                      style={{ paddingInlineStart: `${(heading.level - 1) * 0.75 + 0.5}rem` }}
                      type="button"
                    >
                      {heading.text}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}
        </aside>
      )}
    </>
  );
}
