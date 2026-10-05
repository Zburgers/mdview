import { describe, expect, it } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";

function createLargeDocument(sectionCount: number): string {
  return Array.from({ length: sectionCount }, (_, index) => [
    `## Section ${index}`,
    `Content for section ${index}.`,
    ...(index % 8 === 0
      ? [`![Image ${index}](./assets/image-${index}.png)`, `[Chapter ${index}](./chapter-${index}.md#section)`]
      : [])
  ].join("\n\n")).join("\n\n");
}

describe("large-document rendering qualification", () => {
  it("completes a deterministic 512-section document with bounded metadata", async () => {
    const markdown = createLargeDocument(512);
    const result = await renderMarkdownDocument(markdown);

    expect(Buffer.byteLength(markdown, "utf8")).toBeLessThan(1024 * 1024);
    expect(result.headings).toHaveLength(512);
    expect(result.resources).toHaveLength(128);
    expect(result.resources.filter(({ kind }) => kind === "image")).toHaveLength(64);
    expect(result.resources.filter(({ kind }) => kind === "local-link")).toHaveLength(64);
    expect(result.html).toContain("Content for section 511.");
  }, 10000);
});
