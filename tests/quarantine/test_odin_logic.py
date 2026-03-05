from src.games.odin_protocol.engine.logic import calculate_effective_stats, get_combat_rating
from src.games.odin_protocol.engine.models import Chromosome, Item


def test_calculate_effective_stats_basic():
    """Verifies basic stat calculation without synergies."""
    inventory = {
        "MIGHT": Chromosome(id="MIGHT", name="Might", level=10)
    }
    items = [
        Item(id="SWORD", name="Sword", category="Weapon", buffs={"MIGHT": 5.0})
    ]
    eff = calculate_effective_stats(inventory, items)
    assert eff["MIGHT"] == 15.0

def test_calculate_effective_stats_synergy():
    """Verifies that synergies are applied."""
    inventory = {
        "AESIR_MIGHT": Chromosome(id="AESIR_MIGHT", name="Might", level=10),
        "BERSERKER_RAGE": Chromosome(id="BERSERKER_RAGE", name="Rage", level=5)
    }
    # AESIR_MIGHT synergies: BERSERKER_RAGE, TYR_BARRIER
    # 10.0 level should give +1.0 (10%) to BERSERKER_RAGE
    eff = calculate_effective_stats(inventory, [])
    assert eff["BERSERKER_RAGE"] == 6.0 # 5.0 base + 1.0 synergy

def test_get_combat_rating():
    """Verifies combat rating sum."""
    stats = {"A": 10.0, "B": 5.5}
    assert get_combat_rating(stats) == 15.5
