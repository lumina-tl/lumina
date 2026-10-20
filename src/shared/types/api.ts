/** LuminaAPI — preload surface types. */
import type { CheckUpdateResult, UpdateProgress } from "./update";
import type { DeviceInfo } from "./device";
import type {
  DiscardChoice,
  OpenProjectResult,
  ProjectSavePayload,
  ProjectSaveResult,
} from "./project";
import type { DownloadProgress, ModelCheck } from "./model";
import type {
  ExportPayload,
  ExportOcrTextResult,
  ExportResult,
  ShowSaveDialogOptions,
  ShowSaveDialogResult,
  WritePsdFilePayload,
} from "./export";
import type {
  FontInfo,
  ModelsPathState,
  TempPngWritePayload,
  TempPngWriteResult,
} from "./misc";
import type {
  FontMarketItem,
  FontInstallPayload,
  FontInstallResult,
} from "./font-market";
import type { RecentsData } from "./recent";
import type { RuntimeInfo, RuntimeProgress } from "./runtime";
import type { LogLevel } from "../logger";

export interface StreamProgress {
  current: number;
  total: number;
  [key: string]: unknown;
}

export interface LuminaAPI {
  importImage(): Promise<string | null>;
  importImages(): Promise<string[] | null>;
  apiPost<T = unknown>(endpoint: string, body: unknown): Promise<T>;
  apiPostStream<T = unknown>(
    endpoint: string,
    body: unknown,
    onProgress?: (progress: StreamProgress) => void,
  ): Promise<T>;
  getDevice(): Promise<DeviceInfo>;
  setUseGpu(useGpu: boolean): Promise<DeviceInfo>;
  checkModel(): Promise<ModelCheck>;
  downloadModel(models?: string[]): Promise<void>;
  cancelDownload(): Promise<void>;
  deleteModel(modelId: string): Promise<void>;
  onDownloadProgress(cb: (msg: DownloadProgress) => void): void;
  getFonts(): Promise<FontInfo[]>;
  getFontMarketCatalog(): Promise<FontMarketItem[]>;
  searchGoogleFonts(
    params: import("./font-market").GoogleFontSearchParams,
  ): Promise<import("./font-market").GoogleFontSearchResult>;
  installFont(payload: FontInstallPayload): Promise<FontInstallResult>;
  uninstallFont(payload: {
    fontId: string;
    family?: string;
  }): Promise<{ ok: boolean; error?: string }>;
  openFontsFolder(): Promise<void>;
  loadTranslations(): Promise<Record<string, Record<string, string>>>;
  loadDefaultInstruction(): Promise<string>;
  setSecret(key: string, value: string): Promise<void>;
  getSecret(key: string): Promise<string | null>;
  getSecrets(keys: string[]): Promise<Record<string, string | null>>;
  deleteSecret(key: string): Promise<void>;
  getModelsPath(): Promise<ModelsPathState>;
  setModelsPath(value: string): Promise<ModelsPathState>;
  chooseModelsPath(): Promise<string | null>;
  getSettingsSync(): Record<string, string>;
  setSetting(key: string, value: string): Promise<void>;
  deleteSetting(key: string): Promise<void>;
  setSettingsBatch(entries: Record<string, string>): Promise<void>;
  saveProject(payload: ProjectSavePayload): Promise<ProjectSaveResult>;
  openProject(path?: string): Promise<OpenProjectResult | null>;
  getPendingOpenPath(): Promise<string | null>;
  onOpenProjectRequest(cb: (path: string) => void): void;
  getRecents(): Promise<RecentsData>;
  removeRecent(path: string): Promise<void>;
  confirmDiscard(message: string): Promise<DiscardChoice>;
  onRequestCloseCheck(cb: () => void): void;
  confirmClose(ok: boolean): Promise<void>;
  exportImages(payload: ExportPayload): Promise<ExportResult>;
  exportOcrText(content: string): Promise<ExportOcrTextResult>;
  showSaveDialog(opts?: ShowSaveDialogOptions): Promise<ShowSaveDialogResult>;
  writePsdFile(payload: WritePsdFilePayload): Promise<void>;
  writeTempPng(payload: TempPngWritePayload): Promise<TempPngWriteResult>;
  getAppInfo(): Promise<{ version: string; isPackaged: boolean }>;
  checkForUpdates(): Promise<CheckUpdateResult>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateProgress(cb: (msg: UpdateProgress) => void): void;
  openUpdateUrl(url: string): Promise<void>;
  getRuntimeStatus(): Promise<RuntimeInfo>;
  onRuntimeProgress(cb: (msg: RuntimeProgress) => void): void;
  onRuntimeBusy(cb: (busy: boolean) => void): void;
  onCheckModel(cb: () => void): void;
  log(level: LogLevel, tag: string, msg: string): void;
}

declare global {
  interface Window {
    lumina: LuminaAPI;
  }
}
