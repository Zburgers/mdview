/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";

const kitchenSink = readFileSync(resolve(__dirname, "../../fixtures/rendering/kitchen-sink.md"), "utf8");

describe("kitchen-sink rendering qualification", () => {
  it("composes rich Markdown features into one sanitized result and stable metadata", async () => {
    const result = await renderMarkdownDocument(kitchenSink);
    const again = await renderMarkdownDocument(kitchenSink);
    const preview = new DOMParser().parseFromString(result.html, "text/html");

    expect(result.headings.map(({ level }) => level)).toEqual([1, 2, 3, 4, 5, 6, ...Array(11).fill(2)]);
    expect(result.headings.map(({ id }) => id)).toEqual(again.headings.map(({ id }) => id));
    expect(new Set(result.headings.map(({ id }) => id)).size).toBe(result.headings.length);
    expect(result.resources).toContainEqual({ kind: "image", raw: "./assets/sample-image.svg" });
    expect(result.resources).toContainEqual({ kind: "local-link", raw: "./guide.md#install" });
    expect(result.resources).toContainEqual({ kind: "remote-link", raw: "https://example.com/guide" });

    expect(preview.querySelector(".task-list-item input[type=checkbox][disabled]")).not.toBeNull();
    expect(preview.querySelector("table")).not.toBeNull();
    expect(preview.querySelector('details[data-callout="warning"][open] .callout-title')?.textContent).toBe("Read carefully");
    expect(preview.querySelector("mark")?.textContent).toBe("text should be highlighted");
    expect(preview.querySelector("section.footnotes[data-footnotes]")).not.toBeNull();
    expect(preview.querySelectorAll(".math-inline, .math-block")).toHaveLength(2);
    expect(preview.querySelectorAll("pre > code.language-mermaid")).toHaveLength(6);
    expect(preview.querySelector('details:not([data-callout]) > summary')?.textContent).toBe("More information");
    expect(preview.body.textContent).toContain("Before the hostile element.");
    expect(preview.body.textContent).toContain("After the hostile element.");
    expect(preview.querySelector("script, [onerror], a[href^='javascript:']")).toBeNull();
    expect(result.html).not.toContain("window.kitchenSinkAttack");
  });

  it("keeps surrounding content when rich blocks are invalid or need later resource resolution", async () => {
    const result = await renderMarkdownDocument([
      "## Before",
      "",
      "before-isolation-sentinel",
      "",
      "![missing image](./missing.svg)",
      "",
      "```language-that-does-not-exist",
      "<img src=x onerror=alert(1)>",
      "```",
      "",
      "$\\notARealCommand{$",
      "",
      "```mermaid",
      "not a valid Mermaid diagram",
      "```",
      "",
      "[broken local link](./missing.md)",
      "",
      "## After",
      "",
      "after-isolation-sentinel"
    ].join("\n"));
    const preview = new DOMParser().parseFromString(result.html, "text/html");

    expect(preview.body.textContent).toContain("before-isolation-sentinel");
    expect(preview.body.textContent).toContain("after-isolation-sentinel");
    expect(preview.querySelector('img[src="./missing.svg"]')).not.toBeNull();
    expect(preview.querySelector('pre > code.language-plaintext[data-language="language-that-does-not-exist"]')?.textContent)
      .toContain("<img src=x onerror=alert(1)>");
    expect(preview.querySelector(".math-inline")).not.toBeNull();
    expect(preview.querySelector("pre > code.language-mermaid")?.textContent)
      .toContain("not a valid Mermaid diagram");
    expect(preview.querySelector('a[href="./missing.md"]')).not.toBeNull();
    expect(preview.querySelector("script, [onerror]")).toBeNull();
  });
});
