import type { ReactNode } from "react";
import { startWindowDrag } from "../../lib/windowControls";

type WindowDragRegionProps = {
  children: ReactNode;
};

export function WindowDragRegion({ children }: WindowDragRegionProps) {
  return (
    <div
      className="window-drag-region"
      data-testid="window-drag-region"
      data-tauri-drag-region
      onPointerDown={() => {
        void startWindowDrag();
      }}
    >
      {children}
    </div>
  );
}
