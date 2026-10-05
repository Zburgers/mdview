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
    const secureDefaults = mermaid.mermaidAPI.getConfig().secure ?? [];
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      secure: Array.from(new Set([...secureDefaults, "htmlLabels"])),
      theme: "default"
    });
    const configured = mermaid.mermaidAPI.getConfig();
    expect(configured.securityLevel).toBe("strict");
    expect(configured.maxTextSize).toBe(50_000);
    expect(configured.maxEdges).toBe(500);
    expect(configured.secure).toEqual(expect.arrayContaining([...secureDefaults, "htmlLabels"]));
    const result = await renderMarkdownDocument(gallery);
    const host = document.createElement("div");
    host.innerHTML = result.html;
    const diagrams = Array.from(host.querySelectorAll("pre > code.language-mermaid"), (code) => code.textContent ?? "");
    expect(diagrams).toHaveLength(9);

    try {
      for (const [index, source] of diagrams.entries()) {
        const { svg } = await mermaid.render(`mdview-gallery-${index}`, source);
        const sanitized = sanitizeMermaidSvg(svg);
        expect(sanitized).toMatch(/^<svg\b/i);
        expect(sanitized).not.toMatch(/<foreignObject\b/i);
        if (index === 0) {
          expect(sanitized).toContain("Start");
          expect(sanitized).toContain("Stop");
          expect(sanitized).toMatch(/<text\b/i);
        }
      }

      const overrideSources = [
        '%%{init: {"htmlLabels": true, "securityLevel": "loose", "maxTextSize": 999999}}%%\nflowchart LR\nA[RootDirectiveLabel] --> B[End]',
        '%%{init: {"flowchart": {"htmlLabels": true}}}%%\nflowchart LR\nA[FlowchartDirectiveLabel] --> B[End]',
        '---\nconfig:\n  htmlLabels: true\n  securityLevel: loose\n  maxEdges: 100000\n---\nflowchart LR\nA[RootFrontmatterLabel] --> B[End]',
        '---\nconfig:\n  flowchart:\n    htmlLabels: true\n---\nflowchart LR\nA[FlowchartFrontmatterLabel] --> B[End]'
      ];
      for (const [index, source] of overrideSources.entries()) {
        const { svg } = await mermaid.render(`mdview-label-policy-${index}`, source);
        const sanitized = sanitizeMermaidSvg(svg);
        const expectedLabel = source.match(/\[(.*?)\]/)?.[1] ?? "";
        const svgDocument = new DOMParser().parseFromString(sanitized, "image/svg+xml");
        const visibleText = Array.from(svgDocument.querySelectorAll("text"), (text) => text.textContent ?? "").join(" ");
        expect(visibleText).toContain(expectedLabel);
        expect(sanitized).toMatch(/<text\b/i);
        expect(sanitized).not.toMatch(/<foreignObject\b/i);
        expect(mermaid.mermaidAPI.getConfig().securityLevel).toBe("strict");
        expect(mermaid.mermaidAPI.getConfig().maxTextSize).toBe(50_000);
        expect(mermaid.mermaidAPI.getConfig().maxEdges).toBe(500);
      }
    } finally {
      if (originalGetBBox) svgElement.getBBox = originalGetBBox;
      else delete svgElement.getBBox;
      if (originalGetTextLength) svgElement.getComputedTextLength = originalGetTextLength;
      else delete svgElement.getComputedTextLength;
    }
  }, 30000);
});
