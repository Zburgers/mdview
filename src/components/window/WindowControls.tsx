import { Minus, Square, X } from "lucide-react";
import { minimizeWindow, requestWindowClose, toggleMaximizeWindow } from "../../lib/windowControls";

function runWindowCommand(command: () => Promise<void>) {
  void command();
}

export function WindowControls() {
  return (
    <div className="window-controls" aria-label="Window controls">
      <button
        className="window-control-button"
        type="button"
        title="Minimize Window"
        aria-label="Minimize Window"
        onClick={() => runWindowCommand(minimizeWindow)}
      >
        <Minus size={15} />
      </button>
      <button
        className="window-control-button"
        type="button"
        title="Maximize or Restore Window"
        aria-label="Maximize or Restore Window"
        onClick={() => runWindowCommand(toggleMaximizeWindow)}
      >
        <Square size={13} />
      </button>
      <button
        className="window-control-button close"
        type="button"
        title="Close Window"
        aria-label="Close Window"
        onClick={() => runWindowCommand(requestWindowClose)}
      >
        <X size={16} />
      </button>
    </div>
  );
}
