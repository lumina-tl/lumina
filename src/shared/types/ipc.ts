/** IPC channels — main/renderer contract. */
export const IPC = {
  // Image import
  importImage: "import-image",
  importImages: "import-images",
  importImageFolder: "import-image-folder",

  // Backend proxy
  apiPost: "api-post",
  apiPostStream: "api-post-stream",

  // Device / GPU
  device: "device",
  deviceConfigure: "device-configure",

  // Models
  checkModel: "check-model",
  downloadModel: "download-model",
  cancelDownload: "cancel-download",
  deleteModel: "delete-model",
  modelDownloadProgress: "model-download-progress",

  // Fonts / i18n
  getFonts: "get-fonts",
  fontMarketCatalog: "font-market-catalog",
  fontMarketSearchGoogle: "font-market-search-google",
  fontMarketInstall: "font-market-install",
  fontMarketUninstall: "font-market-uninstall",
  fontMarketOpenDir: "font-market-open-dir",
  loadTranslations: "load-translations",
  loadDefaultInstruction: "load-default-instruction",

  // Secrets
  secretsSet: "secrets-set",
  secretsGet: "secrets-get",
  secretsGetMany: "secrets-get-many",
  secretsDelete: "secrets-delete",

  // Models directory
  modelsPathGet: "models-path-get",
  modelsPathSet: "models-path-set",
  modelsPathChoose: "models-path-choose",

  // App settings
  settingsGetAllSync: "settings-get-all-sync",
  settingsSet: "settings-set",
  settingsDelete: "settings-delete",
  settingsSetBatch: "settings-set-batch",

  // Project
  saveProject: "save-project",
  openProject: "open-project",
  pendingOpenPath: "pending-open-path",
  openProjectRequest: "open-project-request",

  // Recents
  recentsList: "recents-list",
  recentsRemove: "recents-remove",

  // Close / discard
  confirmDiscard: "confirm-discard",
  requestCloseCheck: "request-close-check",
  confirmClose: "confirm-close",

  // Export
  exportImages: "export-images",
  exportOcrText: "export-ocr-text",

  // Save as PSD
  showSaveDialog: "show-save-dialog",
  writePsdFile: "write-psd-file",

  // Paint tool
  writeTempPng: "write-temp-png",

  // Updates
  appInfo: "app-info",
  checkForUpdates: "check-for-updates",
  downloadUpdate: "download-update",
  installUpdate: "install-update",
  updateProgress: "update-progress",
  openUpdateUrl: "open-update-url",

  // Logging
  log: "log",

  // CUDA runtime
  runtimeStatus: "runtime-status",
  runtimeProgress: "runtime-progress",
  runtimeBusy: "runtime-busy",
} as const;
