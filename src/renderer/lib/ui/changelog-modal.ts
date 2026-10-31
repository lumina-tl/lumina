/**
 * Lumina What's New & Developer Notes Modal Dialog
 * Displays latest changelog from CHANGELOG.md alongside developer announcements.
 */
import changelogRaw from "../../../../CHANGELOG.md";
import pkg from "../../../../package.json";
import * as i18n from "../i18n";
import {
  developerNotices,
  resolveLocalized,
  type DeveloperNotice,
} from "../../release-notes";
import { settings } from "../settings";
import { createIcons } from "./icons";

const LAST_SEEN_KEY = "lumina-last-seen-version";

function _esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ChangelogItem {
  title: string;
  desc: string;
}

export interface ChangelogGroup {
  type: string;
  items: ChangelogItem[];
}

export interface ChangelogRelease {
  version: string;
  date?: string;
  groups: ChangelogGroup[];
}

/** Parse markdown text into structured releases */
export function parseChangelog(md: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  const lines = md.split(/\r?\n/);

  let currentRelease: ChangelogRelease | null = null;
  let currentGroup: ChangelogGroup | null = null;

  for (const line of lines) {
    const h2Match = line.match(/^##\s+\[(.*?)\](?:\s*-\s*(.*))?$/);
    if (h2Match) {
      currentRelease = {
        version: h2Match[1],
        date: h2Match[2]?.trim(),
        groups: [],
      };
      releases.push(currentRelease);
      currentGroup = null;
      continue;
    }

    if (!currentRelease) continue;

    const h3Match = line.match(/^###\s+(.*)$/);
    if (h3Match) {
      currentGroup = {
        type: h3Match[1].trim(),
        items: [],
      };
      currentRelease.groups.push(currentGroup);
      continue;
    }

    if (!currentGroup) continue;

    const itemMatch = line.match(/^-\s+\*\*(.*?)\*\*\s*(.*)$/);
    if (itemMatch) {
      currentGroup.items.push({
        title: itemMatch[1].trim(),
        desc: itemMatch[2].trim(),
      });
    } else if (line.startsWith("- ")) {
      currentGroup.items.push({
        title: "",
        desc: line.slice(2).trim(),
      });
    }
  }

  return releases;
}

let _overlay: HTMLElement | null = null;

export function isChangelogOpen(): boolean {
  return _overlay !== null;
}

export function closeChangelog(): void {
  if (!_overlay) return;
  _overlay.classList.remove("show");
  const el = _overlay;
  setTimeout(() => {
    el.remove();
  }, 160);
  _overlay = null;
  localStorage.setItem(LAST_SEEN_KEY, pkg.version);
}

function renderBadge(type: string): string {
  const t = type.toLowerCase();
  let cls = "badge-other";
  if (t === "added") cls = "badge-added";
  else if (t === "fixed") cls = "badge-fixed";
  else if (t === "changed") cls = "badge-changed";
  else if (t === "removed") cls = "badge-removed";
  return `<span class="changelog-type-badge ${cls}">${_esc(type)}</span>`;
}

function renderNotice(notice: DeveloperNotice, lang: string): string {
  const icon =
    notice.type === "critical"
      ? "alert-octagon"
      : notice.type === "warning"
        ? "alert-triangle"
        : "info";

  const title = resolveLocalized(notice.title, lang);
  const message = resolveLocalized(notice.message, lang);
  const badge = resolveLocalized(notice.badge, lang);
  const actionLabel = notice.action
    ? resolveLocalized(notice.action.label, lang)
    : "";

  return `
    <div class="changelog-notice-box notice-${notice.type}">
      <div class="changelog-notice-icon-wrap">
        <i data-lucide="${icon}" class="w-4 h-4"></i>
      </div>
      <div class="changelog-notice-main">
        <div class="changelog-notice-head">
          <span class="changelog-notice-title">${_esc(title)}</span>
          ${badge ? `<span class="changelog-notice-badge">${_esc(badge)}</span>` : ""}
        </div>
        <div class="changelog-notice-msg">${_esc(message).replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>")}</div>
        ${
          notice.action && actionLabel
            ? `<div class="changelog-notice-footer">
                <button class="btn primary changelog-notice-action" data-target="${_esc(notice.action.target)}">
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                  <span>${_esc(actionLabel)}</span>
                </button>
              </div>`
            : ""
        }
      </div>
    </div>
  `;
}

export function openChangelogModal(): void {
  if (_overlay) return;

  const currentLang = i18n.lang();
  const releases = parseChangelog(changelogRaw);
  // Pick unreleased or matching current version, fallback to first available
  const activeRelease =
    releases.find(
      (r) =>
        r.version.toLowerCase() === "unreleased" && r.groups.some((g) => g.items.length > 0),
    ) ||
    releases.find((r) => r.version === pkg.version) ||
    releases[0];

  const overlay = document.createElement("div");
  overlay.className = "custom-dialog-overlay";
  overlay.id = "changelog-modal-overlay";

  const noticesHtml = developerNotices
    .map((n) => renderNotice(n, currentLang))
    .join("");

  let contentHtml = "";
  if (activeRelease && activeRelease.groups.length) {
    contentHtml = activeRelease.groups
      .map((g) => {
        if (!g.items.length) return "";
        const items = g.items
          .map(
            (it) =>
              `<li>${it.title ? `<strong>${_esc(it.title)}</strong> ` : ""}${_esc(it.desc)}</li>`,
          )
          .join("");
        return `
          <div class="changelog-group">
            <div class="changelog-group-header">
              ${renderBadge(g.type)}
            </div>
            <ul class="changelog-list">
              ${items}
            </ul>
          </div>
        `;
      })
      .join("");
  } else {
    contentHtml = '<div class="text-text-muted text-center py-4">No release entries found.</div>';
  }

  const verDisplay =
    activeRelease?.version.toLowerCase() === "unreleased"
      ? `v${pkg.version} (Latest)`
      : `v${activeRelease?.version || pkg.version}`;

  const headerTitle =
    currentLang === "id" ? "Catatan Rilis & Yang Baru" : "What's New & Release Notes";
  const gotItText = currentLang === "id" ? "Mengerti" : "Got it";

  overlay.innerHTML = `
    <div class="custom-dialog-card changelog-card" role="dialog" aria-modal="true">
      <div class="changelog-header flex items-center justify-between pb-3.5 border-b border-surface-3">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-xl bg-lumina/15 text-lumina shadow-sm">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-text-primary tracking-tight">${_esc(headerTitle)}</h3>
            <span class="text-[0.68rem] text-text-muted">${_esc(verDisplay)}${activeRelease?.date ? ` &bull; ${_esc(activeRelease.date)}` : ""}</span>
          </div>
        </div>
        <button class="btn p-1.5" id="btn-changelog-close" title="Close"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>

      <div class="changelog-body flex-1 overflow-y-auto pr-2 flex flex-col gap-4 max-h-[62vh]">
        ${noticesHtml ? `<div class="changelog-notices flex flex-col gap-3">${noticesHtml}</div>` : ""}
        <div class="changelog-entries flex flex-col gap-4">
          ${contentHtml}
        </div>
      </div>

      <div class="changelog-footer pt-3.5 border-t border-surface-3 flex items-center justify-between">
        <span class="text-[0.68rem] text-text-muted">Lumina Translation Desktop &bull; v${pkg.version}</span>
        <button class="btn primary px-5 py-1.5 text-xs font-semibold" id="btn-changelog-gotit">${_esc(gotItText)}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _overlay = overlay;

  createIcons({ root: overlay });

  // Wire buttons
  overlay.querySelector("#btn-changelog-close")?.addEventListener("click", () => {
    closeChangelog();
  });
  overlay.querySelector("#btn-changelog-gotit")?.addEventListener("click", () => {
    closeChangelog();
  });

  overlay.querySelectorAll<HTMLButtonElement>(".changelog-notice-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      closeChangelog();
      if (target === "models") {
        settings.open("models");
      } else {
        settings.open();
      }
    });
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeChangelog();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      window.removeEventListener("keydown", onKey);
      closeChangelog();
    }
  };
  window.addEventListener("keydown", onKey);

  requestAnimationFrame(() => {
    overlay.classList.add("show");
  });
}

/** Check version on app startup and auto-open modal if new */
export function checkAutoOpenChangelog(): void {
  const seen = localStorage.getItem(LAST_SEEN_KEY);
  if (!seen || seen !== pkg.version) {
    // Small delay so initial canvas and UI finish mounting first
    setTimeout(() => {
      openChangelogModal();
    }, 600);
  }
}
