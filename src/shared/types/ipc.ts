export const IPC = {
  // Image import
  importImage: "import-image",
  importImages: "import-images",

  // Pipeline
  runPipeline: "run-pipeline",
  pipelineProgress: "pipeline-progress",
  apiPost: "api-post",

  // Device / GPU
  device: "device",
  deviceConfigure: "device-configure",

  // Models
  checkModel: "check-model",
  downloadModel: "download-model",
  cancelDownload: "cancel-download",
  modelDownloadProgress: "model-download-progress",

  // Fonts / i18n
  getFonts: "get-fonts",
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

  // Paint tool
  writeTempPng: "write-temp-png",

  // Updates
  checkForUpdates: "check-for-updates",
  downloadUpdate: "download-update",
  installUpdate: "install-update",
  updateProgress: "update-progress",
  openUpdateUrl: "open-update-url",

  // CUDA runtime
  runtimeStatus: "runtime-status",
  runtimeProgress: "runtime-progress",
  runtimeBusy: "runtime-busy",
} as const;
