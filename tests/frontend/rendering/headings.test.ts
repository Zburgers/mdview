import { describe, expect, it } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";

describe("render heading metadata", () => {
  it("captures H1 through H6 in source order with rendered inline text", async () => {
    const result = await renderMarkdownDocument(
      "# **Bold** title\n\n## [Linked](https://example.com)\n\n### `Code` &amp; text\n\n#### Four\n\n##### Five\n\n###### Six"
    );

    expect(result.headings).toEqual([
      { id: "bold-title", text: "Bold title", level: 1, ordinal: 0 },
      { id: "linked", text: "Linked", level: 2, ordinal: 1 },
      { id: "code-text", text: "Code & text", level: 3, ordinal: 2 },
      { id: "four", text: "Four", level: 4, ordinal: 3 },
      { id: "five", text: "Five", level: 5, ordinal: 4 },
      { id: "six", text: "Six", level: 6, ordinal: 5 }
    ]);
    expect(result.html).toContain('<h1 id="bold-title">');
    expect(result.html).toContain('<h6 id="six">');
  });

  it("normalizes Unicode and punctuation and adds stable duplicate suffixes", async () => {
    const markdown = "# Café / notes!\n\n# Café / notes!\n\n# Café / notes!-1\n\n# 💡";
    const result = await renderMarkdownDocument(markdown);

    expect(result.headings.map(({ id }) => id)).toEqual([
      "café-notes",
      "café-notes-1",
      "café-notes-1-1",
      "section"
    ]);
    await expect(renderMarkdownDocument(markdown)).resolves.toMatchObject({ headings: result.headings });
  });

  it("does not allow raw HTML attributes to set a heading ID", async () => {
    const result = await renderMarkdownDocument('<h1 id="attacker" onclick="alert(1)">Heading</h1>');

    expect(result.headings).toEqual([]);
    expect(result.html).not.toContain('id="attacker"');
    expect(result.html).not.toContain("onclick");
  });
});
