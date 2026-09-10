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
import type { ExportPayload, ExportResult } from "./export";
import type {
  FontInfo,
  ModelsPathState,
  TempPngWritePayload,
  TempPngWriteResult,
} from "./misc";
import type { RecentsData } from "./recent";
import type { RuntimeInfo, RuntimeProgress } from "./runtime";

export interface LuminaAPI {
  importImage(): Promise<string | null>;
  importImages(): Promise<string[] | null>;
  apiPost<T = unknown>(endpoint: string, body: unknown): Promise<T>;
  getDevice(): Promise<DeviceInfo>;
  setUseGpu(useGpu: boolean): Promise<DeviceInfo>;
  checkModel(): Promise<ModelCheck>;
  downloadModel(models?: string[]): Promise<void>;
  cancelDownload(): Promise<void>;
  onDownloadProgress(cb: (msg: DownloadProgress) => void): void;
  getFonts(): Promise<FontInfo[]>;
  loadTranslations(): Promise<Record<string, Record<string, string>>>;
  loadDefaultInstruction(): Promise<string>;
  setSecret(key: string, value: string): Promise<void>;
  getSecret(key: string): Promise<string | null>;
  getSecrets(keys: string[]): Promise<Record<string, string | null>>;
  deleteSecret(key: string): Promise<void>;
  getModelsPath(): Promise<ModelsPathState>;
  setModelsPath(value: string): Promise<ModelsPathState>;
  chooseModelsPath(): Promise<string | null>;
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
  writeTempPng(payload: TempPngWritePayload): Promise<TempPngWriteResult>;
  checkForUpdates(): Promise<CheckUpdateResult>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateProgress(cb: (msg: UpdateProgress) => void): void;
  openUpdateUrl(url: string): Promise<void>;
  getRuntimeStatus(): Promise<RuntimeInfo>;
  onRuntimeProgress(cb: (msg: RuntimeProgress) => void): void;
  onRuntimeBusy(cb: (busy: boolean) => void): void;
  onCheckModel(cb: () => void): void;
}

declare global {
  interface Window {
    lumina: LuminaAPI;
  }
}
