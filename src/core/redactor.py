"""Pure in-memory redaction over explicitly injected synthetic values.

The redactor deliberately has no vault, environment, config, or filesystem
fallback.  Callers that need redaction must supply the exact values for the
current in-memory operation.
"""

from __future__ import annotations

import re
from collections.abc import Mapping


class Redactor:
    """Mask explicit values without discovering or persisting secrets."""

    def __init__(self, values: Mapping[str, str] | None = None) -> None:
        supplied = values or {}
        ordered = sorted(
            (
                (str(key), value)
                for key, value in supplied.items()
                if isinstance(value, str) and value
            ),
            key=lambda item: len(item[1]),
            reverse=True,
        )
        self._patterns = [
            (key, re.compile(re.escape(value)))
            for key, value in ordered
        ]

    def redact(self, text: str) -> str:
        """Replace only the explicit values supplied to this instance."""

        redacted = text
        for key, pattern in self._patterns:
            redacted = pattern.sub(f"[REDACTED_{key}]", redacted)
        return redacted

    @staticmethod
    def redact_shorthand(
        text: str,
        values: Mapping[str, str] | None = None,
    ) -> str:
        """Pure shorthand with no implicit value discovery."""

        return Redactor(values).redact(text)
