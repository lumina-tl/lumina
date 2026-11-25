/** Persistent key-value settings backed by main-process config.json (with one-time localStorage migration). */

const store: Record<string, string> = loadInitial();

function loadInitial(): Record<string, string> {
  const data: Record<string, string> = {};
  try {
    const remote = window.lumina?.getSettingsSync?.();
    if (remote && typeof remote === "object") {
      for (const [k, v] of Object.entries(remote)) {
        if (typeof v === "string") data[k] = v;
      }
    }
  } catch {
    /* ignore */
  }

  // Migrate legacy lumina-* / lumina:* keys from localStorage once.
  const migrated: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || (!k.startsWith("lumina-") && !k.startsWith("lumina:"))) continue;
      if (k in data) continue;
      const v = localStorage.getItem(k);
      if (v !== null) {
        data[k] = v;
        migrated[k] = v;
      }
    }
    if (Object.keys(migrated).length > 0) {
      void window.lumina?.setSettingsBatch?.(migrated);
    }
  } catch {
    /* ignore */
  }
  return data;
}

export function getItem(key: string): string | null {
  if (key in store) return store[key];
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  const str = String(value);
  store[key] = str;
  try {
    localStorage.setItem(key, str);
  } catch {
    /* ignore */
  }
  try {
    void window.lumina?.setSetting?.(key, str);
  } catch {
    /* ignore */
  }
}

export function removeItem(key: string): void {
  delete store[key];
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    void window.lumina?.deleteSetting?.(key);
  } catch {
    /* ignore */
  }
}
