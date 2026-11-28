from utils import runtime


def test_auto_prefers_directml_for_amd_gpu(monkeypatch):
    monkeypatch.setattr(runtime, "get_available_providers", lambda: [
        "CUDAExecutionProvider",
        "DmlExecutionProvider",
        "CPUExecutionProvider",
    ])
    monkeypatch.setattr(runtime, "_windows_gpu_names", lambda: ["AMD Radeon RX 580"])
    monkeypatch.setattr(runtime.os, "name", "nt")
    monkeypatch.delenv("LUMINA_EP", raising=False)

    assert runtime.resolve_providers() == [
        "DmlExecutionProvider",
        "CPUExecutionProvider",
    ]


def test_auto_prefers_cuda_for_nvidia_gpu(monkeypatch):
    monkeypatch.setattr(runtime, "get_available_providers", lambda: [
        "CUDAExecutionProvider",
        "DmlExecutionProvider",
        "CPUExecutionProvider",
    ])
    monkeypatch.setattr(runtime, "_windows_gpu_names", lambda: ["NVIDIA GeForce RTX"])
    monkeypatch.setattr(runtime.os, "name", "nt")
    monkeypatch.delenv("LUMINA_EP", raising=False)

    assert runtime.resolve_providers() == [
        "CUDAExecutionProvider",
        "DmlExecutionProvider",
        "CPUExecutionProvider",
    ]


def test_amd_gpu_does_not_claim_acceleration_without_directml(monkeypatch):
    monkeypatch.setattr(runtime, "get_available_providers", lambda: [
        "CUDAExecutionProvider",
        "CPUExecutionProvider",
    ])
    monkeypatch.setattr(runtime, "_windows_gpu_names", lambda: ["AMD Radeon RX 580"])
    monkeypatch.setattr(runtime.os, "name", "nt")
    monkeypatch.delenv("LUMINA_EP", raising=False)

    assert runtime.resolve_providers() == ["CPUExecutionProvider"]
