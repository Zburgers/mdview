import { useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { highlightText } from "../lib/highlight";
import { classifyHref } from "../lib/links";
import { enhanceCodeBlocks } from "../rendering/enhancers/code";
import { enhanceMarkdownImages, prepareMarkdownImageSources } from "../rendering/enhancers/resources";
import { enhanceMermaid } from "../rendering/enhancers/mermaid";
import { enhanceTables } from "../rendering/enhancers/tables";
import type { HeadingEntry, RenderResult } from "../rendering/types";
import type { MarkdownRenderState } from "../rendering/useMarkdownRender";
import { ImageLightbox } from "./ImageLightbox";

type PreviewProps = {
  renderState: MarkdownRenderState;
  filePath: string | null;
  theme: "light" | "dark";
  searchQuery: string;
  allowRemoteImages?: boolean;
  onToggleTask?: (line: number) => void;
  onOpenWikilink?: (target: string, heading?: string) => void;
  onOpenLocalLink?: (path: string, heading?: string) => void;
  onHeadingActive?: (headingId: string | null) => void;
  scrollToHeading?: string;
  onHeadingNavigationComplete?: () => void;
};

function normalizeHeading(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function decodeFragment(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function findHeading(headings: readonly HeadingEntry[], value: string): HeadingEntry | undefined {
  const decoded = decodeFragment(value);
  return headings.find((heading) => heading.id === value || heading.id === decoded)
    ?? headings.find((heading) => normalizeHeading(heading.text) === normalizeHeading(decoded));
}

function scrollToHeading(root: HTMLElement, headings: readonly HeadingEntry[], value: string): void {
  const heading = findHeading(headings, value);
  if (!heading) return;
  const element = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
    .find((candidate) => candidate.id === heading.id);
  element?.scrollIntoView({ block: "start" });
}

export function Preview({
  renderState,
  filePath,
  theme,
  searchQuery,
  allowRemoteImages = false,
  onToggleTask,
  onOpenWikilink,
  onOpenLocalLink,
  onHeadingActive,
  scrollToHeading: pendingHeading,
  onHeadingNavigationComplete
}: PreviewProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const result: RenderResult | null = renderState.status === "success" ? renderState.result : null;
  const html = useMemo(() => result ? prepareMarkdownImageSources(result.html) : "", [result]);
  const htmlContent = useMemo(() => ({ __html: html }), [html]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !result) return;
    return enhanceMarkdownImages(root, filePath, allowRemoteImages);
  }, [allowRemoteImages, filePath, html, result]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !result) return;
    return enhanceMermaid(root, theme, allowRemoteImages);
  }, [allowRemoteImages, html, result, theme]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !result) return;
    enhanceTables(root);
    return enhanceCodeBlocks(root);
  }, [html, result]);


  useEffect(() => {
    const root = containerRef.current;
    if (!root || !result) return;
    const taskCheckboxes = root.querySelectorAll<HTMLLIElement>("li.task-list-item input[type=\"checkbox\"]");
    taskCheckboxes.forEach((checkbox) => checkbox.removeAttribute("disabled"));
    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.matches("li.task-list-item input[type=\"checkbox\"]")) return;
      const line = Number.parseInt(target.getAttribute("data-line") ?? "", 10);
      if (Number.isFinite(line)) onToggleTask?.(line);
    };
    root.addEventListener("change", onChange);
    return () => root.removeEventListener("change", onChange);
  }, [html, onToggleTask, result]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !result) return;
    highlightText(root, searchQuery);
  }, [html, result, searchQuery]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !result || !pendingHeading) return;
    scrollToHeading(root, result.headings, pendingHeading);
    onHeadingNavigationComplete?.();
  }, [html, onHeadingNavigationComplete, pendingHeading, result]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !result || typeof IntersectionObserver === "undefined") return;
    const elements = new Map<string, HTMLElement>();
    for (const heading of result.headings) {
      const element = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
        .find((candidate) => candidate.id === heading.id);
      if (element) elements.set(heading.id, element);
    }
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
      if (visible[0]) onHeadingActive?.((visible[0].target as HTMLElement).id);
    }, { root: root.parentElement, rootMargin: "-8% 0px -78% 0px", threshold: 0 });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [html, onHeadingActive, result]);

  async function handleLink(anchor: Element): Promise<void> {
    const href = anchor.getAttribute("href") ?? "";
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
        if (await ask(`Open this link in your default browser?\n\n${classified.href}`, {
          title: "Open external link?", kind: "warning"
        })) await openUrl(classified.href);
      } catch (cause: unknown) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        await message(`mdview could not open this link.\n\n${detail}`, { title: "Could not open link", kind: "error" });
      }
      return;
    }

    if (classified.kind === "anchor") {
      if (containerRef.current && result) scrollToHeading(containerRef.current, result.headings, classified.href.slice(1));
      return;
    }

    if (classified.kind === "local") {
      onOpenLocalLink?.(classified.path, classified.heading);
      return;
    }

    if (classified.kind === "file") {
      await message("Local file links are not opened automatically from rendered Markdown. Use mdview's Open command to choose the file explicitly.", {
        title: "Local link blocked", kind: "warning"
      });
      return;
    }

    await message("mdview blocked this link because its protocol is not permitted.", { title: "Link blocked", kind: "warning" });
  }

  function interceptLinkEvent(event: React.MouseEvent<HTMLElement>): Element | null {
    const anchor = (event.target as Element).closest("a[href]");
    if (!anchor) return null;
    event.preventDefault();
    event.stopPropagation();
    return anchor;
  }

  if (renderState.status === "error") return <pre className="render-error">{renderState.error}</pre>;
  if (renderState.status === "loading") return <article className="preview markdown-body" aria-busy="true"><p>Rendering Markdown…</p></article>;

  return (
    <>
      <article
        className="preview markdown-body"
        ref={containerRef}
        onClick={(event) => {
          const anchor = interceptLinkEvent(event);
          if (anchor) void handleLink(anchor);
          const image = (event.target as Element).closest<HTMLImageElement>("img");
          if (image?.dataset.mdviewResource === "loaded" && image.src) {
            setLightbox({ src: image.src, alt: image.alt });
          }
        }}
        onAuxClick={(event) => {
          if (event.button !== 1) return;
          const anchor = interceptLinkEvent(event);
          if (anchor) void handleLink(anchor);
        }}
        onContextMenu={(event) => { interceptLinkEvent(event); }}
        dangerouslySetInnerHTML={htmlContent}
      />
      <ImageLightbox
        open={lightbox !== null}
        src={lightbox?.src ?? ""}
        alt={lightbox?.alt ?? ""}
        onClose={() => setLightbox(null)}
      />
    </>
  );
}
