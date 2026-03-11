from __future__ import annotations

import os
from typing import Literal

HostProvider = Literal["gemini", "codex"]


def _normalize_flag(value: str | None) -> bool | None:
    if value is None:
        return None

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


def detect_host_provider(env: dict[str, str] | None = None) -> HostProvider | None:
    current_env = env if env is not None else os.environ
    override = current_env.get("CORVUS_HOST_PROVIDER", "").strip().lower()
    if override in {"gemini", "codex"}:
        return override  # type: ignore[return-value]

    if current_env.get("GEMINI_CLI_ACTIVE") == "true":
        return "gemini"

    if current_env.get("CODEX_SHELL") == "1" or current_env.get("CODEX_THREAD_ID"):
        return "codex"

    return None


def is_host_session_active(env: dict[str, str] | None = None) -> bool:
    current_env = env if env is not None else os.environ
    override = _normalize_flag(current_env.get("CORVUS_HOST_SESSION_ACTIVE"))
    if override is not None:
        return override

    return detect_host_provider(current_env) is not None


def resolve_host_provider(
    env: dict[str, str] | None = None,
    fallback: HostProvider = "gemini",
) -> HostProvider | None:
    provider = detect_host_provider(env)
    if provider is not None:
        return provider

    return fallback if is_host_session_active(env) else None
