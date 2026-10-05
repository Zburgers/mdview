import { describe, expect, it } from "vitest";
import { classifyHref } from "../../../src/lib/links";

describe("classifyHref", () => {
  it("allows ordinary http links to be opened by user action", () => {
    expect(classifyHref("https://example.com/docs")).toEqual({ kind: "external", href: "https://example.com/docs" });
  });

  it("blocks script, data, mailto and custom protocols", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,hi", "mailto:alice@example.com", "tel:+15551234567", "slack://channel?id=C456"]) {
      expect(classifyHref(href).kind).toBe("blocked");
    }
  });

  it("keeps same-document anchors in the preview", () => {
    expect(classifyHref("#heading")).toEqual({ kind: "anchor", href: "#heading" });
  });

  it.each([
    ["guide.md", "guide.md", undefined],
    ["./guide.md#Install", "./guide.md", "Install"],
    ["../guide%20one.md#A%20B", "../guide%20one.md", "A%20B"],
    ["../notes/%E2%98%83.md#Heading", "../notes/%E2%98%83.md", "Heading"]
  ])("classifies local Markdown target %s", (href, path, heading) => {
    expect(classifyHref(href)).toEqual({ kind: "local", href, path, heading });
  });

  it.each(["/guide.md", "file:///tmp/guide.md", "javascript:alert(1)", "image.png", "guide.md?download=1"]) (
    "does not authorize unsupported path %s", (href) => {
      expect(["blocked", "file"]).toContain(classifyHref(href).kind);
    }
  );
});
