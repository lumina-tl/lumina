/** Auto-pan controller — edge-scrolling while dragging in canvas viewport. */
import { state } from "../state";
import { canvas } from "./index";
import { clampPan } from "./viewport";

const EDGE_MARGIN = 32;
const MAX_SPEED = 8;

interface AutoPanOptions {
  onPan?: (dx: number, dy: number) => void;
}

let _rafId: number | null = null;
let _active = false;
let _mouseX = 0;
let _mouseY = 0;
let _onPanCb: ((dx: number, dy: number) => void) | null = null;

function _calcSpeed(dist: number): number {
  const norm = Math.min(1.5, Math.max(0, dist / EDGE_MARGIN));
  return Math.max(1, Math.round(Math.pow(norm, 1.5) * MAX_SPEED));
}

function _tick(): void {
  if (!_active) return;
  const container = document.getElementById("canvas-container");
  if (!container) {
    stopAutoPan();
    return;
  }
  const rect = container.getBoundingClientRect();
  let dx = 0;
  let dy = 0;

  // Left
  if (_mouseX < rect.left + EDGE_MARGIN) {
    const dist = rect.left + EDGE_MARGIN - _mouseX;
    dx = _calcSpeed(dist);
  }
  // Right
  else if (_mouseX > rect.right - EDGE_MARGIN) {
    const dist = _mouseX - (rect.right - EDGE_MARGIN);
    dx = -_calcSpeed(dist);
  }

  // Top
  if (_mouseY < rect.top + EDGE_MARGIN) {
    const dist = rect.top + EDGE_MARGIN - _mouseY;
    dy = _calcSpeed(dist);
  }
  // Bottom
  else if (_mouseY > rect.bottom - EDGE_MARGIN) {
    const dist = _mouseY - (rect.bottom - EDGE_MARGIN);
    dy = -_calcSpeed(dist);
  }

  if (dx !== 0 || dy !== 0) {
    const oldX = state._panX || 0;
    const oldY = state._panY || 0;
    state._panX = oldX + dx;
    state._panY = oldY + dy;
    clampPan();
    const actualDx = (state._panX || 0) - oldX;
    const actualDy = (state._panY || 0) - oldY;

    if (actualDx !== 0 || actualDy !== 0) {
      canvas.render();
      if (_onPanCb) _onPanCb(actualDx, actualDy);
    }
  }

  _rafId = requestAnimationFrame(_tick);
}

export function startAutoPan(opts?: AutoPanOptions): void {
  _active = true;
  _onPanCb = opts?.onPan || null;
  if (_rafId === null) {
    _rafId = requestAnimationFrame(_tick);
  }
}

export function updateAutoPanPointer(clientX: number, clientY: number): void {
  _mouseX = clientX;
  _mouseY = clientY;
}

export function stopAutoPan(): void {
  _active = false;
  _onPanCb = null;
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}
