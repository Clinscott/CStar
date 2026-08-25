import subprocess
import sys
from pathlib import Path

import src.synapse.synapse_auth as synapse_auth


ROOT = Path(__file__).resolve().parents[2]


def test_retired_auth_surface_never_grants_persona_authority():
    assert synapse_auth.authenticate_sync("ODIN") is False
    assert synapse_auth.authenticate_sync("ALFRED") is False
    assert synapse_auth.SynapseAuthenticator.authenticate_sync("ODIN") is False


def test_secret_reading_persona_verifier_is_not_exported():
    assert not hasattr(synapse_auth, "PersonaVerifier")


def test_retired_auth_cli_fails_closed():
    result = subprocess.run(
        [sys.executable, "src/synapse/synapse_auth.py"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 78
    assert synapse_auth.RETIRED_REASON in result.stderr
