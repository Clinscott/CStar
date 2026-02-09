"""
[ODIN] Tactical RNG Module
Encapsulates randomness to allow for deterministic testing and cryptographic replacement if needed.
"""
import random
import secrets

class TacticalRNG:
    """
    Wrapper for random number generation.
    """
    @staticmethod
    def random() -> float:
        """Returns a float between 0.0 and 1.0."""
        return random.random()

    @staticmethod
    def uniform(a: float, b: float) -> float:
        """Returns a random float N such that a <= N <= b."""
        return random.uniform(a, b)

    @staticmethod
    def choice(seq):
        """Choose a random element from a non-empty sequence."""
        return random.choice(seq)

    @staticmethod
    def randint(a: int, b: int) -> int:
        """Return random integer in range [a, b], including both end points."""
        return random.randint(a, b)

    @staticmethod
    def secure_choice(seq):
        """Cryptographically secure choice."""
        return secrets.choice(seq)
