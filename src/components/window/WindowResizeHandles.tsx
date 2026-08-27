import { startWindowResize, type ResizeDirection } from "../../lib/windowControls";

const handles: Array<{ direction: ResizeDirection; className: string; label: string }> = [
  { direction: "North", className: "resize-handle north", label: "Resize window north" },
  { direction: "South", className: "resize-handle south", label: "Resize window south" },
  { direction: "East", className: "resize-handle east", label: "Resize window east" },
  { direction: "West", className: "resize-handle west", label: "Resize window west" },
  { direction: "NorthEast", className: "resize-handle north-east", label: "Resize window northeast" },
  { direction: "NorthWest", className: "resize-handle north-west", label: "Resize window northwest" },
  { direction: "SouthEast", className: "resize-handle south-east", label: "Resize window southeast" },
  { direction: "SouthWest", className: "resize-handle south-west", label: "Resize window southwest" }
];

export function WindowResizeHandles() {
  return (
    <div className="window-resize-handles" aria-hidden="true">
      {handles.map(({ direction, className, label }) => (
        <div
          className={className}
          data-resize-direction={direction}
          key={direction}
          role="presentation"
          title={label}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            void startWindowResize(direction);
          }}
        />
      ))}
    </div>
  );
}
