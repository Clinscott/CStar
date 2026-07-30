"""Import-safe tombstone for the retired repository-local secret vault.

Secret storage, inspection, encryption, and rotation require supported host
surfaces and explicit operator authority.  This module never constructs a key,
reads dotenv content, or writes a vault artifact.
"""

from __future__ import annotations

import sys
from typing import NoReturn


RETIRED_SECRET_PROVIDER_TOOL_ERROR = (
    "legacy_secret_vault_provider_tools_retired_use_supported_surfaces"
)


def _retired(*_args: object, **_kwargs: object) -> NoReturn:
    raise RuntimeError(RETIRED_SECRET_PROVIDER_TOOL_ERROR)


class SovereignVault:
    """Historical vault API retained only as a fail-closed compatibility type."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    _ensure_master_key = staticmethod(_retired)
    auto_shield = staticmethod(_retired)
    rotate_keys = staticmethod(_retired)
    get_secrets_map = staticmethod(_retired)


def main() -> int:
    """Return a stable error without reading arguments, paths, or secret state."""

    sys.stderr.write(f"{RETIRED_SECRET_PROVIDER_TOOL_ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
