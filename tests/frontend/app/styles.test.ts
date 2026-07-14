/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../../src/styles.css"), "utf8");

function ruleFor(selector: string) {
  const selectorStart = css.indexOf(`${selector} {`);
  if (selectorStart === -1) {
    return "";
  }

  const bodyStart = css.indexOf("{", selectorStart);
  const bodyEnd = css.indexOf("}", bodyStart);
  return bodyStart === -1 || bodyEnd === -1 ? "" : css.slice(bodyStart + 1, bodyEnd);
}

describe("desktop layout CSS", () => {
  it("prevents the webview page from becoming the scroll container", () => {
    const rootRule = ruleFor("html,\nbody,\n#root");
    const shellRule = ruleFor(".app-shell");
    const workspaceRule = ruleFor(".workspace");

    expect(rootRule).toContain("height: 100%");
    expect(rootRule).toContain("overflow: hidden");
    expect(shellRule).toContain("height: 100dvh");
    expect(shellRule).toContain("overflow: hidden");
    expect(workspaceRule).toContain("overflow: hidden");
  });

  it("keeps scrolling scoped to the markdown panes", () => {
    const sourceRule = ruleFor(".source-pane");
    const previewScrollRule = ruleFor(".preview-scroll");
    const previewRule = ruleFor(".preview");

    expect(sourceRule).toContain("height: 100%");
    expect(sourceRule).toContain("overflow: auto");
    expect(previewScrollRule).toContain("height: 100%");
    expect(previewScrollRule).toContain("overflow: auto");
    expect(previewRule).toContain("min-height: 100%");
  });

  it("keeps editor and preview text out of transformed workspace layers", () => {
    const workspaceRule = ruleFor(".workspace");

    expect(workspaceRule).not.toContain("animation:");
    expect(workspaceRule).not.toContain("transform:");
  });
});
