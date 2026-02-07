import pytest
import os
import sys
import json
from typing import Dict, Any

# Ensure project root is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from odin_protocol.engine.scenarios import SovereignScenarioEngine
from odin_protocol.engine.models import UniverseState, Chromosome
from odin_protocol.main import OdinAdventure

def test_scenario_determinism():
    """Verify that same seed and turn produces the same scenario."""
    engine = SovereignScenarioEngine()
    stats = {"AESIR_MIGHT": 10.0}
    seed = "C*TEST_SEED"
    
    s1 = engine.generate(stats, seed=seed, turn_id=1)
    s2 = engine.generate(stats, seed=seed, turn_id=1)
    s3 = engine.generate(stats, seed=seed, turn_id=2)
    
    # Same inputs -> Same output
    assert s1["planet_name"] == s2["planet_name"]
    assert s1["environmental_hazard"] == s2["environmental_hazard"]
    
    # Different turn -> Different output
    assert s1["planet_name"] != s3["planet_name"]

def test_briefing_cooldown(capsys, monkeypatch):
    """Verify that Alfred's briefing honors the 3-turn cooldown."""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Mocking environment
    monkeypatch.setattr('builtins.input', lambda _: "")
    monkeypatch.setattr('os.system', lambda _: 0)
    
    game = OdinAdventure(project_root)
    
    # Reset state for test
    game.state.total_worlds_conquered = 0
    game.state.domination_percent = 10.0
    game.state.last_briefing_turn = -5 # Long ago
    
    # First briefing should work
    game.briefing()
    assert game.state.last_briefing_turn == 10 # turn = 0 + 10
    
    # Second briefing immediately should fail
    game.briefing()
    captured = capsys.readouterr()
    assert "[ALFRED]:" in captured.out
    
    # Advance turns (e.g. simulate domination gain)
    game.state.domination_percent = 15.0 # Total turn = 15
    game.briefing() # Should work now as 15 > 10 + 3
    assert game.state.last_briefing_turn == 15

def test_circular_synergy_safety():
    """Verify that calculate_effective_stats doesn't loop infinitely."""
    from odin_protocol.engine.logic import calculate_effective_stats
    
    # AESIR_MIGHT synergizes with BERSERKER_RAGE
    # BERSERKER_RAGE synergizes with AESIR_MIGHT
    # Both are defined in our Map.
    
    c1 = Chromosome(id="AESIR_MIGHT", name="Might", level=10.0)
    c2 = Chromosome(id="BERSERKER_RAGE", name="Rage", level=10.0)
    
    inventory = {"AESIR_MIGHT": c1, "BERSERKER_RAGE": c2}
    stats = calculate_effective_stats(inventory, [])
    
    # Each should be 10 (base) + 1.0 (10% of 10) = 11.0
    # It should NOT be more, proving only one-level deep application.
    assert stats["AESIR_MIGHT"] == 11.0
    assert stats["BERSERKER_RAGE"] == 11.0

def test_linscott_typing():
    """Verify code items are compliant with Linscott Standard (Type Hints)."""
    import inspect
    from odin_protocol.engine import logic
    
    # Check calculate_effective_stats
    sig = inspect.signature(logic.calculate_effective_stats)
    ret_str = str(sig.return_annotation)
    assert "Dict[str, float]" in ret_str or "dict[str, float]" in ret_str
    assert 'inventory' in sig.parameters
