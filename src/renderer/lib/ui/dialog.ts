/**
 * Lumina Custom Dialog System
 * Replaces native OS message boxes and browser alert/confirm with
 * unified dark-themed modal dialogs matching Lumina's design system.
 */
import { createIcons } from "./icons";
import * as i18n from "../i18n";

export interface DialogButton<T = unknown> {
  label: string;
  value: T;
  variant?: "primary" | "danger" | "ghost" | "default";
  autoFocus?: boolean;
}

export interface ShowDialogOptions<T = unknown> {
  title: string;
  message: string;
  detail?: string;
  icon?: string;
  type?: "danger" | "warning" | "info";
  buttons: DialogButton<T>[];
  cancelValue?: T;
  splitActions?: boolean;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  detail?: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
  icon?: string;
}

export interface ConfirmDiscardOptions {
  title?: string;
  message?: string;
  detail?: string;
  saveText?: string;
  discardText?: string;
  cancelText?: string;
}

export type DiscardChoice = "save" | "discard" | "cancel";

let _activeDialogClose: ((val: unknown) => void) | null = null;

/**
 * Show a general modal dialog.
 * Handles backdrop, keyboard navigation (Escape/Tab), and auto-focus.
 */
export function showDialog<T = unknown>(options: ShowDialogOptions<T>): Promise<T> {
  // If a dialog is already showing, dismiss it first with its cancelValue
  if (_activeDialogClose) {
    _activeDialogClose(options.cancelValue);
  }

  return new Promise<T>((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "custom-dialog-overlay";
    overlay.id = "custom-dialog-overlay";

    const type = options.type || "info";
    const iconName =
      options.icon ||
      (type === "danger"
        ? "trash-2"
        : type === "warning"
          ? "alert-triangle"
          : "info");

    const card = document.createElement("div");
    card.className = "custom-dialog-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");

    const body = document.createElement("div");
    body.className = "custom-dialog-body";

    const iconEl = document.createElement("div");
    iconEl.className = `custom-dialog-icon icon-${type}`;
    iconEl.innerHTML = `<i data-lucide="${iconName}"></i>`;
    body.appendChild(iconEl);

    const content = document.createElement("div");
    content.className = "custom-dialog-content";

    const titleEl = document.createElement("h3");
    titleEl.className = "custom-dialog-title";
    titleEl.textContent = options.title;
    content.appendChild(titleEl);

    const msgEl = document.createElement("p");
    msgEl.className = "custom-dialog-message";
    msgEl.textContent = options.message;
    content.appendChild(msgEl);

    if (options.detail) {
      const detailEl = document.createElement("p");
      detailEl.className = "custom-dialog-detail";
      detailEl.textContent = options.detail;
      content.appendChild(detailEl);
    }
    body.appendChild(content);
    card.appendChild(body);

    const actions = document.createElement("div");
    actions.className = `custom-dialog-actions${options.splitActions ? " split" : ""}`;

    const createdButtons: HTMLButtonElement[] = [];
    let focusedBtn: HTMLButtonElement | null = null;

    const createBtn = (btnDef: DialogButton<T>): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      let variantClass = "btn";
      if (btnDef.variant === "primary") variantClass += " primary";
      else if (btnDef.variant === "danger") variantClass += " dialog-btn-danger";
      btn.className = variantClass;
      btn.textContent = btnDef.label;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeDialog(btnDef.value);
      });

      if (btnDef.autoFocus && !focusedBtn) {
        focusedBtn = btn;
      }
      createdButtons.push(btn);
      return btn;
    };

    if (options.splitActions && options.buttons.length > 1) {
      const leftContainer = document.createElement("div");
      leftContainer.className = "custom-dialog-actions-left";
      leftContainer.appendChild(createBtn(options.buttons[0]));

      const rightContainer = document.createElement("div");
      rightContainer.className = "custom-dialog-actions-right";
      for (let i = 1; i < options.buttons.length; i++) {
        rightContainer.appendChild(createBtn(options.buttons[i]));
      }

      actions.appendChild(leftContainer);
      actions.appendChild(rightContainer);
    } else {
      for (const btnDef of options.buttons) {
        actions.appendChild(createBtn(btnDef));
      }
    }

    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    createIcons({
      nameAttr: "data-lucide",
      attrs: {},
      root: overlay,
    });

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.add("show");
    });

    let closed = false;
    const closeDialog = (val: T) => {
      if (closed) return;
      closed = true;
      _activeDialogClose = null;
      window.removeEventListener("keydown", onKeyDown, true);
      overlay.classList.remove("show");
      setTimeout(() => {
        overlay.remove();
        resolve(val);
      }, 120);
    };

    _activeDialogClose = (val: unknown) => closeDialog(val as T);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeDialog(options.cancelValue as T);
        return;
      }
      if (e.key === "Tab") {
        if (createdButtons.length <= 1) {
          e.preventDefault();
          return;
        }
        const first = createdButtons[0];
        const last = createdButtons[createdButtons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeDialog(options.cancelValue as T);
      }
    });

    setTimeout(() => {
      if (focusedBtn) {
        focusedBtn.focus();
      } else if (createdButtons.length > 0) {
        createdButtons[createdButtons.length - 1].focus();
      }
    }, 50);
  });
}

/**
 * Standard confirmation dialog (e.g. Delete model, destructive operations).
 */
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  const type = options.type || "danger";
  const icon =
    options.icon ||
    (type === "danger"
      ? "trash-2"
      : type === "warning"
        ? "alert-triangle"
        : "info");

  return showDialog<boolean>({
    title: options.title || i18n.t("dialog.confirm"),
    message: options.message,
    detail: options.detail,
    type,
    icon,
    cancelValue: false,
    buttons: [
      {
        label: options.cancelText || i18n.t("dialog.cancel"),
        value: false,
        variant: "default",
        autoFocus: true,
      },
      {
        label: options.confirmText || i18n.t("dialog.confirm"),
        value: true,
        variant: type === "danger" ? "danger" : "primary",
      },
    ],
  });
}

/**
 * Discard unsaved changes dialog (Save / Don't Save / Cancel).
 */
export function showConfirmDiscard(
  options?: ConfirmDiscardOptions,
): Promise<DiscardChoice> {
  return showDialog<DiscardChoice>({
    title: options?.title || i18n.t("project.discardTitle"),
    message: options?.message || i18n.t("project.discardMessage"),
    detail: options?.detail || i18n.t("project.discardDetail"),
    type: "warning",
    icon: "alert-triangle",
    splitActions: true,
    cancelValue: "cancel",
    buttons: [
      {
        label: options?.discardText || i18n.t("project.dontSave"),
        value: "discard",
        variant: "danger",
      },
      {
        label: options?.cancelText || i18n.t("dialog.cancel"),
        value: "cancel",
        variant: "default",
      },
      {
        label: options?.saveText || i18n.t("project.save"),
        value: "save",
        variant: "primary",
        autoFocus: true,
      },
    ],
  });
}
