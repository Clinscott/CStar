from src.games.odin_protocol.engine.gm_client import OdinGM


def test_odin_gm_offline_fallback():
    """Verifies that OdinGM falls back to agent_engine when no client is available."""
    gm = OdinGM(api_key=None)
    assert gm.client is None

    stats = {"MIGHT": 10.0}
    scenario = gm.generate_scenario(stats, "SEED", 1)
    assert "planet_name" in scenario
    assert "options" in scenario

def test_odin_gm_describe_outcome_offline():
    """Verifies outcome description in offline mode."""
    gm = OdinGM(api_key=None)
    scenario = {"planet_name": "Mars"}
    outcome = gm.describe_outcome(scenario, "Odin", "A", True)
    assert "[DIRECTIVE]: SUCCESS" in outcome
