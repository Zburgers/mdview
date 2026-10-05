import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { ImageLightbox } from "../../../src/components/ImageLightbox";

afterEach(cleanup);

describe("ImageLightbox", () => {
  it("shows the already-authorized source in an accessible dialog and supports full size", () => {
    render(<ImageLightbox open src="tauri://localhost/tmp/diagram.png" alt="Diagram" onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Image preview: Diagram" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("img", { name: "Diagram" })).toHaveAttribute("src", "tauri://localhost/tmp/diagram.png");
    fireEvent.click(screen.getByRole("button", { name: "Show image full size" }));
    expect(screen.getByRole("img", { name: "Diagram" })).toHaveClass("is-full-size");
  });

  it("closes on Escape and backdrop click, trapping focus inside", () => {
    const onClose = vi.fn();
    const { rerender } = render(<ImageLightbox open src="/authorized.png" alt="" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Image preview" });
    const fit = screen.getByRole("button", { name: "Show image full size" });

    expect(screen.getByRole("button", { name: "Close image preview" })).toHaveFocus();
    fit.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Close image preview" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<ImageLightbox open src="/authorized.png" alt="" onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not render when closed or when no resolved image source exists", () => {
    const { rerender } = render(<ImageLightbox open src="" alt="Blocked" onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<ImageLightbox open={false} src="/authorized.png" alt="Image" onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restores focus to the opener when the dialog closes", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open image</button>
          <ImageLightbox open={open} src="/authorized.png" alt="Image" onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<Harness />);

    const opener = screen.getByRole("button", { name: "Open image" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close image preview" }));
    expect(opener).toHaveFocus();
  });
});
