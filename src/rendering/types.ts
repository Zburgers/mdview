export type HeadingEntry = {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  ordinal: number;
};

export type RenderResource = {
  kind: "image" | "local-link" | "remote-link";
  raw: string;
};

export type RenderDiagnostic = {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
};

export type RenderResult = {
  html: string;
  headings: HeadingEntry[];
  resources: RenderResource[];
  diagnostics: RenderDiagnostic[];
};

export type RenderOptions = {
  allowRemoteImages?: boolean;
};
