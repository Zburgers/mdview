import { createRenderParser, createRenderSession, promoteStandaloneMermaid } from "./parser";
import { applyPreviewElementPolicy, sanitizeMarkdownHtml } from "./security";
import type { RenderOptions, RenderResult } from "./types";
import { assignSourceAnchors } from "./sourceLayout";

export async function renderMarkdownDocument(
  markdown: string,
  { allowRemoteImages = false }: RenderOptions = {}
): Promise<RenderResult> {
  const session = createRenderSession(markdown);
  const parser = createRenderParser(session);
  const parsed = await parser.parse(promoteStandaloneMermaid(markdown, session.sourceLines));
  let html = sanitizeMarkdownHtml(addTaskListClasses(parsed, session.sourceMarkerPrefix));
  for (const [placeholder, mathHtml] of session.math) html = html.replaceAll(placeholder, mathHtml);
  html = assignHeadingIds(html, session.headingMarkerPrefix, session.headings);
  html = assignSourceAnchors(html, session.sourceMarkerPrefix);

  return {
    html: applyPreviewElementPolicy(html, allowRemoteImages),
    headings: session.headings,
    resources: session.resources,
    diagnostics: session.diagnostics
  };
}

function assignHeadingIds(html: string, markerPrefix: string, headings: RenderResult["headings"]): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("h1[class], h2[class], h3[class], h4[class], h5[class], h6[class]").forEach((heading) => {
    for (const className of Array.from(heading.classList)) {
      if (!className.startsWith(markerPrefix)) continue;
      const ordinal = Number(className.slice(markerPrefix.length));
      const entry = headings[ordinal];
      heading.classList.remove(className);
      if (heading.classList.length === 0) heading.removeAttribute("class");
      if (entry) heading.id = entry.id;
    }
  });
  return document.body.innerHTML;
}

export function getTaskLineMap(markdown: string): number[] {
  const lines = markdown.split("\n");
  const map: number[] = [];
  const listIndents: number[] = [];
  let fence: { marker: "`" | "~"; length: number; indent: number } | null = null;

  lines.forEach((line, idx) => {
    const content = line.replace(/^(?: {0,3}>[\t ]?)+/, "");
    const leadingIndent = /^[\t ]*/.exec(content)?.[0] ?? "";
    const indent = [...leadingIndent].reduce(
      (columns, character) => character === "\t" ? columns + 4 - (columns % 4) : columns + 1,
      0
    );
    const isNestedList = listIndents.some((parentIndent) => indent > parentIndent && indent < parentIndent + 6);
    if (fence) {
      const closingFence = /^( *)(`+|~+)[\t ]*$/.exec(content);
      if (
        closingFence &&
        closingFence[2][0] === fence.marker &&
        closingFence[2].length >= fence.length &&
        closingFence[1].length >= fence.indent &&
        closingFence[1].length <= fence.indent + 3
      ) fence = null;
      return;
    }

    const openingFence = /^( *)(`{3,}|~{3,})/.exec(content);
    if (openingFence && (indent < 4 || isNestedList)) {
      fence = {
        marker: openingFence[2][0] === "`" ? "`" : "~",
        length: openingFence[2].length,
        indent: Number(openingFence[1].length)
      };
      return;
    }
    if (!content.trim()) return;

    const listMarker = /^( *)(?:[-*+]|\d+[.)])\s+/.exec(content);
    while (listIndents.length > 0 && indent <= listIndents[listIndents.length - 1]) listIndents.pop();
    const isTask = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/.test(content);
    const isMarkdownList = indent < 4 || isNestedList;
    if (isTask && isMarkdownList) map.push(idx);
    if (listMarker && isMarkdownList) listIndents.push(indent);
    else if (indent === 0) listIndents.length = 0;
  });
  return map;
}

function addTaskListClasses(html: string, markerPrefix: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("li[class]").forEach((item) => {
    if (!item.classList.contains(`${markerPrefix}TASK`)) return;
    item.classList.remove(`${markerPrefix}TASK`);
    const sourceClass = [...item.classList].find((name) => name.startsWith(markerPrefix));
    const line = Number(sourceClass?.slice(markerPrefix.length));
    const input = item.querySelector(':scope > input[disabled][type="checkbox"], :scope > p:first-child > input[disabled][type="checkbox"]');
    if (!input || !Number.isInteger(line) || line < 0) return;
    item.classList.add("task-list-item");
    input.setAttribute("data-line", String(line));
  });
  return document.body.innerHTML;
}
