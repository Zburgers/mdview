import { describe, expect, it } from "vitest";
import { classifyHref } from "./links";

describe("classifyHref", () => {
  it("allows ordinary http links to be opened by user action", () => {
    expect(classifyHref("https://example.com/docs")).toEqual({
      kind: "external",
      href: "https://example.com/docs"
    });
  });

  it("blocks script and data navigation", () => {
    expect(classifyHref("javascript:alert(1)").kind).toBe("blocked");
    expect(classifyHref("data:text/html,hi").kind).toBe("blocked");
  });

  it("blocks mailto and custom protocols instead of treating them as external", () => {
    expect(classifyHref("mailto:alice@example.com").kind).toBe("blocked");
    expect(classifyHref("tel:+15551234567").kind).toBe("blocked");
    expect(classifyHref("slack://channel?team=T123&id=C456").kind).toBe("blocked");
  });

  it("keeps local anchors in the preview", () => {
    expect(classifyHref("#heading")).toEqual({ kind: "anchor", href: "#heading" });
  });
});
