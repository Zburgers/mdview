import type { AppSettings } from "../types";

export const defaultSettings: AppSettings = {
  theme: "system",
  viewMode: "reader",
  recentFiles: [],
  syncScroll: true,
  trustedHtml: false
};

export const emptyMarkdown =
  "# Welcome to mdview\n\nOpen a Markdown file or drag one into the window.";
