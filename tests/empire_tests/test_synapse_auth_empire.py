import pytest
import json
import os
from src.synapse.synapse_auth import PersonaVerifier

def test_persona_verifier_challenge():
    verifier = PersonaVerifier("dummy_config.json")
    challenge = verifier.generate_challenge()
    assert len(challenge) == 32
    assert all(c in "abcdef0123456789" for c in challenge)

def test_persona_verifier_handshake():
    verifier = PersonaVerifier("dummy_config.json")
    challenge = verifier.generate_challenge()
    persona = "ODIN"
    
    # Solve
    response = verifier.solve_challenge(challenge, persona)
    
    # Verify
    assert verifier.verify_response(challenge, response, persona) is True
    
    # Bad persona
    assert verifier.verify_response(challenge, response, "ALFRED") is False
    
    # Bad response
    assert verifier.verify_response(challenge, "wrong", persona) is False

def test_persona_verifier_secret(tmp_path):
    config_file = tmp_path / "config.json"
    config_file.write_text(json.dumps({"security": {"neural_secret": "TOP_SECRET"}}), encoding='utf-8')
    
    verifier = PersonaVerifier(str(config_file))
    assert verifier.secret == "TOP_SECRET"
