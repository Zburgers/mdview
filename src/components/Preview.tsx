import mermaid from "mermaid";
import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { highlightText } from "../lib/highlight";
import { classifyHref } from "../lib/links";
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
};

export function Preview({ markdown, filePath, theme, searchQuery, allowRemoteImages = false }: PreviewProps) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    renderMarkdown(markdown, { allowRemoteImages })
      .then((nextHtml) => {
        if (!cancelled) {
          setHtml(nextHtml);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Markdown rendering failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allowRemoteImages, markdown]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }

    root.querySelectorAll("img[src]").forEach((image) => {
      const element = image as HTMLImageElement;
      const src = element.getAttribute("src");
      if (!src || !filePath || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/")) {
        return;
      }

      const base = filePath.split(/[\\/]/).slice(0, -1).join("/");
      const normalized = `${base}/${src}`;
      element.src = convertFileSrc(normalized);
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
    highlightText(root, searchQuery);
  }, [allowRemoteImages, html, filePath, theme, searchQuery]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default"
    });
  }, [theme]);

  async function handleLink(anchor: Element): Promise<void> {
    const href = anchor.getAttribute("href") ?? "";
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
