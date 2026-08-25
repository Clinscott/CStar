"""Import-safe tombstone for the retired direct provider model lister."""

from __future__ import annotations

import sys
from typing import NoReturn


RETIRED_SECRET_PROVIDER_TOOL_ERROR = (
    "legacy_secret_vault_provider_tools_retired_use_supported_surfaces"
)


def _retired(*_args: object, **_kwargs: object) -> NoReturn:
    raise RuntimeError(RETIRED_SECRET_PROVIDER_TOOL_ERROR)


class ModelLister:
    """Historical provider probe retained only to fail before credential access."""

    execute = staticmethod(_retired)


def main() -> int:
    sys.stderr.write(f"{RETIRED_SECRET_PROVIDER_TOOL_ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
