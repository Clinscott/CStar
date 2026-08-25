#!/usr/bin/env python3
"""Fail-closed tombstone for the retired local Synapse handshake."""

from __future__ import annotations

import sys


RETIRED_REASON = "legacy_synapse_auth_retired_no_remote_verifier"


def authenticate_sync(_persona: str) -> bool:
    """No local challenge can authorize a remote knowledge mutation."""
    return False


class SynapseAuthenticator:
    """Compatibility facade that always rejects the retired handshake."""

    authenticate_sync = staticmethod(authenticate_sync)


if __name__ == "__main__":
    print(RETIRED_REASON, file=sys.stderr)
    raise SystemExit(78)
