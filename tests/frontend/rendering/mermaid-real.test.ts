/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";
import { sanitizeMermaidSvg } from "../../../src/lib/markdown";

const gallery = readFileSync(resolve(__dirname, "../../fixtures/rendering/mermaid-gallery.md"), "utf8");

describe("pinned Mermaid gallery qualification", () => {
  it("parses and sanitizes the supported diagram families with the real Mermaid engine", async () => {
    const svgElement = SVGElement.prototype as SVGElement & { getBBox?: () => DOMRect; getComputedTextLength?: () => number };
    const originalGetBBox = svgElement.getBBox;
    const originalGetTextLength = svgElement.getComputedTextLength;
    svgElement.getBBox = () => ({ x: 0, y: 0, width: 120, height: 24, top: 0, right: 120, bottom: 24, left: 0, toJSON: () => ({}) });
    svgElement.getComputedTextLength = function () { return (this.textContent ?? "").length * 8; };
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
    const result = await renderMarkdownDocument(gallery);
    const host = document.createElement("div");
    host.innerHTML = result.html;
    const diagrams = Array.from(host.querySelectorAll("pre > code.language-mermaid"), (code) => code.textContent ?? "");
    expect(diagrams).toHaveLength(9);

    try {
      for (const [index, source] of diagrams.entries()) {
        const { svg } = await mermaid.render(`mdview-gallery-${index}`, source);
        expect(sanitizeMermaidSvg(svg)).toMatch(/^<svg\b/i);
      }
    } finally {
      if (originalGetBBox) svgElement.getBBox = originalGetBBox;
      else delete svgElement.getBBox;
      if (originalGetTextLength) svgElement.getComputedTextLength = originalGetTextLength;
      else delete svgElement.getComputedTextLength;
    }
  }, 30000);
});
