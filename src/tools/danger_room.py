#!/usr/bin/env python3
"""Retired provider-backed test scaffolding and source writer."""

from __future__ import annotations


RETIRED_ERROR = "legacy_danger_room_retired_use_cstar_forge"


class DangerRoom:
    """Retain markdown-fence normalization only; actions fail closed."""

    def __init__(
        self,
        target_limit: int = 1,
        max_retries: int = 3,
        token_limit_per_session: int = 50000,
    ) -> None:
        self.target_limit = target_limit
        self.max_retries = max_retries
        self.token_limit = token_limit_per_session

    @staticmethod
    def _clean_markdown(text: str) -> str:
        cleaned = (text or "").strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            lines = lines[1:] if lines else lines
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            return "\n".join(lines).strip()
        return cleaned

    def _read_ledger(self) -> list[dict]:
        raise RuntimeError(RETIRED_ERROR)

    async def _scaffold_test(self, file_path_str: str) -> str | None:
        raise RuntimeError(RETIRED_ERROR)

    def _human_review(self, target_file: str, test_code: str) -> bool:
        return False

    def _commit_test(self, target_file: str, test_code: str) -> bool:
        return False

    async def execute(self) -> None:
        raise RuntimeError(RETIRED_ERROR)


def main() -> int:
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
