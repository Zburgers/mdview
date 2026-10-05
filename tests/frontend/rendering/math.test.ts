import katex from "katex";
import { describe, expect, it, vi } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";

describe("per-render KaTeX math", () => {
  it("renders inline and block math in isolated concurrent sessions", async () => {
    const [first, second] = await Promise.all([
      renderMarkdownDocument("Inline $x^2$\n\n$$a+b$$"),
      renderMarkdownDocument("Inline $y^3$\n\n$$c+d$$")
    ]);
    const firstDocument = new DOMParser().parseFromString(first.html, "text/html");
    const secondDocument = new DOMParser().parseFromString(second.html, "text/html");

    expect(firstDocument.querySelectorAll(".math-inline .katex")).toHaveLength(1);
    expect(firstDocument.querySelectorAll(".math-block .katex")).toHaveLength(1);
    expect(secondDocument.querySelectorAll(".math-inline .katex")).toHaveLength(1);
    expect(secondDocument.querySelectorAll(".math-block .katex")).toHaveLength(1);
    expect(first.html).toContain('data-math="x^2"');
    expect(second.html).toContain('data-math="y^3"');
    expect(first.html).not.toContain("__MDVIEW_KATEX_");
    expect(second.html).not.toContain("__MDVIEW_KATEX_");
  });

  it("keeps malformed math visible and caps extreme sizes and macro expansion", async () => {
    const result = await renderMarkdownDocument(
      "$\\notacommand$ and $\\rule{10000em}{1em}$ and $\\def\\a{\\a\\a}\\a$"
    );
    const document = new DOMParser().parseFromString(result.html, "text/html");

    expect(document.querySelectorAll(".math-inline")).toHaveLength(3);
    expect(
      Array.from(document.querySelectorAll<HTMLElement>(".math-inline .katex-error"))
        .some((error) => error.title.includes("Too many expansions"))
    ).toBe(true);
    expect(result.html).not.toMatch(/width:\s*10000em/i);
  });

  it("passes finite expansion and sizing limits to KaTeX", async () => {
    const renderToString = vi.spyOn(katex, "renderToString");
    try {
      await renderMarkdownDocument("$x^2$");
      expect(renderToString).toHaveBeenCalledWith(
        "x^2",
        expect.objectContaining({
          maxSize: 100,
          maxExpand: 500,
          throwOnError: false,
          trust: false
        })
      );
    } finally {
      renderToString.mockRestore();
    }
  });

  it("keeps KaTeX trust disabled for commands and sanitizes its generated HTML", async () => {
    const result = await renderMarkdownDocument(
      "$\\href{javascript:alert(1)}{click} + \\htmlClass{attacker}{x}$"
    );
    const document = new DOMParser().parseFromString(result.html, "text/html");

    expect(document.querySelector('.math-inline a[href^="javascript:"]')).toBeNull();
    expect(document.querySelector(".math-inline .attacker")).toBeNull();
  });
});
