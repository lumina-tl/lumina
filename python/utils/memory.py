"""Memory pressure watchdog — zero external dependencies.

Uses ctypes for native memory queries:
- CUDA: NVIDIA NVML (dedicated VRAM)
- DML/CPU: Win32 GlobalMemoryStatusEx (system RAM)

Falls back gracefully when native APIs are unavailable.
"""
from __future__ import annotations

import ctypes
import ctypes.util
import os
import sys
import threading
import time
from collections.abc import Callable
from typing import Optional

from utils.logger import log

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

DEFAULT_THRESHOLD = 0.80  # 80% — start evicting above this
MIN_LOADED = 1            # never evict below this many models
IDLE_TTL = 300            # seconds — only evict models unused for this long

# ---------------------------------------------------------------------------
# NVML (NVIDIA CUDA VRAM)
# ---------------------------------------------------------------------------

_nvml_handle: Optional[ctypes.CDLL] = None
_nvml_initialized = False
_nvml_device: Optional[int] = None


def _init_nvml() -> bool:
    global _nvml_handle, _nvml_initialized, _nvml_device
    if _nvml_initialized:
        return _nvml_handle is not None
    _nvml_initialized = True
    try:
        lib_path = ctypes.util.find_library("nvidia-ml")
        if not lib_path:
            for candidate in (
                "C:/Windows/System32/nvml.dll",
                os.path.join(
                    os.environ.get("PROGRAMFILES", ""),
                    "NVIDIA Corporation/NVSMI/nvml.dll",
                ),
            ):
                if os.path.isfile(candidate):
                    lib_path = candidate
                    break
        if not lib_path:
            return False
        _nvml_handle = ctypes.CDLL(lib_path)
        # nvmlDevice_t is void* — use c_void_p, not c_uint
        _nvml_handle.nvmlInit_v2.argtypes = []
        _nvml_handle.nvmlInit_v2.restype = ctypes.c_uint
        _nvml_handle.nvmlDeviceGetHandleByIndex_v2.argtypes = [
            ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p),
        ]
        _nvml_handle.nvmlDeviceGetHandleByIndex_v2.restype = ctypes.c_uint
        _nvml_handle.nvmlDeviceGetMemoryInfo.argtypes = [
            ctypes.c_void_p, ctypes.POINTER(_NvmlMemoryInfo),
        ]
        _nvml_handle.nvmlDeviceGetMemoryInfo.restype = ctypes.c_uint
        _nvml_handle.nvmlDeviceGetName.argtypes = [
            ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint,
        ]
        _nvml_handle.nvmlDeviceGetName.restype = ctypes.c_uint
        _nvml_handle.nvmlShutdown.argtypes = []
        _nvml_handle.nvmlShutdown.restype = ctypes.c_uint
        ret = _nvml_handle.nvmlInit_v2()
        if ret != 0:
            _nvml_handle = None
            return False
        dev = ctypes.c_void_p(None)
        ret = _nvml_handle.nvmlDeviceGetHandleByIndex_v2(0, ctypes.byref(dev))
        if ret != 0:
            try:
                _nvml_handle.nvmlShutdown()
            except Exception:
                pass
            _nvml_handle = None
            return False
        _nvml_device = dev.value
        log.debug("NVML initialized for VRAM monitoring")
        return True
    except Exception:
        _nvml_handle = None
        return False


class _NvmlMemoryInfo(ctypes.Structure):
    _fields_ = [
        ("total", ctypes.c_ulonglong),
        ("free", ctypes.c_ulonglong),
        ("used", ctypes.c_ulonglong),
    ]


def _query_nvml() -> Optional[float]:
    """Return VRAM usage ratio [0..1], or None if unavailable."""
    if not _init_nvml() or _nvml_handle is None or _nvml_device is None:
        return None
    try:
        info = _NvmlMemoryInfo()
        ret = _nvml_handle.nvmlDeviceGetMemoryInfo(
            ctypes.c_void_p(_nvml_device), ctypes.byref(info)
        )
        if ret != 0 or info.total == 0:
            return None
        return info.used / info.total
    except Exception:
        return None


def _query_nvml_detail() -> Optional[dict]:
    """Return detailed VRAM info, or None if unavailable."""
    if not _init_nvml() or _nvml_handle is None or _nvml_device is None:
        return None
    try:
        info = _NvmlMemoryInfo()
        ret = _nvml_handle.nvmlDeviceGetMemoryInfo(
            ctypes.c_void_p(_nvml_device), ctypes.byref(info)
        )
        if ret != 0 or info.total == 0:
            return None

        dev_name = "NVIDIA GPU"
        try:
            buf = ctypes.create_string_buffer(96)
            if (
                _nvml_handle.nvmlDeviceGetName(
                    ctypes.c_void_p(_nvml_device), buf, 96
                )
                == 0
            ):
                dev_name = buf.value.decode("utf-8")
        except Exception:
            pass

        used_gb = round(info.used / (1024**3), 2)
        total_gb = round(info.total / (1024**3), 2)
        pct = round((info.used / info.total) * 100, 1)
        return {
            "used": used_gb,
            "total": total_gb,
            "percent": pct,
            "device": dev_name,
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Win32 GlobalMemoryStatusEx (system RAM)
# ---------------------------------------------------------------------------

MEMORYSTATUSEX_NULL = 0
MEMORYSTATUSEX_SIZE = ctypes.sizeof(ctypes.c_ulong) * 2 + 8  # rough


class _MemoryStatusEx(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_ulong),
        ("dwMemoryLoad", ctypes.c_ulong),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


def _query_ram() -> Optional[float]:
    """Return system RAM usage ratio [0..1], or None if unavailable."""
    if sys.platform != "win32":
        return None
    try:
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        stat = _MemoryStatusEx()
        stat.dwLength = ctypes.sizeof(stat)
        if not kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
            return None
        if stat.ullTotalPhys == 0:
            return None
        return stat.dwMemoryLoad / 100.0
    except Exception:
        return None


def _query_ram_detail() -> Optional[dict]:
    """Return detailed system RAM info, or None if unavailable."""
    if sys.platform != "win32":
        return None
    try:
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        stat = _MemoryStatusEx()
        stat.dwLength = ctypes.sizeof(stat)
        if not kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
            return None
        if stat.ullTotalPhys == 0:
            return None
        used_bytes = stat.ullTotalPhys - stat.ullAvailPhys
        used_gb = round(used_bytes / (1024**3), 2)
        total_gb = round(stat.ullTotalPhys / (1024**3), 2)
        pct = round(float(stat.dwMemoryLoad), 1)
        return {
            "used": used_gb,
            "total": total_gb,
            "percent": pct,
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Win32 CPU load query
# ---------------------------------------------------------------------------

class _FileTime(ctypes.Structure):
    _fields_ = [("dwLowDateTime", ctypes.c_uint), ("dwHighDateTime", ctypes.c_uint)]


def _filetime_to_int(ft: _FileTime) -> int:
    return (ft.dwHighDateTime << 32) | ft.dwLowDateTime


_prev_idle = 0
_prev_total = 0
_last_cpu_sample_time = 0.0
_cached_cpu_pct = 0.0


def _query_cpu_load() -> float:
    """Return system CPU load percent [0..100]."""
    global _prev_idle, _prev_total, _last_cpu_sample_time, _cached_cpu_pct
    now = time.monotonic()
    if now - _last_cpu_sample_time < 0.5:
        return _cached_cpu_pct

    if sys.platform != "win32":
        return 0.0

    try:
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        idle = _FileTime()
        kernel = _FileTime()
        user = _FileTime()
        if not kernel32.GetSystemTimes(
            ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)
        ):
            return _cached_cpu_pct

        curr_idle = _filetime_to_int(idle)
        curr_kernel = _filetime_to_int(kernel)
        curr_user = _filetime_to_int(user)
        curr_total = curr_kernel + curr_user

        if _prev_total > 0 and curr_total > _prev_total:
            idle_delta = curr_idle - _prev_idle
            total_delta = curr_total - _prev_total
            if total_delta > 0:
                pct = max(
                    0.0,
                    min(100.0, (1.0 - (idle_delta / total_delta)) * 100.0),
                )
                _cached_cpu_pct = round(pct, 1)

        _prev_idle = curr_idle
        _prev_total = curr_total
        _last_cpu_sample_time = now
        return _cached_cpu_pct
    except Exception:
        return _cached_cpu_pct


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_system_metrics() -> dict:
    """Return full system resource snapshot (CPU, RAM, VRAM)."""
    return {
        "cpu": {"percent": _query_cpu_load()},
        "ram": _query_ram_detail() or {"used": 0.0, "total": 0.0, "percent": 0.0},
        "vram": _query_nvml_detail(),
    }


def get_memory_usage() -> tuple[Optional[float], str]:
    """Return (ratio, source) for current memory usage.

    Tries NVML (CUDA VRAM) first, then falls back to system RAM.
    Returns (None, "none") when no source is available.
    """
    # NVML first if CUDA is active
    ep = os.environ.get("LUMINA_EP", "").strip().lower()
    if ep != "cpu":
        ratio = _query_nvml()
        if ratio is not None:
            return ratio, "vram"

    # System RAM fallback
    ratio = _query_ram()
    if ratio is not None:
        return ratio, "ram"

    return None, "none"


def check_pressure(threshold: float = DEFAULT_THRESHOLD) -> bool:
    """Return True if memory usage exceeds threshold."""
    ratio, source = get_memory_usage()
    if ratio is None:
        return False
    return ratio >= threshold


# ---------------------------------------------------------------------------
# Model tracker + eviction
# ---------------------------------------------------------------------------

class ModelTracker:
    """LRU tracker for model kinds with memory-pressure eviction.

    Usage::

        tracker = ModelTracker()
        tracker.touch("detect")   # called after detect step
        tracker.touch("ocr")      # called after ocr step
        tracker.evict_if_needed() # called after every step
    """

    def __init__(
        self,
        threshold: float = DEFAULT_THRESHOLD,
        min_loaded: int = MIN_LOADED,
        idle_ttl: int = IDLE_TTL,
    ):
        self._lock = threading.Lock()
        self._access: dict[str, float] = {}  # kind → last access time
        self._unload_fn: dict[str, Callable[[], None]] = {}  # kind → unload callable
        self.threshold = threshold
        self.min_loaded = min_loaded
        self.idle_ttl = idle_ttl

    def register(self, kind: str, unload_fn: Callable[[], None]) -> None:
        """Register a model kind with its unload function."""
        with self._lock:
            self._unload_fn[kind] = unload_fn

    def touch(self, kind: str) -> None:
        """Mark model kind as recently used."""
        with self._lock:
            self._access[kind] = time.monotonic()

    def evict_if_needed(self) -> int:
        """Unload LRU models if memory pressure. Returns count evicted."""
        if os.environ.get("LUMINA_KEEP_MODELS"):
            return 0

        ratio, source = get_memory_usage()
        if ratio is not None:
            log.debug(f"Memory usage: {ratio:.0%} ({source})")
        if ratio is None or ratio < self.threshold:
            return 0

        with self._lock:
            # Sort by last access (oldest first)
            sorted_kinds = sorted(
                self._access.keys(),
                key=lambda k: self._access.get(k, 0),
            )
            loaded = len(sorted_kinds)
            evicted = 0

            for kind in sorted_kinds:
                if loaded - evicted <= self.min_loaded:
                    break
                # Only evict models idle longer than TTL
                age = time.monotonic() - self._access.get(kind, 0)
                if age < self.idle_ttl:
                    continue
                fn = self._unload_fn.get(kind)
                if fn is None:
                    continue
                try:
                    fn()
                    del self._access[kind]
                    evicted += 1
                    log.info(
                        f"Evicted idle model '{kind}' "
                        f"(memory {ratio:.0%} > {self.threshold:.0%})"
                    )
                except Exception as e:
                    log.debug(f"Eviction of '{kind}' failed: {e}")

            return evicted

    def snapshot(self) -> dict[str, float]:
        """Return copy of access timestamps (for debugging)."""
        with self._lock:
            now = time.monotonic()
            return {k: now - v for k, v in self._access.items()}

    def clear(self) -> None:
        """Clear all tracked models."""
        with self._lock:
            self._access.clear()

    def loaded_kinds(self) -> list[str]:
        """Return list of currently tracked model kinds."""
        with self._lock:
            return list(self._access.keys())

