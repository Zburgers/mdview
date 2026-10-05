import { describe, expect, it } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";
import { renderMarkdown } from "../../../src/lib/markdown";

describe("renderMarkdownDocument", () => {
  it("returns independently scoped HTML and metadata for each render", async () => {
    const [first, second] = await Promise.all([
      renderMarkdownDocument("# Same\n\n![one](one.png)\n\n$x^2$"),
      renderMarkdownDocument("# Same\n\n[Two](two.md)\n\n$y^2$")
    ]);

    expect(first.headings.map(({ id }) => id)).toEqual(["same"]);
    expect(second.headings.map(({ id }) => id)).toEqual(["same"]);
    expect(first.resources).toEqual([{ kind: "image", raw: "one.png" }]);
    expect(second.resources).toEqual([{ kind: "local-link", raw: "two.md" }]);
    expect(first.diagnostics).toEqual([]);
    expect(second.diagnostics).toEqual([]);
    expect(first.html).toContain("math-inline");
    expect(second.html).toContain("math-inline");
    expect(first.html).not.toContain("__MDVIEW_KATEX_");
    expect(second.html).not.toContain("__MDVIEW_KATEX_");
  });

  it("keeps the compatibility wrapper on the same sanitized rendering path", async () => {
    const result = await renderMarkdownDocument(
      "> [!TIP]+ Notes\n> - [x] ready\n\n[[Guide|Open]]\n\n![local](./image.png)\n\n$\\href{javascript:alert(1)}{no}$"
    );
    const html = await renderMarkdown(
      "> [!TIP]+ Notes\n> - [x] ready\n\n[[Guide|Open]]\n\n![local](./image.png)\n\n$\\href{javascript:alert(1)}{no}$"
    );

    expect(html).toBe(result.html);
    expect(html).toContain("details class=\"callout");
    expect(html).toContain("task-list-item");
    expect(html).toContain("wikilink");
    expect(html).toContain('src="./image.png"');
    expect(new DOMParser().parseFromString(html, "text/html").querySelector('a[href^="javascript:"]')).toBeNull();
  });
});
