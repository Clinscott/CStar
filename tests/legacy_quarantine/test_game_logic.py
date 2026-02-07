import pytest
import os
import sys

# Ensure project root is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from odin_protocol.engine.models import Chromosome
from odin_protocol.engine.logic import calculate_effective_stats, get_federated_seed

def test_synergy_boost():
    """Verify that synergies correctly buff other stats."""
    # AESIR_MIGHT synergizes with BERSERKER_RAGE
    c1 = Chromosome(id="AESIR_MIGHT", name="Might", level=10)
    c2 = Chromosome(id="BERSERKER_RAGE", name="Rage", level=5)
    
    inventory = {"AESIR_MIGHT": c1, "BERSERKER_RAGE": c2}
    stats = calculate_effective_stats(inventory, [])
    
    # BERSERKER_RAGE should be base(5) + 10% of AESIR_MIGHT(1) = 6
    assert stats["BERSERKER_RAGE"] == 6.0

def test_interference_penalty():
    """Verify that interferences correctly nerfs other stats."""
    # AESIR_MIGHT interferes with LOKI_SHADOW
    c1 = Chromosome(id="AESIR_MIGHT", name="Might", level=10)
    c3 = Chromosome(id="LOKI_SHADOW", name="Shadow", level=10)
    
    inventory = {"AESIR_MIGHT": c1, "LOKI_SHADOW": c3}
    stats = calculate_effective_stats(inventory, [])
    
    # LOKI_SHADOW should be base(10) - 15% of AESIR_MIGHT(1.5) = 8.5
    assert stats["LOKI_SHADOW"] == 8.5

def test_seed_determinism():
    """Ensure the seed generation is consistent for the same project root."""
    root = os.getcwd()
    seed1 = get_federated_seed(root)
    seed2 = get_federated_seed(root)
    assert seed1 == seed2
    assert seed1.startswith("C*")
