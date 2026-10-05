/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { enhanceTables } from "../../../src/rendering/enhancers/tables";
import { renderMarkdownDocument } from "../../../src/rendering/render";

const css = readFileSync(resolve(__dirname, "../../../src/styles.css"), "utf8");

describe("reader CSS contract", () => {
  it("preserves GFM alignment through the renderer, sanitizer, and wrapper", async () => {
    const result = await renderMarkdownDocument("| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |");
    const root = document.createElement("article");
    root.innerHTML = result.html;
    enhanceTables(root);

    expect(root.querySelectorAll("th[align]")).toHaveLength(3);
    expect(root.querySelector("th[align=\"left\"]")).not.toBeNull();
    expect(root.querySelector("th[align=\"center\"]")).not.toBeNull();
    expect(root.querySelector("th[align=\"right\"]")).not.toBeNull();
  });

  it("wraps tables without changing their semantics or GFM alignment", () => {
    const root = document.createElement("article");
    root.innerHTML = '<table><thead><tr><th align="right">Amount</th></tr></thead><tbody><tr><td align="right">42</td></tr></tbody></table>';
    const table = root.querySelector("table");

    enhanceTables(root);
    enhanceTables(root);

    expect(root.querySelectorAll(".table-scroll")).toHaveLength(1);
    expect(root.querySelector(".table-scroll table")).toBe(table);
    expect(root.querySelector("th")?.getAttribute("align")).toBe("right");
    expect(root.querySelector("td")?.textContent).toBe("42");
  });

  it("contains wide rich content and keeps code and tables independently scrollable", () => {
    expect(css).toContain(".markdown-body .table-scroll {");
    expect(css).toMatch(/\.markdown-body \.table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\.markdown-body \.code-frame pre\s*\{[^}]*overflow:\s*auto/s);
    expect(css).toMatch(/\.markdown-body img\s*\{[^}]*max-width:\s*100%/s);
    expect(css).toMatch(/\.mermaid-host\s*\{[^}]*overflow-x:\s*auto/s);
  });

  it("styles navigable headings and rich note content", () => {
    expect(css).toContain("scroll-margin-top: 1.25rem");
    expect(css).toContain(".markdown-body .callout .callout");
    expect(css).toContain(".markdown-body .footnotes");
    expect(css).toContain(".markdown-body .table-scroll th[align=\"center\"]");
  });

  it("docks Outline in a reserved desktop track and overlays it only at the narrow breakpoint", () => {
    const dock = css.match(/\.workspace\.mode-reader:has\(> \.outline-panel:not\(\.is-overlay\)\)\s*\{([^}]*)\}/s)?.[1] ?? "";
    const splitDock = css.match(/\.workspace\.mode-split:has\(> \.outline-panel:not\(\.is-overlay\)\)\s*\{([^}]*)\}/s)?.[1] ?? "";
    const basePanel = css.match(/\.outline-panel\s*\{([^}]*)\}/s)?.[1] ?? "";
    const narrowPanel = css.match(/@media \(max-width: 760px\)[\s\S]*?\.outline-panel\.is-overlay\s*\{([^}]*)\}/s)?.[1] ?? "";

    expect(css).toMatch(/\.workspace\s*\{[^}]*position:\s*relative/s);
    expect(dock).toContain("grid-template-columns: clamp(220px, 24vw, 280px) minmax(0, 1fr)");
    expect(splitDock).toContain("minmax(320px, 43fr) minmax(0, 57fr)");
    expect(basePanel).not.toContain("position: absolute");
    expect(narrowPanel).toContain("position: absolute");
    expect(narrowPanel).toContain("width: min(86vw, 320px)");
    expect(narrowPanel).toContain("padding-top: 12px");
  });

  it("hides reader controls in print while retaining diagram and table content", () => {
    expect(css).toMatch(/@media print\s*\{[\s\S]*?\.outline-toggle,[\s\S]*?\.diagram-viewer-controls[\s\S]*?display:\s*none !important/s);
    expect(css).toMatch(/@media print\s*\{[\s\S]*?\.diagram-viewer-content,[\s\S]*?overflow:\s*visible/s);
  });
});
