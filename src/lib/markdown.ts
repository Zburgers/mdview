import DOMPurify from "dompurify";
import { Marked, Renderer } from "marked";

const markdownExtensions = new Set(["md", "markdown", "mdown", "mkd", "txt", "text"]);

const renderer = new Renderer();

renderer.link = ({ href, title, tokens }) => {
  const text = markedParser.parser(tokens);
  const safeTitle = title ? ` title="${escapeAttribute(title)}"` : "";
  return `<a href="${escapeAttribute(href)}"${safeTitle} rel="noreferrer">${text}</a>`;
};

const markedParser = new Marked({
  async: false,
  breaks: false,
  gfm: true,
  renderer
});

export type NormalizedMarkdown = {
  text: string;
  warning: string | null;
};

export function isMarkdownLikePath(path: string): boolean {
  const extension = path.split(/[./\\]/).pop()?.toLowerCase() ?? "";
  return markdownExtensions.has(extension);
}

export function normalizeMarkdownText(text: string): NormalizedMarkdown {
  if (text.includes("\uFFFD")) {
    return {
      text,
      warning: "The file contained invalid encoding bytes and was decoded lossily."
    };
  }

  return { text, warning: null };
}

export function getMarkdownFileName(path: string | null): string {
  if (!path) {
    return "Untitled";
  }

  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export async function renderMarkdown(markdown: string): Promise<string> {
  const html = addTaskListClasses(await markedParser.parse(markdown));
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "a",
      "blockquote",
      "br",
      "code",
      "del",
      "details",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "img",
      "input",
      "li",
      "ol",
      "p",
      "pre",
      "strong",
      "summary",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul"
    ],
    ALLOWED_ATTR: [
      "alt",
      "checked",
      "class",
      "disabled",
      "href",
      "rel",
      "src",
      "title",
      "type"
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    ADD_ATTR: ["target"]
  });
}

function addTaskListClasses(html: string): string {
  return html.replaceAll(
    /<li>(<input (?:checked="" )?disabled="" type="checkbox">)/g,
    '<li class="task-list-item">$1'
  );
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
