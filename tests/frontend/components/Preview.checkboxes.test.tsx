import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { Preview } from "../../../src/components/Preview";

describe("Preview checkboxes", () => {
  it("renders enabled checkboxes with data-line and calls onToggleTask", async () => {
    const onToggle = vi.fn();
    const { container } = render(
      <Preview
        markdown={"- [ ] task one\n- [x] done\n\nregular\n- [ ] second list"}
        filePath="/a/b.md"
        theme="light"
        searchQuery=""
        onToggleTask={onToggle}
      />
    );

    await waitFor(() => {
      const boxes = container.querySelectorAll('li.task-list-item input[type="checkbox"]');
      expect(boxes.length).toBe(3);
      // should be enabled (no disabled)
      expect((boxes[0] as HTMLInputElement).disabled).toBe(false);
      expect(boxes[0].getAttribute("data-line")).toBe("0");
      expect(boxes[1].getAttribute("data-line")).toBe("1");
      expect(boxes[2].getAttribute("data-line")).toBe("4");
    });

    const first = container.querySelector('li.task-list-item input[type="checkbox"]') as HTMLInputElement;
    first.click();
    // change event should fire via bubbling to root listener
    first.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => {
      expect(onToggle).toHaveBeenCalledWith(0);
    });
  });

  it("renders wikilinks and fires onOpenWikilink", async () => {
    const onOpen = vi.fn();
    const { container } = render(
      <Preview
        markdown={"See [[My Note|Alias]]"}
        filePath="/a/b.md"
        theme="light"
        searchQuery=""
        onOpenWikilink={onOpen}
      />
    );
    await waitFor(() => {
      const link = container.querySelector("a.wikilink") as HTMLAnchorElement;
      expect(link).not.toBeNull();
      expect(link.textContent).toBe("Alias");
      expect(link.getAttribute("data-wikilink")).toBe("My Note");
    });
    const preview = container.querySelector(".preview") as HTMLElement;
    const link = container.querySelector("a.wikilink") as HTMLAnchorElement;
    fireEvent.click(link);
    // also try direct bubbling via preview click because Preview onClick is on container
    fireEvent.click(preview, { target: link });
    await waitFor(() => {
      expect(onOpen).toHaveBeenCalled();
    });
    expect(onOpen).toHaveBeenCalledWith("My Note", undefined);
  });
});
