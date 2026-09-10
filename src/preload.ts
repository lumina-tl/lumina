/** Preload bridge — expose LuminaAPI. */
import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "./shared/bridge";
import type { LuminaAPI } from "./shared/bridge";

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function on<T>(channel: string, cb: (msg: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, msg: T) => cb(msg);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: LuminaAPI = {
  importImage: () => invoke(IPC.importImage),
  importImages: () => invoke(IPC.importImages),
  apiPost: <T>(endpoint: string, body: unknown) =>
    invoke<T>(IPC.apiPost, endpoint, body),
  getDevice: () => invoke(IPC.device),
  setUseGpu: (useGpu) => invoke(IPC.deviceConfigure, useGpu),
  checkModel: () => invoke(IPC.checkModel),
  downloadModel: (models) => invoke(IPC.downloadModel, models ?? []),
  cancelDownload: () => invoke(IPC.cancelDownload),
  onDownloadProgress: (cb) => {
    on(IPC.modelDownloadProgress, cb);
  },
  getFonts: () => invoke(IPC.getFonts),
  loadTranslations: () => invoke(IPC.loadTranslations),
  loadDefaultInstruction: () => invoke(IPC.loadDefaultInstruction),
  setSecret: (key, value) => invoke(IPC.secretsSet, key, value),
  getSecret: (key) => invoke(IPC.secretsGet, key),
  getSecrets: (keys) => invoke(IPC.secretsGetMany, keys),
  deleteSecret: (key) => invoke(IPC.secretsDelete, key),
  getModelsPath: () => invoke(IPC.modelsPathGet),
  setModelsPath: (value) => invoke(IPC.modelsPathSet, value),
  chooseModelsPath: () => invoke(IPC.modelsPathChoose),
  saveProject: (payload) => invoke(IPC.saveProject, payload),
  openProject: (path) => invoke(IPC.openProject, path ?? undefined),
  getPendingOpenPath: () => invoke(IPC.pendingOpenPath),
  onOpenProjectRequest: (cb) => {
    on(IPC.openProjectRequest, cb);
  },
  getRecents: () => invoke(IPC.recentsList),
  removeRecent: (path) => invoke(IPC.recentsRemove, path),
  confirmDiscard: (message) => invoke(IPC.confirmDiscard, message),
  onRequestCloseCheck: (cb) => {
    on(IPC.requestCloseCheck, cb);
  },
  confirmClose: (ok) => invoke(IPC.confirmClose, ok),
  exportImages: (payload) => invoke(IPC.exportImages, payload),
  writeTempPng: (payload) => invoke(IPC.writeTempPng, payload),
  checkForUpdates: () => invoke(IPC.checkForUpdates),
  downloadUpdate: () => invoke(IPC.downloadUpdate),
  installUpdate: () => invoke(IPC.installUpdate),
  onUpdateProgress: (cb) => {
    on(IPC.updateProgress, cb);
  },
  openUpdateUrl: (url) => invoke(IPC.openUpdateUrl, url),
  getRuntimeStatus: () => invoke(IPC.runtimeStatus),
  onRuntimeProgress: (cb) => {
    on(IPC.runtimeProgress, cb);
  },
  onRuntimeBusy: (cb) => {
    on(IPC.runtimeBusy, cb);
  },
  onCheckModel: (cb) => {
    on(IPC.checkModel, cb);
  },
};

contextBridge.exposeInMainWorld("lumina", api);
