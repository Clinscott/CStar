from __future__ import annotations

import os
import json
from typing import Literal, TypedDict

HostProvider = Literal["gemini", "codex", "claude"]


class HostBridgeConfig(TypedDict):
    command: str
    args: list[str]


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
    if override in {"gemini", "codex", "claude"}:
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
    current_env = env if env is not None else os.environ
    override = _normalize_flag(current_env.get("CORVUS_HOST_SESSION_ACTIVE"))
    if override is False:
        return None

    provider = detect_host_provider(env)
    if provider is not None:
        return provider

    return fallback if is_host_session_active(env) else None


def _parse_bridge_args_json(raw: str | None, env_name: str) -> list[str]:
    if raw is None or not raw.strip():
        return ["{prompt}"]

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{env_name} must be valid JSON: {exc}") from exc

    if not isinstance(parsed, list) or not all(isinstance(entry, str) for entry in parsed):
        raise RuntimeError(f"{env_name} must be a JSON array of strings.")

    return [str(entry) for entry in parsed]


def _provider_bridge_env_names(provider: HostProvider) -> tuple[str, str]:
    prefix = f"CORVUS_{provider.upper()}_HOST_BRIDGE"
    return f"{prefix}_CMD", f"{prefix}_ARGS_JSON"


def resolve_configured_host_bridge(
    provider: HostProvider,
    env: dict[str, str] | None = None,
) -> HostBridgeConfig | None:
    current_env = env if env is not None else dict(os.environ)
    provider_cmd_key, provider_args_key = _provider_bridge_env_names(provider)
    provider_command = current_env.get(provider_cmd_key, "").strip()
    if provider_command:
        return {
            "command": provider_command,
            "args": _parse_bridge_args_json(current_env.get(provider_args_key), provider_args_key),
        }

    shared_command = current_env.get("CORVUS_HOST_BRIDGE_CMD", "").strip()
    if shared_command:
        return {
            "command": shared_command,
            "args": _parse_bridge_args_json(
                current_env.get("CORVUS_HOST_BRIDGE_ARGS_JSON"),
                "CORVUS_HOST_BRIDGE_ARGS_JSON",
            ),
        }

    return None


def expand_host_bridge_args(
    template: list[str],
    *,
    prompt: str,
    project_root: str,
    provider: HostProvider,
) -> list[str]:
    return [
        entry.replace("{prompt}", prompt)
        .replace("{project_root}", project_root)
        .replace("{provider}", provider)
        for entry in template
    ]


def get_host_bridge_configuration_hint(provider: HostProvider) -> str:
    provider_cmd_key, provider_args_key = _provider_bridge_env_names(provider)
    return (
        f"Set {provider_cmd_key} and {provider_args_key}, "
        "set CORVUS_HOST_BRIDGE_CMD and CORVUS_HOST_BRIDGE_ARGS_JSON, "
        "or supply an explicit host_session_runner."
    )
