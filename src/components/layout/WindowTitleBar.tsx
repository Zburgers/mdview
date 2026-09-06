import { WindowControls } from "../window/WindowControls";
import { WindowDragRegion } from "../window/WindowDragRegion";
import { WindowResizeHandles } from "../window/WindowResizeHandles";

type WindowTitleBarProps = {
  fileName: string;
  dirty: boolean;
};

export function WindowTitleBar({ fileName, dirty }: WindowTitleBarProps) {
  const displayName = `${fileName}${dirty ? " *" : ""}`;

  return (
    <header className="window-titlebar">
      <WindowResizeHandles />
      <WindowDragRegion>
        <div className="window-brand">mdview</div>
        <div className="window-file-title" data-testid="window-file-title" title={displayName}>
          {displayName}
        </div>
      </WindowDragRegion>
      <WindowControls />
    </header>
  );
}
