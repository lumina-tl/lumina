/** Font Market — curated catalog, Google Fonts API search, download, user-space install & registry. */
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { shell } from "electron";
import { IPC } from "../../shared/bridge";
import type {
  FontMarketItem,
  FontInstallPayload,
  FontInstallResult,
  GoogleFontSearchParams,
  GoogleFontSearchResult,
} from "../../shared/bridge";
import { handle } from "../core/ipc";
import { log } from "../core/logger";
import { getUserFontsDir } from "./fonts";
import curatedCatalog from "./font-market-curated.json";

export const FONT_MARKET_CATALOG: FontMarketItem[] =
  curatedCatalog as FontMarketItem[];

interface GoogleFontMetaEntry {
  family: string;
  category: string;
  designers: string[];
  popularity: number;
}

let _googleFontsCache: GoogleFontMetaEntry[] | null = null;
let _googleFontsFetchPromise: Promise<GoogleFontMetaEntry[]> | null = null;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Fetch and cache official Google Fonts catalog metadata (no API key required) */
async function getGoogleFontsMetadata(): Promise<GoogleFontMetaEntry[]> {
  if (_googleFontsCache) return _googleFontsCache;
  if (_googleFontsFetchPromise) return _googleFontsFetchPromise;

  _googleFontsFetchPromise = (async () => {
    try {
      const res = await fetch("https://fonts.google.com/metadata/fonts", {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) {
        throw new Error(`Google Fonts metadata failed: HTTP ${res.status}`);
      }
      const rawText = await res.text();
      const cleanJson = rawText.replace(/^\)\]\}'\n/, "");
      const parsed = JSON.parse(cleanJson) as {
        familyMetadataList?: GoogleFontMetaEntry[];
      };
      _googleFontsCache = parsed.familyMetadataList || [];
      return _googleFontsCache;
    } catch {
      return [];
    } finally {
      _googleFontsFetchPromise = null;
    }
  })();

  return _googleFontsFetchPromise;
}

/** Resolve direct TTF download URL for any Google Font family */
async function resolveGoogleFontDownloadUrl(
  family: string,
): Promise<string | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`;
    // Note: Do NOT send modern Chrome User-Agent here; Google Fonts serves .woff2 to Chrome,
    // but serves genuine TrueType (.ttf) format to generic/default HTTP clients.
    const res = await fetch(url);
    if (!res.ok) return null;
    const css = await res.text();
    const match = css.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/);
    if (match) return match[1];
    const fallback = css.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    return fallback ? fallback[1] : null;
  } catch {
    return null;
  }
}

function getWindowsUserFontsDir(): string {
  const local = path.join(
    process.env.LOCALAPPDATA || "",
    "Microsoft",
    "Windows",
    "Fonts",
  );
  if (!fs.existsSync(local)) {
    fs.mkdirSync(local, { recursive: true });
  }
  return local;
}

async function downloadFontFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download font (${res.status} ${res.statusText}): ${url}`,
    );
  }
  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  const magic = buf.slice(0, 4).toString("hex");
  if (magic === "774f4632") {
    throw new Error("Received WOFF2 font; TrueType TTF format is required.");
  }
  const parentDir = path.dirname(destPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  await fs.promises.writeFile(destPath, buf);
}

function registerWindowsFontRegistry(
  family: string,
  variant: string,
  fontPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const valueName =
      variant === "regular"
        ? `${family} (TrueType)`
        : `${family} ${variant.charAt(0).toUpperCase() + variant.slice(1)} (TrueType)`;
    execFile(
      "reg.exe",
      [
        "add",
        "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
        "/v",
        valueName,
        "/t",
        "REG_SZ",
        "/d",
        fontPath,
        "/f",
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
}

function unregisterWindowsFontRegistry(
  family: string,
  variant: string,
): Promise<void> {
  return new Promise((resolve) => {
    const valueName =
      variant === "regular"
        ? `${family} (TrueType)`
        : `${family} ${variant.charAt(0).toUpperCase() + variant.slice(1)} (TrueType)`;
    execFile(
      "reg.exe",
      [
        "delete",
        "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
        "/v",
        valueName,
        "/f",
      ],
      () => resolve(),
    );
  });
}

function broadcastFontChange(): void {
  if (process.platform !== "win32") return;
  const script =
    'Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public class W32 { [DllImport(\\"user32.dll\\")] public static extern int SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult); }"; $r = [UIntPtr]::Zero; [W32]::SendMessageTimeout([IntPtr]0xffff, 0x001D, [UIntPtr]::Zero, [IntPtr]::Zero, 2, 1000, [ref]$r)';
  execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    () => {},
  );
}

export function registerFontMarketHandlers(): void {
  // 1. Get Curated Recommended Fonts
  handle(IPC.fontMarketCatalog, async () => {
    return FONT_MARKET_CATALOG;
  });

  // 2. Search Live Google Fonts with Pagination (Instant in-memory metadata filtering)
  handle(
    IPC.fontMarketSearchGoogle,
    async (
      _e,
      params: GoogleFontSearchParams,
    ): Promise<GoogleFontSearchResult> => {
      const q = (params?.query || "").trim().toLowerCase();
      const page = Math.max(0, params?.page || 0);
      const pageSize = Math.max(1, Math.min(60, params?.pageSize || 30));

      const metaList = await getGoogleFontsMetadata();
      const filtered = q
        ? metaList.filter(
            (m) =>
              m.family.toLowerCase().includes(q) ||
              m.category.toLowerCase().includes(q) ||
              (m.designers &&
                m.designers.some((d) => d.toLowerCase().includes(q))),
          )
        : metaList;

      const total = filtered.length;
      const start = page * pageSize;
      const end = start + pageSize;
      const slice = filtered.slice(start, end);

      // Instant in-memory map without slow individual HTTP queries (TTF URL is resolved on-demand upon install)
      const items: FontMarketItem[] = slice.map((m) => {
        const id =
          "gfont-" + m.family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        return {
          id,
          family: m.family,
          category: "dialogue" as const,
          author: m.designers?.join(", ") || "Google Fonts",
          files: {
            regular: "",
          },
        };
      });

      return {
        items,
        total,
        hasMore: end < total,
      };
    },
  );

  // 3. Install Font (Curated or Google Font)
  handle(
    IPC.fontMarketInstall,
    async (
      _e,
      payload: FontInstallPayload,
    ): Promise<FontInstallResult> => {
      log.info(
        `Install request for ${payload.family || payload.fontId} (system: ${Boolean(payload.installToSystem)})`,
        "font-market",
      );
      let item = FONT_MARKET_CATALOG.find((f) => f.id === payload.fontId);

      // If Google Font or not in curated list, resolve genuine TTF download URL
      if (!item && payload.family) {
        log.debug(`Resolving TTF URL for ${payload.family}...`, "font-market");
        const resolvedUrl = await resolveGoogleFontDownloadUrl(payload.family);
        if (!resolvedUrl) {
          log.error(
            `Failed to resolve TTF URL for ${payload.family}`,
            "font-market",
          );
          return {
            ok: false,
            error: `Could not resolve TrueType download URL for ${payload.family}`,
            family: payload.family,
            status: "not_installed",
            installedFiles: [],
          };
        }
        log.debug(`Resolved TTF URL: ${resolvedUrl}`, "font-market");
        item = {
          id: payload.fontId,
          family: payload.family,
          category: "dialogue",
          author: "Google Fonts",
          files: {
            regular: resolvedUrl,
          },
        };
      }

      if (!item) {
        return {
          ok: false,
          error: `Font ${payload.fontId} not found`,
          family: payload.family || "",
          status: "not_installed",
          installedFiles: [],
        };
      }

      const isSystem = Boolean(
        payload.installToSystem && process.platform === "win32",
      );
      const targetDir = isSystem
        ? getWindowsUserFontsDir()
        : getUserFontsDir();

      const installedFiles: string[] = [];
      try {
        const variants = Object.entries(item.files) as Array<
          ["regular" | "bold" | "italic", string]
        >;

        for (const [variant, url] of variants) {
          if (!url) continue;
          const safeName = `${item.id}-${variant}.ttf`;
          const destPath = path.join(targetDir, safeName);
          log.info(`Downloading ${item.family} to ${destPath}`, "font-market");
          await downloadFontFile(url, destPath);
          installedFiles.push(destPath);
          log.info(
            `Successfully wrote ${destPath} (${fs.statSync(destPath).size} bytes)`,
            "font-market",
          );

          if (isSystem) {
            await registerWindowsFontRegistry(item.family, variant, destPath);
          }
        }

        if (isSystem) {
          broadcastFontChange();
        }

        return {
          ok: true,
          family: item.family,
          status: isSystem ? "system" : "in_app",
          installedFiles,
        };
      } catch (err) {
        log.error(
          `Install failed: ${err instanceof Error ? err.message : String(err)}`,
          "font-market",
        );
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          family: item.family,
          status: "not_installed",
          installedFiles,
        };
      }
    },
  );

  // 4. Uninstall Font
  handle(
    IPC.fontMarketUninstall,
    async (
      _e,
      payload: { fontId: string; family?: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      const item =
        FONT_MARKET_CATALOG.find((f) => f.id === payload.fontId) || {
          id: payload.fontId,
          family: payload.family || payload.fontId.replace(/^gfont-/, ""),
        };

      try {
        const variants = ["regular", "bold", "italic"];
        // 1. Remove from in-app dir
        const appDir = getUserFontsDir();
        for (const v of variants) {
          const p = path.join(appDir, `${item.id}-${v}.ttf`);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }

        // 2. Remove from Windows user fonts if applicable
        if (process.platform === "win32") {
          const winDir = getWindowsUserFontsDir();
          for (const v of variants) {
            const p = path.join(winDir, `${item.id}-${v}.ttf`);
            if (fs.existsSync(p)) fs.unlinkSync(p);
            await unregisterWindowsFontRegistry(item.family, v);
          }
          broadcastFontChange();
        }

        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  handle(IPC.fontMarketOpenDir, async () => {
    const dir = getUserFontsDir();
    await shell.openPath(dir);
  });
}
