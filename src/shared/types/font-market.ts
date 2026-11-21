/** Font Market types and contracts. */

export type FontMarketCategory =
  | "all"
  | "dialogue"
  | "scream"
  | "whisper"
  | "sfx"
  | "installed";

export interface FontMarketFiles {
  regular: string;
  bold?: string;
  italic?: string;
}

export interface FontMarketItem {
  id: string;
  family: string;
  category: "dialogue" | "scream" | "whisper" | "sfx";
  author: string;
  license?: string;
  description?: string;
  sampleText?: string;
  files: FontMarketFiles;
}

export type FontInstallStatus = "not_installed" | "in_app" | "system";

export interface FontMarketItemWithStatus extends FontMarketItem {
  status: FontInstallStatus;
  localPath?: string;
}

export type FontMarketTab = "recommended" | "google" | "installed";

export interface GoogleFontItem {
  id: string;
  family: string;
  category: string;
  author: string;
  downloadUrl?: string;
  files: FontMarketFiles;
}

export interface GoogleFontSearchParams {
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface GoogleFontSearchResult {
  items: FontMarketItem[];
  total: number;
  hasMore: boolean;
}

export interface FontInstallPayload {
  fontId: string;
  family?: string;
  installToSystem?: boolean;
  downloadUrl?: string;
}

export interface FontInstallResult {
  ok: boolean;
  error?: string;
  family: string;
  status: FontInstallStatus;
  installedFiles: string[];
}
