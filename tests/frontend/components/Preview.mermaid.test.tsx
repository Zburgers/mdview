import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Preview } from "../../../src/components/Preview";

const { mermaidInitializeMock, mermaidRenderMock } = vi.hoisted(() => ({
  mermaidInitializeMock: vi.fn(),
  mermaidRenderMock: vi.fn()
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidInitializeMock,
    render: mermaidRenderMock
  }
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path
}));

vi.mock("../../../src/lib/highlight", () => ({
  highlightText: vi.fn()
}));

describe("Preview mermaid sanitization", () => {
  afterEach(() => {
    mermaidInitializeMock.mockReset();
    mermaidRenderMock.mockReset();
  });

  it("sanitizes mermaid svg output before inserting it into the preview", async () => {
    mermaidRenderMock.mockResolvedValue({
      svg: '<svg><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><g onload="alert(1)"><a href="javascript:alert(1)">node</a><text>safe</text></g></svg>'
    });

    const { container } = render(
      <Preview
        markdown={"```mermaid\ngraph TD\n  A-->B\n```"}
        filePath={null}
        theme="light"
        searchQuery=""
      />
    );

    await waitFor(() => expect(mermaidRenderMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const host = container.querySelector(".mermaid-host");
      expect(host?.querySelector("svg")).toBeInTheDocument();
      expect(host?.innerHTML).not.toContain("<script");
      expect(host?.innerHTML).not.toContain("foreignObject");
      expect(host?.innerHTML).not.toContain("onload=");
      expect(host?.innerHTML).not.toContain("javascript:alert");
      expect(host?.textContent).toContain("safe");
    });

    expect(mermaidInitializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: "strict",
        startOnLoad: false,
        theme: "default"
      })
    );
  });
});
