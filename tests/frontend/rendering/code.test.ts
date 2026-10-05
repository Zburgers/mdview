import { describe, expect, it } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";

describe("fenced code rendering", () => {
  it("highlights known languages before sanitizing generated spans", async () => {
    const result = await renderMarkdownDocument('```js\nconst value = "ok";\n```');
    const code = new DOMParser().parseFromString(result.html, "text/html").querySelector<HTMLElement>("pre > code");

    expect(code?.classList.contains("hljs")).toBe(true);
    expect(code?.classList.contains("language-js")).toBe(true);
    expect(code?.dataset.language).toBe("js");
    expect(code?.querySelector("span.hljs-keyword")).not.toBeNull();
  });

  it("leaves unknown and missing languages as escaped plaintext", async () => {
    const unknown = await renderMarkdownDocument('```made-up\n<script>alert(1)</script>\n```');
    const plain = await renderMarkdownDocument("```\n<b>text</b>\n```");
    const unknownCode = new DOMParser().parseFromString(unknown.html, "text/html").querySelector<HTMLElement>("code");
    const plainCode = new DOMParser().parseFromString(plain.html, "text/html").querySelector<HTMLElement>("code");

    expect(unknownCode?.textContent).toContain("<script>alert(1)</script>");
    expect(unknownCode?.querySelector("script")).toBeNull();
    expect(unknownCode?.classList.contains("language-plaintext")).toBe(true);
    expect(unknownCode?.dataset.language).toBe("made-up");
    expect(plainCode?.textContent).toBe("<b>text</b>");
    expect(plainCode?.dataset.language).toBeUndefined();
  });
});
