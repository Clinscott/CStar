"""Retired Synapse persona-authentication compatibility surface.

Persona is style-only and may be read only through the bounded ``cstar_status``
projection.  This module never opens a configuration file or derives a local
secret-backed authority signal.
"""

from __future__ import annotations


RETIRED_ERROR = "legacy_synapse_persona_auth_retired_persona_is_not_authority"


class PersonaVerifier:
    """Fail-closed compatibility object with no secret or configuration access."""

    def __init__(self, config_path: str) -> None:
        self.config_path = config_path
        self.secret = None

    def _load_secret(self) -> None:
        return None

    def generate_challenge(self) -> str:
        raise RuntimeError(RETIRED_ERROR)

    def solve_challenge(self, challenge: str, persona: str) -> str:
        raise RuntimeError(RETIRED_ERROR)

    def verify_response(self, challenge: str, response: str, persona: str) -> bool:
        return False


class SynapseAuthenticator:
    """Never treats a local persona handshake as authorization."""

    @staticmethod
    def authenticate_sync(persona: str) -> bool:
        return False


def main() -> int:
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
