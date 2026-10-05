import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { Preview } from "../../../src/components/Preview";

function ready(html: string) {
  return { status: "success" as const, result: { html, headings: [], resources: [], diagnostics: [] }, error: null };
}

describe("Preview interactions", () => {
  it("enables task checkboxes with source line metadata and calls onToggleTask", async () => {
    const onToggle = vi.fn();
    const { container } = render(
      <Preview
        renderState={ready('<ul><li class="task-list-item"><input checked disabled type="checkbox" data-line="0">task one</li><li class="task-list-item"><input disabled type="checkbox" data-line="1">done</li><li class="task-list-item"><input disabled type="checkbox" data-line="4">second list</li></ul>')}
        filePath="/a/b.md"
        theme="light"
        searchQuery=""
        onToggleTask={onToggle}
      />
    );

    await waitFor(() => {
      const boxes = container.querySelectorAll<HTMLInputElement>('li.task-list-item input[type="checkbox"]');
      expect(boxes).toHaveLength(3);
      expect(boxes[0].disabled).toBe(false);
      expect(boxes[0].getAttribute("data-line")).toBe("0");
      expect(boxes[1].getAttribute("data-line")).toBe("1");
      expect(boxes[2].getAttribute("data-line")).toBe("4");
    });
    const first = container.querySelector<HTMLInputElement>('li.task-list-item input[type="checkbox"]')!;
    fireEvent.change(first);
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(0));
  });

  it("routes rendered wikilinks through onOpenWikilink", async () => {
    const onOpen = vi.fn();
    const { container } = render(
      <Preview
        renderState={ready('<a class="wikilink" data-wikilink="My Note" href="#wikilink-my-note">Alias</a>')}
        filePath="/a/b.md"
        theme="light"
        searchQuery=""
        onOpenWikilink={onOpen}
      />
    );
    const link = container.querySelector<HTMLAnchorElement>("a.wikilink")!;
    fireEvent.click(link);
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("My Note", undefined));
  });
});
