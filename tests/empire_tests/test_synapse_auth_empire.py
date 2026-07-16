import pytest

from src.synapse.synapse_auth import (
    RETIRED_ERROR,
    PersonaVerifier,
    SynapseAuthenticator,
)


def test_persona_verifier_never_reads_config_or_secret(tmp_path):
    config_file = tmp_path / "config.json"
    original = "secret-bearing-content-must-not-be-read"
    config_file.write_text(original, encoding="utf-8")

    verifier = PersonaVerifier(str(config_file))

    assert verifier.secret is None
    assert verifier.verify_response("challenge", "response", "ODIN") is False
    with pytest.raises(RuntimeError, match=RETIRED_ERROR):
        verifier.generate_challenge()
    with pytest.raises(RuntimeError, match=RETIRED_ERROR):
        verifier.solve_challenge("challenge", "ODIN")
    assert config_file.read_text(encoding="utf-8") == original


def test_persona_is_not_authority():
    assert SynapseAuthenticator.authenticate_sync("ODIN") is False
