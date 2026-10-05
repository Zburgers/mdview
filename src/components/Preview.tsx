import mermaid from "mermaid";
import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { highlightText } from "../lib/highlight";
import { classifyHref } from "../lib/links";
import { resolveMarkdownImagePath } from "../lib/tauri";
import {
  containsRemoteResourceReference,
  renderMarkdown,
  sanitizeMermaidSvg
} from "../lib/markdown";

type PreviewProps = {
  markdown: string;
  filePath: string | null;
  theme: "light" | "dark";
  searchQuery: string;
  allowRemoteImages?: boolean;
  onToggleTask?: (line: number) => void;
  onOpenWikilink?: (target: string, heading?: string) => void;
  scrollToHeading?: string;
  onHeadingNavigationComplete?: () => void;
};

function normalizeHeading(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function slugifyHeading(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

export function Preview({
  markdown,
  filePath,
  theme,
  searchQuery,
  allowRemoteImages = false,
  onToggleTask,
  onOpenWikilink,
  scrollToHeading,
  onHeadingNavigationComplete
}: PreviewProps) {
  const [html, setHtml] = useState("");
  const [renderedMarkdown, setRenderedMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    renderMarkdown(markdown, { allowRemoteImages })
      .then((nextHtml) => {
        if (!cancelled) {
          setHtml(nextHtml);
          setRenderedMarkdown(markdown);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Markdown rendering failed");
          setRenderedMarkdown(markdown);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allowRemoteImages, markdown]);

  useEffect(() => {
    if (!scrollToHeading || renderedMarkdown !== markdown) return;
    if (error) {
      onHeadingNavigationComplete?.();
      return;
    }

    const root = containerRef.current;
    if (!root) return;
    let headingText = scrollToHeading;
    try {
      headingText = decodeURIComponent(headingText);
    } catch {
      // Keep literal heading text when it is not percent-encoded.
    }
    const target = normalizeHeading(headingText);
    const targetSlug = slugifyHeading(headingText);
    const heading = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6")).find((element) => {
      const text = element.textContent ?? "";
      return normalizeHeading(text) === target || slugifyHeading(text) === targetSlug;
    });

    heading?.scrollIntoView({ block: "start" });
    onHeadingNavigationComplete?.();
  }, [error, html, markdown, onHeadingNavigationComplete, renderedMarkdown, scrollToHeading]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }
    let cancelled = false;

    root.querySelectorAll("img[src]").forEach((image) => {
      const element = image as HTMLImageElement;
      const src = element.getAttribute("src");
      if (!src || !filePath || /^(https?:|data:|blob:|asset:)/i.test(src)) {
        return;
      }

      let relativePath: string;
      try {
        relativePath = decodeURIComponent(src);
      } catch {
        element.removeAttribute("src");
        return;
      }

      void resolveMarkdownImagePath(filePath, relativePath)
        .then((resolvedPath) => {
          if (!cancelled && root.contains(element) && element.getAttribute("src") === src) {
            element.src = convertFileSrc(resolvedPath);
          }
        })
        .catch(() => {
          if (!cancelled && root.contains(element) && element.getAttribute("src") === src) {
            element.removeAttribute("src");
          }
        });
    });

    root.querySelectorAll("pre code.language-mermaid").forEach((node, index) => {
      const code = node.textContent ?? "";
      const host = document.createElement("div");
      host.className = "mermaid-host";
      host.textContent = code;
      node.parentElement?.replaceWith(host);

      if (!allowRemoteImages && containsRemoteResourceReference(code)) {
        host.className = "mermaid-error";
        host.textContent = "Remote resources in this Mermaid diagram were blocked.";
        return;
      }

      mermaid
        .render(`mdview-mermaid-${index}-${Date.now()}`, code)
        .then(({ svg }) => {
          host.innerHTML = sanitizeMermaidSvg(svg, { allowRemoteImages });
        })
        .catch((cause: unknown) => {
          host.className = "mermaid-error";
          host.textContent = cause instanceof Error ? cause.message : "Mermaid diagram failed";
        });
    });

    // Enable task checkboxes (remove disabled) and wire change handler
    const taskCheckboxes = root.querySelectorAll<HTMLLIElement>("li.task-list-item input[type=\"checkbox\"]");
    taskCheckboxes.forEach((cb) => {
      cb.removeAttribute("disabled");
      // avoid stacking listeners: clone pattern not needed because effect re-runs on html change
    });

    const onChange = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.matches("li.task-list-item input[type=\"checkbox\"]")) return;
      const lineAttr = target.getAttribute("data-line");
      const line = lineAttr ? Number.parseInt(lineAttr, 10) : NaN;
      if (Number.isFinite(line)) {
        onToggleTask?.(line);
      }
    };
    root.addEventListener("change", onChange);

    highlightText(root, searchQuery);

    return () => {
      cancelled = true;
      root.removeEventListener("change", onChange);
    };
  }, [allowRemoteImages, html, filePath, theme, searchQuery, onToggleTask]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default"
    });
  }, [theme]);

  async function handleLink(anchor: Element): Promise<void> {
    const href = anchor.getAttribute("href") ?? "";
    // Wikilink handling
    if (anchor.classList.contains("wikilink")) {
      const target = anchor.getAttribute("data-wikilink") ?? href.replace(/^#wikilink-/, "");
      const heading = anchor.getAttribute("data-heading") ?? undefined;
      if (onOpenWikilink) {
        onOpenWikilink(target, heading);
        return;
      }
    }

    const classified = classifyHref(href);

    if (classified.kind === "external") {
      try {
        const confirmed = await ask(
          `Open this link in your default browser?\n\n${classified.href}`,
          {
            title: "Open external link?",
            kind: "warning"
          }
        );

        if (confirmed) {
          await openUrl(classified.href);
        }
      } catch (cause: unknown) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        await message(`mdview could not open this link.\n\n${detail}`, {
          title: "Could not open link",
          kind: "error"
        });
      }
      return;
    }

    if (classified.kind === "anchor") {
      const rawId = classified.href.slice(1);
      let id = rawId;
      try {
        id = decodeURIComponent(rawId);
      } catch {
        // Keep the literal fragment when it is not valid percent-encoding.
      }
      document.getElementById(id)?.scrollIntoView({ block: "start" });
      return;
    }

    if (classified.kind === "file") {
      await message(
        "Local file links are not opened automatically from rendered Markdown. Use mdview's Open command to choose the file explicitly.",
        {
          title: "Local link blocked",
          kind: "warning"
        }
      );
      return;
    }

    await message("mdview blocked this link because its protocol is not permitted.", {
      title: "Link blocked",
      kind: "warning"
    });
  }

  function interceptLinkEvent(event: React.MouseEvent<HTMLDivElement>): Element | null {
    const anchor = (event.target as Element).closest("a[href]");
    if (!anchor) {
      return null;
    }

    event.preventDefault();
    event.stopPropagation();
    return anchor;
  }

  async function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = interceptLinkEvent(event);
    if (anchor) {
      await handleLink(anchor);
    }
  }

  function onAuxClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 1) {
      return;
    }

    const anchor = interceptLinkEvent(event);
    if (anchor) {
      void handleLink(anchor);
    }
  }

  function onContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    interceptLinkEvent(event);
  }

  if (error) {
    return <pre className="render-error">{error}</pre>;
  }

  return (
    <article
      className="preview markdown-body"
      ref={containerRef}
      onClick={onClick}
      onAuxClick={onAuxClick}
      onContextMenu={onContextMenu}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
