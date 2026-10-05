import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { renderMarkdownDocument } from "../rendering/render";
import { promoteStandaloneMermaid } from "../rendering/parser";
import type { RenderOptions } from "../rendering/types";

const markdownExtensions = new Set(["md", "markdown", "mdown", "mkd", "txt", "text"]);
const remoteResourcePattern = /(?:https?|ftps?|wss?):|(?:^|[\s("'=(])\/{2,}[a-z0-9]/i;
const allowedDataImagePattern =
  /^data:image\/(?:avif|bmp|gif|jpe?g|png|webp|x-icon|vnd\.microsoft\.icon)(?:;|,)/i;

export type NormalizedMarkdown = {
  text: string;
  warning: string | null;
};

export type MarkdownRenderOptions = RenderOptions;
export { renderMarkdownDocument, promoteStandaloneMermaid };

export function isMarkdownLikePath(path: string): boolean {
  const extension = path.split(/[./\\]/).pop()?.toLowerCase() ?? "";
  return markdownExtensions.has(extension);
}

export function normalizeMarkdownText(text: string): NormalizedMarkdown {
  if (text.includes("\uFFFD")) {
    return { text, warning: "The file contained invalid encoding bytes and was decoded lossily." };
  }
  return { text, warning: null };
}

export function getMarkdownFileName(path: string | null): string {
  if (!path) return "Untitled";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export { getTaskLineMap } from "../rendering/render";

export async function renderMarkdown(markdown: string, options: MarkdownRenderOptions = {}): Promise<string> {
  return (await renderMarkdownDocument(markdown, options)).html;
}

export function containsRemoteResourceReference(value: string): boolean {
  return remoteResourcePattern.test(value);
}

function containsRemoteCssResourceReference(value: string): boolean {
  return containsRemoteResourceReference(decodeCssEscapes(removeCssComments(value)));
}

function removeCssComments(value: string): string {
  let result = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length;) {
    const character = value[index];
    if (character === "\\") {
      result += value.slice(index, index + 2);
      index += 2;
    } else if (quote) {
      result += character;
      if (character === quote) quote = null;
      index += 1;
    } else if (character === "'" || character === '"') {
      quote = character;
      result += character;
      index += 1;
    } else if (character === "/" && value[index + 1] === "*") {
      const commentEnd = value.indexOf("*/", index + 2);
      if (commentEnd < 0) break;
      index = commentEnd + 2;
    } else {
      result += character;
      index += 1;
    }
  }
  return result;
}

function decodeCssEscapes(value: string): string {
  return value.replace(
    /\\(?:([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|(\r\n|[\s\S]))/gi,
    (_match, hex: string | undefined, escaped: string | undefined) => {
      if (hex === undefined) return escaped && /[\r\n\f]/.test(escaped) ? "" : escaped ?? "";
      const codePoint = Number.parseInt(hex, 16);
      return codePoint === 0 || codePoint > 0x10ffff ? "\uFFFD" : String.fromCodePoint(codePoint);
    }
  );
}

export function sanitizeMermaidSvg(svg: string, { allowRemoteImages = false }: MarkdownRenderOptions = {}): string {
  const sanitized = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed"]
  });
  const document = new DOMParser().parseFromString(sanitized, "image/svg+xml");
  const root = document.documentElement;
  if (root.nodeName.toLowerCase() === "parsererror") return "";

  root.querySelectorAll("image").forEach((image) => {
    ["href", "xlink:href", "src"].forEach((attribute) => {
      const originalValue = image.getAttribute(attribute);
      if (!originalValue) return;
      const value = originalValue.trim();
      if (!isAllowedImageSource(value, allowRemoteImages, false)) image.removeAttribute(attribute);
      else if (value !== originalValue) image.setAttribute(attribute, value);
    });
  });

  if (!allowRemoteImages) {
    [root, ...root.querySelectorAll("*")].forEach((element) => {
      if (element.nodeName.toLowerCase() !== "image") {
        ["href", "xlink:href", "src"].forEach((attribute) => {
          const value = element.getAttribute(attribute);
          if (value && containsRemoteResourceReference(value)) element.removeAttribute(attribute);
        });
      }
      const style = element.getAttribute("style");
      if (style && containsRemoteCssResourceReference(style)) element.removeAttribute("style");
    });
    root.querySelectorAll("style").forEach((style) => {
      if (containsRemoteCssResourceReference(style.textContent ?? "")) style.remove();
    });
  }
  return new XMLSerializer().serializeToString(root);
}

function isAllowedImageSource(src: string, allowRemoteImages: boolean, allowRelative: boolean): boolean {
  if (!src) return false;
  try {
    const url = new URL(src);
    if (url.protocol === "http:" || url.protocol === "https:") return allowRemoteImages;
    if (url.protocol === "data:") return allowedDataImagePattern.test(src);
    return url.protocol === "blob:";
  } catch {
    return allowRelative;
  }
}
