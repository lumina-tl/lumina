/* ── Dynamic per-model GPU badge (Settings → Models) ──
 * Mirrors the backend's resolve_providers() logic so the badge reflects
 * the EP a model's sessions will actually get: the GPU toggle override,
 * the model's own EP preference (backend `prefer`, or a composite plan for
 * multi-session OCR), and the EPs the installed wheel actually ships.
 *
 * A model that wants an EP this build lacks (e.g. a CUDA-only model on the
 * DirectML wheel) falls back to CPU at session creation — surfaced here as
 * an orange warning.
 */
import * as i18n from "../../i18n";
import type { DeviceInfo, ModelInfo } from "../../../types";

export interface GpuBadge {
  /** Resolved EP for the model's main session */
  ep: "cuda" | "dml" | "cpu";
  /** Why the resolved EP is CPU (when ep === "cpu") */
  reason?: "disabled" | "unavailable" | "cpuOnly";
  /** Label of the EP the model wanted but this build lacks */
  wantedEp?: string;
  /** Multi-session parts running on CPU while the main graph is on GPU */
  parts?: string[];
}

/** Session EP plans for multi-session models; mirrors the backend configs
 *  (the `PREFER_*` constants under python/services/ocr). Single-preference
 *  models are not listed — they use `ModelInfo.prefer` from the backend.
 *  The badge shows the PRIMARY session's EP plus a short note for the parts
 *  that stay on CPU. */
const COMPOSITE_PLANS: Record<
  string,
  { primary: string; parts: Array<{ ep: string; note: string }> }
> = {
  manga_ocr: { primary: "auto", parts: [{ ep: "cpu", note: "decoder" }] },
  baberu: { primary: "auto", parts: [{ ep: "cpu", note: "decoder" }] },
  paddleocr_vl: { primary: "cuda", parts: [{ ep: "cpu", note: "embedding" }] },
};

/** ORT provider names → short keys. */
const SHORT: Record<string, string> = {
  CUDAExecutionProvider: "cuda",
  DmlExecutionProvider: "dml",
  CPUExecutionProvider: "cpu",
};

/** Label for an EP short key in the "wanted but missing" message. */
const WANTED_LABEL: Record<string, string> = {
  cuda: "CUDA",
  dml: "DirectML",
  auto: "GPU",
};

function epLabel(ep: string): string {
  return ep === "dml" ? "DirectML" : ep === "cuda" ? "CUDA" : "CPU";
}

/** The EP a `prefer` value resolves to on this build. No provider list
 *  (old backend) → optimistic: any GPU EP is assumed present. */
function resolvePrefer(
  prefer: string,
  dev: DeviceInfo | null,
): "cuda" | "dml" | "cpu" {
  const avail: string[] = dev?.providers?.length ? dev.providers : [];
  const has = (k: string) =>
    avail.length ? avail.some((p) => SHORT[p] === k) : true;
  if (prefer === "cuda") return has("cuda") ? "cuda" : "cpu";
  if (prefer === "dml") return has("dml") ? "dml" : "cpu";
  if (prefer === "cpu") return "cpu";
  if (has("cuda")) return "cuda"; // auto: CUDA → DirectML → CPU
  if (has("dml")) return "dml";
  return "cpu";
}

export function badgeFor(
  m: ModelInfo,
  dev: DeviceInfo | null,
  gpuOn: boolean,
): GpuBadge | null {
  const plan = COMPOSITE_PLANS[m.id];
  const prefer = plan ? plan.primary : m.prefer;
  if (!prefer) return null; // no GPU info for this model

  // Toggle OFF → LUMINA_EP=cpu overrides every model (backend behavior).
  if (!gpuOn) return { ep: "cpu", reason: "disabled" };

  const ep = resolvePrefer(prefer, dev);
  const badge: GpuBadge = { ep };

  if (ep === "cpu") {
    if (prefer === "cpu") {
      badge.reason = "cpuOnly";
    } else {
      badge.reason = "unavailable";
      badge.wantedEp = WANTED_LABEL[prefer] || prefer;
    }
  } else if (plan) {
    const parts = plan.parts
      .filter((p) => resolvePrefer(p.ep, dev) === "cpu")
      .map((p) => p.note);
    if (parts.length) badge.parts = parts;
  }
  return badge;
}

export interface GpuBadgeText {
  text: string;
  /** Badge tone for the model's resolved EP state:
   *  "ok"   → GPU EP active (green, default)
   *  "cpu"  → CPU by design or toggle off (neutral)
   *  "warn" → model wants an EP this build can't run (orange) */
  tone: "ok" | "cpu" | "warn";
}

/** Badge text for a model in the given language; null when no GPU info. */
export function describeGpu(
  m: ModelInfo,
  dev: DeviceInfo | null,
  gpuOn: boolean,
  lang: string,
): GpuBadgeText | null {
  const b = badgeFor(m, dev, gpuOn);
  if (!b) return null;
  void lang; // i18n.t() already resolves the current language
  const t = (k: string, p?: Record<string, unknown>) => i18n.t(k, p);
  let text: string;
  if (b.ep === "cpu") {
    const reason =
      b.reason === "disabled"
        ? t("models.gpuReasonDisabled")
        : b.reason === "unavailable"
          ? t("models.gpuReasonUnavailable", { ep: b.wantedEp })
          : t("models.gpuReasonCpuOnly");
    text = t("models.gpuValueCpu") + " — " + reason;
  } else {
    text = t("models.gpuValueGpu", { ep: epLabel(b.ep) });
    if (b.parts?.length) {
      text +=
        " (" + t("models.gpuPartialNote", { parts: b.parts.join(", ") }) + ")";
    }
  }
  return {
    text,
    tone: b.ep === "cpu" ? (b.reason === "unavailable" ? "warn" : "cpu") : "ok",
  };
}
