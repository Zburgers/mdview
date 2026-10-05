import { describe, expect, it } from "vitest";
import { prepareMarkdownImageSources } from "../../../src/rendering/enhancers/resources";

describe("Markdown image source preparation", () => {
  it("removes document-relative src before inserting an image into the webview", () => {
    const html = prepareMarkdownImageSources('<img src="../assets/photo%20one.png" alt="Photo">');
    const image = new DOMParser().parseFromString(html, "text/html").querySelector("img");
    expect(image?.hasAttribute("src")).toBe(false);
    expect(image?.dataset.mdviewSource).toBe("../assets/photo%20one.png");
  });

  it("keeps explicitly allowed remote and data image sources intact", () => {
    const html = prepareMarkdownImageSources('<img src="https://example.com/photo.png"><img src="data:image/png;base64,AAAA">');
    const images = new DOMParser().parseFromString(html, "text/html").querySelectorAll("img");
    expect(images[0].getAttribute("src")).toBe("https://example.com/photo.png");
    expect(images[1].getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it("blocks absolute paths and privileged schemes before they reach the resolver", () => {
    const html = prepareMarkdownImageSources('<img src="/etc/passwd" alt="Secret"><img src="file:///tmp/a.png" alt="File">');
    const images = new DOMParser().parseFromString(html, "text/html").querySelectorAll("img");
    expect(images[0].hasAttribute("src")).toBe(false);
    expect(images[1].hasAttribute("src")).toBe(false);
    expect(images[0].classList.contains("blocked-image-source")).toBe(true);
    expect(images[1].classList.contains("blocked-image-source")).toBe(true);
  });
});
