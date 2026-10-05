import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagramViewer } from "../../../src/components/DiagramViewer";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("DiagramViewer", () => {
  it("expands the sanitized SVG without rendering it again and copies inert source", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const sanitizedSvg = '<svg viewBox="0 0 10 10"><text>safe diagram</text></svg>';
    const source = "flowchart LR\nA --> B";
    const { container } = render(<DiagramViewer sanitizedSvg={sanitizedSvg} source={source} />);

    expect(container.querySelector(".diagram-viewer-content")?.innerHTML).toContain("safe diagram");
    fireEvent.click(screen.getByRole("button", { name: "Expand diagram" }));
    expect(screen.getByRole("dialog", { name: "Expanded Mermaid diagram" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close expanded diagram" })).toHaveFocus();
    expect(container.querySelectorAll(".diagram-viewer-content")).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Copy source" })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(source));
    expect(container.querySelector(".diagram-copy-status")).toHaveTextContent("Diagram source copied.");
    expect(container.querySelector(".diagram-viewer-controls")).toBeInTheDocument();
  });

  it("closes the expanded viewer with Escape", () => {
    render(<DiagramViewer sanitizedSvg="<svg />" source="flowchart LR" />);
    fireEvent.click(screen.getByRole("button", { name: "Expand diagram" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps malformed diagrams local and omits viewer controls", () => {
    render(<DiagramViewer sanitizedSvg="" source="bad" error="Diagram failed to render." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Diagram failed to render.");
    expect(screen.queryByRole("button", { name: "Expand diagram" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy source" })).not.toBeInTheDocument();
  });
});
