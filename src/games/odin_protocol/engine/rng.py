"""
[ENGINE] Tactical RNG
Lore: "The dice of the All-Father."
Purpose: Encapsulates randomness to allow for deterministic testing and cryptographic replacement.
"""

import random
import secrets
from collections.abc import Sequence
from typing import TypeVar

T = TypeVar("T")

class TacticalRNG:
    """
    Wrapper for random number generation used in game mechanics.
    """
    @staticmethod
    def random() -> float:
        """Returns a float between 0.0 and 1.0."""
        return random.random()

    @staticmethod
    def uniform(a: float, b: float) -> float:
        """
        Returns a random float N such that a <= N <= b.
        
        Args:
            a: Lower bound.
            b: Upper bound.
        """
        return random.uniform(a, b)

    @staticmethod
    def choice(seq: Sequence[T]) -> T:
        """
        Choose a random element from a non-empty sequence.
        
        Args:
            seq: A sequence of elements.
        """
        return random.choice(seq)

    @staticmethod
    def randint(a: int, b: int) -> int:
        """
        Return a random integer in range [a, b], including both end points.
        
        Args:
            a: Lower bound.
            b: Upper bound.
        """
        return random.randint(a, b)

    @staticmethod
    def secure_choice(seq: Sequence[T]) -> T:
        """
        Cryptographically secure choice from a sequence.
        
        Args:
            seq: A sequence of elements.
        """
        return secrets.choice(seq)
