import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveMarkdownImagePath } from "../../lib/tauri";

export function prepareMarkdownImageSources(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    const src = image.getAttribute("src")?.trim() ?? "";
    if (!src || /^(?:https?:|data:|blob:)/i.test(src)) return;
    if (src.startsWith("/") || src.startsWith("\\") || src.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(src)) {
      image.removeAttribute("src");
      image.classList.add("blocked-image-source");
      image.setAttribute("title", "Image path is not document-relative");
      return;
    }
    image.dataset.mdviewSource = src;
    image.removeAttribute("src");
  });
  return document.body.innerHTML;
}

export function enhanceMarkdownImages(
  root: HTMLElement,
  markdownPath: string | null,
  allowRemoteImages: boolean
): () => void {
  let cancelled = false;
  root.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const src = image.getAttribute("src");
    const relativePath = image.dataset.mdviewSource;
    image.onload = () => {
      image.dataset.mdviewResource = "loaded";
    };
    image.onerror = () => showUnavailableImage(image, "Image could not be loaded.");

    if (relativePath !== undefined) {
      if (!markdownPath) {
        showUnavailableImage(image, "Save the document before using local images.");
        return;
      }
      image.dataset.mdviewResource = "resolving";
      void resolveMarkdownImagePath(markdownPath, relativePath)
        .then((resolvedPath) => {
          if (cancelled || !root.contains(image)) return;
          image.dataset.mdviewResource = "authorized";
          image.src = convertFileSrc(resolvedPath);
        })
        .catch(() => {
          if (!cancelled && root.contains(image)) showUnavailableImage(image, imageFailureReason(relativePath));
        });
      return;
    }

    if (src && /^https?:/i.test(src)) {
      if (allowRemoteImages) image.dataset.mdviewResource = "authorized";
      else showUnavailableImage(image, "Remote images are blocked.");
      return;
    }

    if (src && /^(?:data:image\/|blob:)/i.test(src)) {
      image.dataset.mdviewResource = "authorized";
      return;
    }

    showUnavailableImage(image, image.classList.contains("blocked-image-source")
      ? "Image source is blocked by mdview."
      : "Image path could not be authorized.");
  });

  return () => {
    cancelled = true;
    root.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
      image.onload = null;
      image.onerror = null;
    });
  };
}

export function showUnavailableImage(image: HTMLImageElement, reason: string): void {
  const placeholder = document.createElement("span");
  const alt = image.getAttribute("alt")?.trim();
  placeholder.className = "markdown-image-placeholder";
  placeholder.setAttribute("role", "img");
  placeholder.setAttribute("aria-label", [alt, reason].filter(Boolean).join(". "));
  placeholder.textContent = `${alt ? `${alt}: ` : ""}${reason}`;
  image.replaceWith(placeholder);
}

function imageFailureReason(path: string): string {
  const extension = path.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
  if (!extension || !/^(?:avif|bmp|gif|jpe?g|png|svg|webp|ico)$/i.test(extension)) {
    return "Image type is not supported.";
  }
  return "Image file is missing or could not be opened.";
}
