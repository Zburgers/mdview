export type ThemePreference = "system" | "light" | "dark" | "paper" | "midnight" | "sage" | "nordic" | "velvet" | "crimson";

export type ViewMode = "reader" | "split" | "source";

export type MarkdownDocument = {
  isOpen: boolean;
  path: string | null;
  name: string;
  markdown: string;
  warning: string | null;
  dirty: boolean;
};

export type MarkdownTab = MarkdownDocument & {
  id: string;
};

export type AppSettings = {
  theme: ThemePreference;
  viewMode: ViewMode;
  recentFiles: string[];
  syncScroll: boolean;
  trustedHtml: boolean;
};

export type ReadFileResponse = {
  path: string;
  contents: string;
  lossy: boolean;
};

export type UpdateCheckResult =
  | {
      status: "current";
      currentVersion?: string;
    }
  | {
      status: "installed";
      version: string;
    };
