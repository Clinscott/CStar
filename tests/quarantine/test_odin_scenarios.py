from src.games.odin_protocol.engine.scenarios import SovereignScenarioEngine


def test_generate_scenario_deterministic():
    """Verifies that scenario generation is deterministic with the same seed."""
    engine = SovereignScenarioEngine()
    stats = {"AESIR_MIGHT": 10.0}
    seed = "TEST_SEED"

    s1 = engine.generate_scenario(stats, seed=seed, turn_id=1)
    s2 = engine.generate_scenario(stats, seed=seed, turn_id=1)

    assert s1["planet_name"] == s2["planet_name"]
    assert s1["conflict"] == s2["conflict"]

def test_generate_scenario_different_turn():
    """Verifies that different turns produce different scenarios."""
    engine = SovereignScenarioEngine()
    stats = {"AESIR_MIGHT": 10.0}
    seed = "TEST_SEED"

    s1 = engine.generate_scenario(stats, seed=seed, turn_id=1)
    s2 = engine.generate_scenario(stats, seed=seed, turn_id=2)

    assert s1["planet_name"] != s2["planet_name"] or s1["conflict"] != s2["conflict"]
