"""Import-safe tombstone for the retired direct provider availability probe."""

from __future__ import annotations

import sys
from typing import NoReturn


RETIRED_SECRET_PROVIDER_TOOL_ERROR = (
    "legacy_secret_vault_provider_tools_retired_use_supported_surfaces"
)


def _retired(*_args: object, **_kwargs: object) -> NoReturn:
    raise RuntimeError(RETIRED_SECRET_PROVIDER_TOOL_ERROR)


def _require_genai() -> NoReturn:
    """Reject the historical provider accessor before SDK or secret discovery."""

    _retired()


def load_dotenv(*_args: object, **_kwargs: object) -> NoReturn:
    """Reject the historical dotenv compatibility hook before path access."""

    _retired()


def main() -> int:
    """Return the stable error without reading environment or calling a provider."""

    sys.stderr.write(f"{RETIRED_SECRET_PROVIDER_TOOL_ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
