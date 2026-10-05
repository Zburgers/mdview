import { describe, expect, it } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";

describe("GFM footnotes", () => {
  it("renders named and numeric references, multiline definitions, and backlinks", async () => {
    const result = await renderMarkdownDocument(
      "Named[^note] and numeric[^2].\n\n[^note]: First line\n    Second line\n[^2]: Numbered note"
    );
    const document = new DOMParser().parseFromString(result.html, "text/html");
    const section = document.querySelector("section.footnotes[data-footnotes]");

    expect(document.querySelectorAll("sup a[data-footnote-ref]")).toHaveLength(2);
    expect(section?.querySelector("h2#footnote-label.sr-only")?.textContent).toBe("Footnotes");
    expect(section?.querySelectorAll("ol > li[id^='footnote-']")).toHaveLength(2);
    expect(section?.textContent).toContain("First line");
    expect(section?.textContent).toContain("Second line");
    expect(section?.querySelectorAll("a[data-footnote-backref][aria-label]")).toHaveLength(2);
  });

  it("assigns distinct anchors for repeated references and keeps only the first duplicate definition", async () => {
    const result = await renderMarkdownDocument(
      "First[^same], again[^same].\n\n[^same]: kept\n\n[^same]: discarded"
    );
    const document = new DOMParser().parseFromString(result.html, "text/html");
    const references = Array.from(document.querySelectorAll("a[data-footnote-ref]"));

    expect(references.map((reference) => reference.id)).toEqual(["footnote-ref-same", "footnote-ref-same-2"]);
    expect(references.map((reference) => reference.getAttribute("href"))).toEqual([
      "#footnote-same", "#footnote-same"
    ]);
    expect(document.querySelector("section.footnotes")?.textContent).toContain("kept");
    expect(document.querySelector("section.footnotes")?.textContent).not.toContain("discarded");
    expect(document.querySelectorAll('a[href^="#footnote-ref-"][data-footnote-backref]')).toHaveLength(2);
  });

  it("sanitizes hostile footnote content and does not broaden raw HTML IDs", async () => {
    const result = await renderMarkdownDocument(
      'Text[^bad]\n\n[^bad]: <img src="x" onerror="alert(1)"><script>alert(2)</script> safe\n\n<h1 id="attacker">Raw</h1>'
    );
    const document = new DOMParser().parseFromString(result.html, "text/html");

    expect(document.querySelector("section.footnotes img[onerror]")).toBeNull();
    expect(document.querySelector("section.footnotes script")).toBeNull();
    expect(document.querySelector('h1[id="attacker"]')).toBeNull();
    expect(document.querySelector("section.footnotes a[data-footnote-backref]")?.getAttribute("aria-label")).toMatch(/back to reference/i);
  });
});
