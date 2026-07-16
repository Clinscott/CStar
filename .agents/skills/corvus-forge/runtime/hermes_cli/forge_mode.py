"""Fail-closed runtime boundary for CStar's one-shot Forge worker.

This mode is deliberately narrower than generic Hermes safe mode.  It is
active only when the CStar delegate, the safe-mode primer, and the dedicated
ephemeral flag all agree.  Forge callers may then perform exactly one selected
provider request; Hermes-owned persistence, discovery, fallback, and background
maintenance must remain disabled.
"""

from __future__ import annotations

import os
import threading


_TRUTHY = frozenset({"1", "true", "yes", "on"})
_PROVIDER_REQUESTS_CONSUMED = 0
_PROVIDER_REQUEST_LOCK = threading.Lock()
_ENTRYPOINT_ACTIVE = False


class ForgeModeConfigurationError(RuntimeError):
    """Raised before normal startup when Forge markers are inconsistent."""


def _enabled(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in _TRUTHY


def forge_ephemeral_mode() -> bool:
    """Return True only for an explicitly delegated CStar safe worker."""
    delegated = _enabled("CSTAR_FORGE_HERMES_DELEGATED")
    safe = _enabled("HERMES_SAFE_MODE")
    ephemeral = _enabled("HERMES_FORGE_EPHEMERAL")
    if (delegated or ephemeral) and not (delegated and safe and ephemeral):
        raise ForgeModeConfigurationError("forge_ephemeral_environment_incomplete")
    return delegated and safe and ephemeral


def consume_forge_provider_request() -> None:
    """Consume the process-wide one-shot provider capability at SDK dispatch."""
    global _PROVIDER_REQUESTS_CONSUMED
    if not forge_ephemeral_mode():
        return
    with _PROVIDER_REQUEST_LOCK:
        if not _ENTRYPOINT_ACTIVE:
            raise ForgeModeConfigurationError("forge_ephemeral_direct_entrypoint_required")
        if _PROVIDER_REQUESTS_CONSUMED:
            raise ForgeModeConfigurationError("forge_ephemeral_provider_request_already_spent")
        _PROVIDER_REQUESTS_CONSUMED = 1


def activate_forge_entrypoint() -> None:
    """Arm the provider capability only for the reviewed stdlib entrypoint."""
    global _ENTRYPOINT_ACTIVE
    if not forge_ephemeral_mode():
        raise ForgeModeConfigurationError("forge_ephemeral_environment_incomplete")
    with _PROVIDER_REQUEST_LOCK:
        if _ENTRYPOINT_ACTIVE or _PROVIDER_REQUESTS_CONSUMED:
            raise ForgeModeConfigurationError("forge_ephemeral_entrypoint_already_active")
        _ENTRYPOINT_ACTIVE = True
