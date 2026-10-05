import { describe, expect, it } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";

describe("==highlight== inline syntax", () => {
  it("renders inline Markdown inside a sanitized mark element", async () => {
    const result = await renderMarkdownDocument("This is ==**important** text==.");
    const document = new DOMParser().parseFromString(result.html, "text/html");

    expect(document.querySelector("mark strong")?.textContent).toBe("important");
  });

  it("does not allow raw HTML attributes through mark", async () => {
    const result = await renderMarkdownDocument('==<img src="x" onerror="alert(1)">== <mark onclick="bad()">raw</mark>');
    const document = new DOMParser().parseFromString(result.html, "text/html");

    expect(document.querySelector("mark[onclick]")).toBeNull();
    expect(document.querySelector("img[onerror]")).toBeNull();
  });
});
