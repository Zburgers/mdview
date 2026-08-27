import type { ReactNode } from "react";
import { startWindowDrag, toggleMaximizeWindow } from "../../lib/windowControls";

type WindowDragRegionProps = {
  children: ReactNode;
};

export function WindowDragRegion({ children }: WindowDragRegionProps) {
  return (
    <div
      className="window-drag-region"
      data-testid="window-drag-region"
      onPointerDown={(event) => {
        if (event.button === 0 && event.detail <= 1) {
          void startWindowDrag();
        }
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        void toggleMaximizeWindow();
      }}
    >
      {children}
    </div>
  );
}
