/* ── Settings: Translation tab (provider, target lang, instruction) ──
 * System instruction is GLOBAL (shared by all providers). Empty field =
 * use default from prompts/translate-default.md on the backend.
 */
import * as i18n from "../i18n";
import { createIcons } from "../ui/icons";
import { translateSettings, type TranslateConfig } from "../pipeline/translate";

/** Docs tutorial on getting an API key per provider. */
const API_KEY_TUTORIAL =
  "https://lumina.navierr.dev/docs/guides/translation#how-to-get-your-api-key";

const TARGET_LANGUAGES = [
  { code: "en", name: "English (en)" },
  { code: "id", name: "Bahasa Indonesia (id)" },
  { code: "ja", name: "日本語 (ja)" },
  { code: "ko", name: "한국어 (ko)" },
  { code: "zh-CN", name: "简体中文 (zh-CN)" },
  { code: "zh-TW", name: "繁體中文 (zh-TW)" },
  { code: "es", name: "Español (es)" },
  { code: "fr", name: "Français (fr)" },
  { code: "de", name: "Deutsch (de)" },
  { code: "ru", name: "Русский (ru)" },
  { code: "vi", name: "Tiếng Việt (vi)" },
];

const PROVIDERS = [
  {
    id: "gemini",
    nameKey: "settings.providerGemini",
    subKey: "settings.trSubGemini",
    icon: "sparkles",
  },
  {
    id: "openrouter",
    nameKey: "settings.providerOpenRouter",
    subKey: "settings.trSubOpenRouter",
    icon: "network",
  },
  {
    id: "grok",
    nameKey: "settings.providerGrok",
    subKey: "settings.trSubGrok",
    icon: "zap",
  },
  {
    id: "custom",
    nameKey: "settings.providerCustom",
    subKey: "settings.trSubCustom",
    icon: "cpu",
  },
] as const;

function card(): HTMLElement {
  const c = document.createElement("div");
  c.className = "settings-section";
  return c;
}

export const translationTab = {
  build(pane: HTMLElement): void {
    pane.innerHTML = "";

    // ── Section 1: Provider Selection ──
    const provSection = card();
    const provHead = document.createElement("div");
    provHead.className = "flex items-center justify-between mb-1.5";

    const provTitle = document.createElement("div");
    provTitle.className = "settings-section-title mb-0";
    provTitle.textContent = i18n.t("settings.trProvider");
    provHead.appendChild(provTitle);

    const helpLink = document.createElement("a");
    helpLink.className =
      "group inline-flex items-center gap-1 text-[0.7rem] text-lumina hover:text-lumina-dark";
    helpLink.href = API_KEY_TUTORIAL;
    helpLink.target = "_blank";
    helpLink.rel = "noreferrer";
    helpLink.innerHTML =
      '<span>' +
      i18n.t("settings.trNoKeyLink") +
      '</span><i data-lucide="external-link" class="w-3 h-3"></i>';
    provHead.appendChild(helpLink);
    provSection.appendChild(provHead);

    const provDesc = document.createElement("p");
    provDesc.className = "text-[0.7rem] text-text-muted mb-2 leading-relaxed";
    provDesc.textContent = i18n.t("settings.trProviderDesc");
    provSection.appendChild(provDesc);

    const hiddenProv = document.createElement("input");
    hiddenProv.type = "hidden";
    hiddenProv.id = "tr-provider";
    hiddenProv.value = "gemini";
    provSection.appendChild(hiddenProv);

    const grid = document.createElement("div");
    grid.className = "tr-provider-grid";

    for (const p of PROVIDERS) {
      const pCard = document.createElement("div");
      pCard.className = "tr-provider-card";
      pCard.dataset.providerId = p.id;

      const pHead = document.createElement("div");
      pHead.className = "tr-provider-card-head";

      const icon = document.createElement("i");
      icon.dataset.lucide = p.icon;
      icon.className = "tr-provider-card-icon";
      pHead.appendChild(icon);

      const radio = document.createElement("div");
      radio.className = "tr-provider-radio";
      const dot = document.createElement("div");
      dot.className = "tr-provider-radio-dot";
      radio.appendChild(dot);
      pHead.appendChild(radio);
      pCard.appendChild(pHead);

      const pBody = document.createElement("div");
      const pName = document.createElement("div");
      pName.className = "tr-provider-name";
      pName.textContent = i18n.t(p.nameKey);
      pBody.appendChild(pName);

      const pSub = document.createElement("div");
      pSub.className = "tr-provider-sub";
      pSub.textContent = i18n.t(p.subKey);
      pBody.appendChild(pSub);

      pCard.appendChild(pBody);

      pCard.addEventListener("click", () => {
        hiddenProv.value = p.id;
        this._syncProviderCards(pane, p.id);
        this._syncVisibility(pane);
        this._persist(pane);
      });

      grid.appendChild(pCard);
    }
    provSection.appendChild(grid);
    pane.appendChild(provSection);

    // ── Section 2: Target Language ──
    const langSection = card();
    const langRow = document.createElement("div");
    langRow.className = "field-row items-center justify-between mb-0";

    const langLabel = document.createElement("div");
    langLabel.className = "flex flex-col";
    const langTitle = document.createElement("span");
    langTitle.className = "text-[0.78rem] font-medium text-text-primary";
    langTitle.textContent = i18n.t("settings.trTargetLang");
    langLabel.appendChild(langTitle);
    langRow.appendChild(langLabel);

    const langControls = document.createElement("div");
    langControls.className = "flex items-center gap-2";

    const langSelect = document.createElement("select");
    langSelect.id = "tr-target-lang-sel";
    langSelect.className = "field-select min-w-[190px]";

    for (const l of TARGET_LANGUAGES) {
      const opt = document.createElement("option");
      opt.value = l.code;
      opt.textContent = l.name;
      langSelect.appendChild(opt);
    }
    const customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = i18n.t("settings.trTargetLangCustom");
    langSelect.appendChild(customOpt);
    langControls.appendChild(langSelect);

    const customInput = document.createElement("input");
    customInput.id = "tr-target-lang-custom";
    customInput.type = "text";
    customInput.placeholder = "code";
    customInput.className =
      "w-20 px-2 py-1 text-center bg-surface-3 border border-surface-3 rounded text-[0.78rem] text-text-primary outline-none focus:border-accent hidden";
    langControls.appendChild(customInput);

    const hiddenLang = document.createElement("input");
    hiddenLang.type = "hidden";
    hiddenLang.id = "tr-target-lang";
    hiddenLang.value = "en";
    langControls.appendChild(hiddenLang);

    langRow.appendChild(langControls);
    langSection.appendChild(langRow);
    pane.appendChild(langSection);

    // ── Section 3: Provider Configuration Cards ──
    // 3a. Gemini
    const geminiPanel = card();
    geminiPanel.id = "tr-gemini-panel";
    geminiPanel.className = "settings-section flex flex-col gap-3";
    geminiPanel.appendChild(
      this._keyField("tr-gemini-key", i18n.t("settings.trGeminiKey"), "AIzaSy..."),
    );
    geminiPanel.appendChild(
      this._field(
        "tr-gemini-model",
        "text",
        i18n.t("settings.trGeminiModel"),
        "gemini-3.5-flash-lite",
      ),
    );
    pane.appendChild(geminiPanel);

    // 3b. OpenRouter
    const openrouterPanel = card();
    openrouterPanel.id = "tr-openrouter-panel";
    openrouterPanel.className = "settings-section hidden flex flex-col gap-3";
    openrouterPanel.appendChild(
      this._keyField(
        "tr-openrouter-key",
        i18n.t("settings.trOpenRouterKey"),
        "sk-or-v1-...",
      ),
    );
    openrouterPanel.appendChild(
      this._field(
        "tr-openrouter-model",
        "text",
        i18n.t("settings.trLlmModel"),
        "deepseek/deepseek-v4.1-flash",
      ),
    );
    pane.appendChild(openrouterPanel);

    // 3c. Grok
    const grokPanel = card();
    grokPanel.id = "tr-grok-panel";
    grokPanel.className = "settings-section hidden flex flex-col gap-3";
    grokPanel.appendChild(
      this._keyField("tr-grok-key", i18n.t("settings.trGrokKey"), "gsk_... or xai-..."),
    );
    grokPanel.appendChild(
      this._field(
        "tr-grok-model",
        "text",
        i18n.t("settings.trLlmModel"),
        "qwen/qwen3.8-27b",
      ),
    );
    pane.appendChild(grokPanel);

    // 3d. Custom (OpenAI-compatible)
    const customPanel = card();
    customPanel.id = "tr-custom-panel";
    customPanel.className = "settings-section hidden flex flex-col gap-3";
    customPanel.appendChild(
      this._field(
        "tr-llm-url",
        "text",
        i18n.t("settings.trLlmUrl"),
        "https://api.openai.com/v1",
        i18n.t("settings.trLlmUrlHint"),
      ),
    );
    customPanel.appendChild(
      this._keyField(
        "tr-custom-key",
        i18n.t("settings.trLlmKey"),
        "sk-... (optional for local models)",
      ),
    );
    customPanel.appendChild(
      this._field(
        "tr-llm-model",
        "text",
        i18n.t("settings.trLlmModel"),
        "gpt-4o-mini",
      ),
    );
    pane.appendChild(customPanel);

    // ── Section 4: System Instruction ──
    const instrSection = card();
    const instrHead = document.createElement("div");
    instrHead.className = "flex items-center justify-between mb-1.5";

    const instrTitle = document.createElement("div");
    instrTitle.className = "settings-section-title mb-0";
    instrTitle.textContent = i18n.t("settings.trLlmInstruction");
    instrHead.appendChild(instrTitle);

    const pillWrap = document.createElement("div");
    pillWrap.className = "flex items-center gap-1.5";
    for (const v of ["{{target_language}}", "{{previous_line}}"]) {
      const pill = document.createElement("span");
      pill.className = "tr-var-pill";
      pill.textContent = v;
      pill.title = "Click to insert variable";
      pill.addEventListener("click", () => {
        const textarea =
          pane.querySelector<HTMLTextAreaElement>("#tr-instruction");
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + v + text.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + v.length;
        textarea.focus();
        this._persist(pane);
      });
      pillWrap.appendChild(pill);
    }
    instrHead.appendChild(pillWrap);
    instrSection.appendChild(instrHead);

    const instrHint = document.createElement("p");
    instrHint.className = "text-[0.68rem] text-text-muted mb-2 leading-relaxed";
    instrHint.textContent = i18n.t("settings.trInstructionHint");
    instrSection.appendChild(instrHint);

    const instr = document.createElement("textarea");
    instr.id = "tr-instruction";
    instr.rows = 7;
    instr.placeholder = i18n.t("settings.trInstructionPlaceholder");
    instr.className =
      "w-full px-2.5 py-1.5 bg-surface-3 border border-surface-3 rounded text-[0.72rem] leading-relaxed font-mono text-text-primary outline-none resize-y focus:border-accent";
    instrSection.appendChild(instr);

    const btnRow = document.createElement("div");
    btnRow.className = "flex items-center gap-2 mt-2";

    const loadBtn = document.createElement("button");
    loadBtn.id = "tr-instruction-load";
    loadBtn.className = "btn text-[0.68rem] flex items-center gap-1.5";
    loadBtn.innerHTML =
      '<i data-lucide="rotate-ccw" class="w-3 h-3"></i><span>' +
      i18n.t("settings.trLoadInstruction") +
      '</span>';
    btnRow.appendChild(loadBtn);

    const clearBtn = document.createElement("button");
    clearBtn.id = "tr-instruction-clear";
    clearBtn.className = "btn text-[0.68rem] flex items-center gap-1.5";
    clearBtn.innerHTML =
      '<i data-lucide="trash-2" class="w-3 h-3"></i><span>' +
      i18n.t("settings.trClearInstruction") +
      '</span>';
    btnRow.appendChild(clearBtn);

    instrSection.appendChild(btnRow);
    pane.appendChild(instrSection);

    // ── Wiring ──
    const persist = () => this._persist(pane);

    langSelect.addEventListener("change", () => {
      if (langSelect.value === "custom") {
        customInput.classList.remove("hidden");
        customInput.focus();
        hiddenLang.value = customInput.value.trim().toLowerCase() || "en";
      } else {
        customInput.classList.add("hidden");
        hiddenLang.value = langSelect.value;
      }
      persist();
    });

    customInput.addEventListener("input", () => {
      hiddenLang.value = customInput.value.trim().toLowerCase() || "en";
      persist();
    });

    [geminiPanel, openrouterPanel, grokPanel, customPanel].forEach((panel) => {
      panel
        .querySelectorAll("input")
        .forEach((el) => el.addEventListener("input", persist));
      panel
        .querySelectorAll("input")
        .forEach((el) => el.addEventListener("change", persist));
    });

    instr.addEventListener("input", persist);

    loadBtn.addEventListener("click", () => {
      window.lumina
        .loadDefaultInstruction()
        .then((text) => {
          instr.value = text;
          persist();
        })
        .catch(() => {});
    });

    clearBtn.addEventListener("click", () => {
      instr.value = "";
      persist();
    });

    this._applyLocal(pane);
    this.refresh();
    createIcons({ root: pane });
  },

  commit(): void {
    const pane = document.getElementById("tab-translation");
    if (pane) this._persist(pane);
  },

  _syncProviderCards(pane: HTMLElement, activeId: string): void {
    pane.querySelectorAll<HTMLElement>(".tr-provider-card").forEach((c) => {
      c.classList.toggle("active", c.dataset.providerId === activeId);
    });
  },

  _syncVisibility(pane: HTMLElement): void {
    const prov =
      pane.querySelector<HTMLInputElement>("#tr-provider")?.value ?? "gemini";
    const gemini = pane.querySelector<HTMLElement>("#tr-gemini-panel");
    const openrouter = pane.querySelector<HTMLElement>("#tr-openrouter-panel");
    const grok = pane.querySelector<HTMLElement>("#tr-grok-panel");
    const custom = pane.querySelector<HTMLElement>("#tr-custom-panel");

    if (gemini) gemini.classList.toggle("hidden", prov !== "gemini");
    if (openrouter) openrouter.classList.toggle("hidden", prov !== "openrouter");
    if (grok) grok.classList.toggle("hidden", prov !== "grok");
    if (custom) custom.classList.toggle("hidden", prov !== "custom");
  },

  _applyLocal(pane: HTMLElement): void {
    const cfg = translateSettings.load();

    const provInput = pane.querySelector<HTMLInputElement>("#tr-provider");
    if (provInput) provInput.value = cfg.provider;
    this._syncProviderCards(pane, cfg.provider);
    this._syncVisibility(pane);

    // Target language
    const langSelect = pane.querySelector<HTMLSelectElement>(
      "#tr-target-lang-sel",
    );
    const customInput = pane.querySelector<HTMLInputElement>(
      "#tr-target-lang-custom",
    );
    const hiddenLang = pane.querySelector<HTMLInputElement>("#tr-target-lang");
    if (hiddenLang) hiddenLang.value = cfg.targetLang;

    const isPreset = TARGET_LANGUAGES.some((l) => l.code === cfg.targetLang);
    if (langSelect) {
      if (isPreset) {
        langSelect.value = cfg.targetLang;
        customInput?.classList.add("hidden");
      } else {
        langSelect.value = "custom";
        if (customInput) {
          customInput.classList.remove("hidden");
          customInput.value = cfg.targetLang;
        }
      }
    }

    const set = (id: string, v: string) => {
      const el = pane.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        "#" + id,
      );
      if (el && document.activeElement !== el) el.value = v;
    };

    set("tr-instruction", cfg.llmInstruction);
    set("tr-llm-url", cfg.llmBaseUrl || "https://api.openai.com/v1");
    set("tr-llm-model", cfg.llmModel || "gpt-4o-mini");
    set(
      "tr-openrouter-model",
      cfg.openrouterModel || "deepseek/deepseek-v4.1-flash",
    );
    set("tr-grok-model", cfg.grokModel || "qwen/qwen3.8-27b");
    set("tr-gemini-model", cfg.geminiModel || "gemini-3.5-flash-lite");
  },

  async refresh(): Promise<void> {
    const pane = document.getElementById("tab-translation");
    if (!pane) return;

    // Synchronize latest non-secret fields from storage first
    this._applyLocal(pane);

    // Retrieve all encrypted vault keys
    const cfg = await translateSettings.loadWithSecrets();
    const set = (id: string, v: string) => {
      const el = pane.querySelector<HTMLInputElement>("#" + id);
      if (el && document.activeElement !== el) el.value = v;
    };
    set("tr-custom-key", cfg.llmApiKey);
    set("tr-openrouter-key", cfg.openrouterApiKey);
    set("tr-grok-key", cfg.grokApiKey);
    set("tr-gemini-key", cfg.geminiApiKey);
  },

  _persist(pane: HTMLElement): void {
    const val = (id: string) =>
      (
        pane.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          "#" + id,
        ) as HTMLInputElement | null
      )?.value.trim() ?? "";

    const prov =
      (pane.querySelector<HTMLInputElement>("#tr-provider")?.value ??
        "gemini") as TranslateConfig["provider"];

    const target = (val("tr-target-lang") || "en").toLowerCase();

    const cfg: TranslateConfig = {
      provider: prov,
      targetLang: target,
      llmBaseUrl: val("tr-llm-url"),
      llmApiKey: val("tr-custom-key"),
      llmModel: val("tr-llm-model") || "gpt-4o-mini",
      llmInstruction: (
        pane.querySelector<HTMLTextAreaElement>("#tr-instruction")?.value ?? ""
      ).trim(),
      openrouterApiKey: val("tr-openrouter-key"),
      openrouterModel:
        val("tr-openrouter-model") || "deepseek/deepseek-v4.1-flash",
      grokApiKey: val("tr-grok-key"),
      grokModel: val("tr-grok-model") || "qwen/qwen3.8-27b",
      geminiApiKey: val("tr-gemini-key"),
      geminiModel: val("tr-gemini-model") || "gemini-3.5-flash-lite",
    };
    translateSettings.save(cfg);
  },

  _field(
    id: string,
    type: string,
    labelText: string,
    placeholder: string,
    hintText?: string,
  ): HTMLElement {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = labelText;
    wrap.appendChild(label);

    const input = document.createElement("input");
    input.type = type;
    input.id = id;
    input.className =
      "w-full mt-1 px-2.5 py-1.5 bg-surface-3 border border-surface-3 rounded text-[0.78rem] text-text-primary outline-none focus:border-accent";
    if (placeholder) input.placeholder = placeholder;
    wrap.appendChild(input);

    if (hintText) {
      const hint = document.createElement("div");
      hint.className = "text-[0.65rem] text-text-muted mt-1 leading-normal";
      hint.textContent = hintText;
      wrap.appendChild(hint);
    }
    return wrap;
  },

  _keyField(id: string, labelText: string, placeholder: string): HTMLElement {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = labelText;
    wrap.appendChild(label);

    const box = document.createElement("div");
    box.className = "relative mt-1";

    const input = document.createElement("input");
    input.type = "password";
    input.id = id;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.className =
      "w-full px-2.5 py-1.5 pr-8 bg-surface-3 border border-surface-3 rounded text-[0.78rem] text-text-primary outline-none focus:border-accent";
    if (placeholder) input.placeholder = placeholder;
    box.appendChild(input);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-secondary hover:text-text-primary cursor-pointer";
    btn.setAttribute("aria-label", i18n.t("settings.trToggleKey"));
    btn.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5"></i>';
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show
        ? '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>'
        : '<i data-lucide="eye" class="w-3.5 h-3.5"></i>';
      createIcons({ root: btn });
    });
    box.appendChild(btn);
    wrap.appendChild(box);
    return wrap;
  },
};
