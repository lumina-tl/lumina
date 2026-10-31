"""Custom LLM provider — OpenAI-compatible chat completions."""
from __future__ import annotations

from .._base import (
    TranslateError,
    build_batch_prompt,
    build_single_prompt,
    build_system_instruction,
    parse_batch_response,
)
from ..protocol.openai import chat
from utils.logger import log


def _resolve(config: dict) -> tuple[str, str, str]:
    """(base_url, api_key, model) — plain llm* fields, no presets."""
    return (
        config.get("llmBaseUrl") or "",
        config.get("llmApiKey") or "",
        config.get("llmModel") or "",
    )


def translate(text: str, target: str, config: dict) -> str:
    base_url, api_key, model = _resolve(config)
    if not base_url:
        raise TranslateError("LLM base URL not configured")
    if not model:
        raise TranslateError("LLM model not configured")
    log.debug(f"Custom translate: model={model}")
    system = build_system_instruction(config, target)
    prev = config.get("previousLines") or ""
    if isinstance(prev, list):
        prev = " / ".join(str(p) for p in prev if p)
    return chat(
        base_url,
        api_key,
        model,
        system,
        build_single_prompt(text, target, previous_line=prev),
    )


def translate_batch(
    texts: list[str], target: str, config: dict
) -> list[str]:
    base_url, api_key, model = _resolve(config)
    if not base_url:
        raise TranslateError("LLM base URL not configured")
    if not model:
        raise TranslateError("LLM model not configured")
    system = build_system_instruction(config, target)
    raw = chat(
        base_url,
        api_key,
        model,
        system,
        build_batch_prompt(
            texts,
            target,
            previous_lines=config.get("previousLines"),
            types=config.get("types"),
        ),
        json_mode=True,
    )
    return parse_batch_response(raw, len(texts))

