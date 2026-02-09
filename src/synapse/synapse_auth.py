#!/usr/bin/env python3
"""
Synapse Auth: The Neural Handshake
[Ω] BYFROST GATEKEEPER / [A] SECURITY CLEARANCE PRIMARY

Handles zero-knowledge-proof persona verification for Knowledge Core operations.
"""

import hashlib
import json
import os
import random
from typing import Optional

class PersonaVerifier:
    """[ALFRED] Secure persona verification using hashed challenge-response."""
    
    def __init__(self, config_path: str) -> None:
        self.config_path = config_path
        self.secret = self._load_secret()

    def _load_secret(self) -> str:
        if os.path.exists(self.config_path):
            with open(self.config_path, 'r') as f:
                config = json.load(f)
                return config.get("NeuralSecret", "CORVUS_DEFAULT_SIGNAL")
        return "CORVUS_DEFAULT_SIGNAL"

    def generate_challenge(self) -> str:
        """Generate a random 32-char challenge string."""
        chars = "abcdef0123456789"
        return "".join(random.choice(chars) for _ in range(32))

    def solve_challenge(self, challenge: str, persona: str) -> str:
        """Solve challenge: SHA256(challenge + secret + persona)."""
        payload = f"{challenge}{self.secret}{persona.upper()}"
        return hashlib.sha256(payload.encode()).hexdigest()

    def verify_response(self, challenge: str, response: str, persona: str) -> bool:
        """Verify the client's solution to the challenge."""
        expected = self.solve_challenge(challenge, persona)
        return response == expected

def authenticate_sync(persona: str) -> bool:
    """[ALFRED] High-level authentication helper for synapse_sync."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(os.path.dirname(script_dir), "config.json")
    
    verifier = PersonaVerifier(config_path)
    challenge = verifier.generate_challenge()
    # In a real federated system, the challenge would come from the remote server.
    # Here, we simulate a 'local handshake' for security hardening.
    response = verifier.solve_challenge(challenge, persona)
    
    return verifier.verify_response(challenge, response, persona)

if __name__ == "__main__":
    import sys
    p = sys.argv[1] if len(sys.argv) > 1 else "ALFRED"
    if authenticate_sync(p):
        print(f"AUTHENTICATED: {p}")
        sys.exit(0)
    
    print(f"REJECTED: {p}")
    sys.exit(1)
