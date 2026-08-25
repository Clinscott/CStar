"""Fail-closed compatibility facade for the retired Muninn worker."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from src.core.engine.ravens.retired import reject_ravens_operation, rejected_cycle_result


class Muninn:
    """Import-compatible shell with no worker, model, repository, or Hall access."""

    def __init__(self, target_path: str | None = None, use_docker: bool = False, **_: Any) -> None:
        self.target_path = target_path or "."
        self.use_docker = bool(use_docker)

    async def run_cycle(self) -> bool:
        reject_ravens_operation("Muninn.run_cycle")

    async def run_cycle_contract(self):
        return rejected_cycle_result(self.target_path)


async def _main() -> None:
    result = await Muninn().run_cycle_contract()
    print(json.dumps(result.to_dict(), indent=2))
    raise SystemExit(2)


if __name__ == "__main__":
    asyncio.run(_main())


__all__ = ["Muninn"]
