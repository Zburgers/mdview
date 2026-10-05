import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutlinePanel } from "../../../src/components/OutlinePanel";
import type { HeadingEntry } from "../../../src/rendering/types";

const headings: HeadingEntry[] = [
  { id: "intro", text: "Introduction", level: 1, ordinal: 0 },
  { id: "details", text: "Details", level: 3, ordinal: 1 }
];

afterEach(cleanup);

describe("OutlinePanel", () => {
  it("starts collapsed and toggles to renderer headings with level indentation", () => {
    render(<OutlinePanel headings={headings} onNavigate={vi.fn()} />);

    expect(screen.queryByRole("complementary", { name: "Document outline" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show outline" }));

    expect(screen.getByRole("complementary", { name: "Document outline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details" })).toHaveStyle({ paddingInlineStart: "2rem" });
  });

  it("shows an empty state and reports heading navigation", () => {
    const onNavigate = vi.fn();
    render(<OutlinePanel headings={headings} activeHeadingId="details" onNavigate={onNavigate} open />);

    expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute("aria-current", "location");
    fireEvent.click(screen.getByRole("button", { name: "Introduction" }));
    expect(onNavigate).toHaveBeenCalledWith("intro");

    const empty = render(<OutlinePanel headings={[]} onNavigate={vi.fn()} open />);
    expect(empty.getByText("No headings in this document.")).toBeInTheDocument();
  });

  it("closes an overlay on Escape and reports the visibility change", () => {
    const onOpenChange = vi.fn();
    render(<OutlinePanel headings={headings} onNavigate={vi.fn()} open overlay onOpenChange={onOpenChange} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
