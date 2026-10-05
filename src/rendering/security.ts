import DOMPurify from "dompurify";

const allowedDataImagePattern =
  /^data:image\/(?:avif|bmp|gif|jpe?g|png|webp|x-icon|vnd\.microsoft\.icon)(?:;|,)/i;

export function sanitizeMarkdownHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "a", "blockquote", "br", "code", "del", "details", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
      "hr", "img", "input", "li", "ol", "p", "pre", "span", "strong", "summary", "table", "tbody", "td",
      "th", "thead", "tr", "ul"
    ],
    ALLOWED_ATTR: [
      "alt", "checked", "class", "data-block", "data-callout", "data-fold", "data-heading", "data-line", "data-math",
      "data-wikilink", "disabled", "href", "open", "rel", "src", "title", "type"
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "audio", "video", "source"],
    ADD_ATTR: ["target"]
  });
}

export function sanitizeKaTeXHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["span"],
    ALLOWED_ATTR: ["aria-hidden", "class", "style", "title"],
    ALLOW_DATA_ATTR: false
  });
}

export function applyPreviewElementPolicy(html: string, allowRemoteImages: boolean): string {
  const document = new DOMParser().parseFromString(html, "text/html");

  document.querySelectorAll("a[href]").forEach((anchor) => {
    anchor.setAttribute("rel", "noreferrer");
  });

  document.querySelectorAll("input").forEach((input) => {
    const isDisabledCheckbox =
      input.getAttribute("type")?.toLowerCase() === "checkbox" && input.hasAttribute("disabled");
    if (!isDisabledCheckbox) input.remove();
  });

  document.querySelectorAll("img[src]").forEach((image) => {
    const originalSrc = image.getAttribute("src");
    if (!originalSrc) return;
    const src = originalSrc.trim();
    if (!src) {
      markImageSourceBlocked(image);
      return;
    }
    if (src !== originalSrc) image.setAttribute("src", src);
    if (src.startsWith("//")) {
      if (allowRemoteImages) image.setAttribute("src", `https:${src}`);
      else markImageSourceBlocked(image);
      return;
    }
    if (!isAllowedImageSource(src, allowRemoteImages, true)) markImageSourceBlocked(image);
  });

  return document.body.innerHTML;
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

function markImageSourceBlocked(image: Element): void {
  image.removeAttribute("src");
  image.classList.add("blocked-image-source");
  image.setAttribute("title", "Image source blocked by mdview");
}
