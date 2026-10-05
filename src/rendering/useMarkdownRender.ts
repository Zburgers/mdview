import { useEffect, useState } from "react";
import { renderMarkdownDocument } from "./render";
import type { RenderResult } from "./types";

export type MarkdownRenderState =
  | { status: "loading"; result: null; error: null }
  | { status: "success"; result: RenderResult; error: null }
  | { status: "error"; result: null; error: string };

type StoredRenderState = { key: string; state: MarkdownRenderState };

export function useMarkdownRender(markdown: string, allowRemoteImages: boolean): MarkdownRenderState {
  const key = JSON.stringify([markdown, allowRemoteImages]);
  const [stored, setStored] = useState<StoredRenderState>({
    key: "",
    state: { status: "loading", result: null, error: null }
  });

  useEffect(() => {
    let current = true;
    setStored({ key, state: { status: "loading", result: null, error: null } });
    renderMarkdownDocument(markdown, { allowRemoteImages })
      .then((result) => {
        if (current) setStored({ key, state: { status: "success", result, error: null } });
      })
      .catch((cause: unknown) => {
        if (current) {
          setStored({
            key,
            state: {
              status: "error",
              result: null,
              error: cause instanceof Error ? cause.message : "Markdown rendering failed."
            }
          });
        }
      });
    return () => { current = false; };
  }, [allowRemoteImages, key, markdown]);

  return stored.key === key ? stored.state : { status: "loading", result: null, error: null };
}
