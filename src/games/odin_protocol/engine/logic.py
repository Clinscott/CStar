"""
[LOGIC] Odin Protocol Game Mechanics
Lore: "The rules of the All-Father's game."
Purpose: Implements combat ratings, effective stats, and choice adjudication.
"""

import subprocess
from typing import Any

from src.games.odin_protocol.engine.models import Chromosome, Item, UniverseState

# The Great Synergy Map (24 Chromosomes)
# Rule: Each trait has exactly 2 Synergies (+10%) and 1 Interference (-15%)
SYNERGY_MAP: dict[str, dict[str, list[str]]] = {
    "AESIR_MIGHT": {
        "synergies": ["BERSERKER_RAGE", "TYR_BARRIER"],
        "interferences": ["LOKI_SHADOW"],
    },
    "BERSERKER_RAGE": {
        "synergies": ["AESIR_MIGHT", "FENRIR_JAW"],
        "interferences": ["BALDR_LIGHT"],
    },
    "VALKYRIE_LUNGE": {
        "synergies": ["SKADI_GLIDE", "FREYJA_WEAVE"],
        "interferences": ["YMIR_STONE"],
    },
    "SKADI_GLIDE": {
        "synergies": ["VALKYRIE_LUNGE", "HEIMDALL_WATCH"],
        "interferences": ["SURTR_FLAME"],
    },
    "HUGINN_SIGHT": {
        "synergies": ["MUNINN_MEM", "ODIN_EYE"],
        "interferences": ["FAFNIR_SILENCE"],
    },
    "MUNINN_MEM": {
        "synergies": ["HUGINN_SIGHT", "MIMIR_WELL"],
        "interferences": ["JORMUNGANDR_COIL"],
    },
    "LOKI_SHADOW": {
        "synergies": ["FAFNIR_SILENCE", "GINNUNGAGAP_VOID"],
        "interferences": ["HEIMDALL_WATCH"],
    },
    "FAFNIR_SILENCE": {
        "synergies": ["LOKI_SHADOW", "NIDHOGG_DECAY"],
        "interferences": ["BRAGI_SONG"],
    },
    "TYR_BARRIER": {
        "synergies": ["YMIR_STONE", "BALDR_LIGHT"],
        "interferences": ["FENRIR_JAW"],
    },
    "YMIR_STONE": {
        "synergies": ["TYR_BARRIER", "SURTR_ASH"],
        "interferences": ["VALKYRIE_LUNGE"],
    },
    "SURTR_FLAME": {
        "synergies": ["HEL_COLD", "SURTR_ASH"],
        "interferences": ["IDUNN_BLOOM"],
    },
    "HEL_COLD": {
        "synergies": ["SURTR_FLAME", "IDUNN_BLOOM"],
        "interferences": ["SKADI_GLIDE"],
    },
    "IDUNN_BLOOM": {
        "synergies": ["HEL_COLD", "FREYJA_WEAVE"],
        "interferences": ["SURTR_ASH"],
    },
    "NIDHOGG_DECAY": {
        "synergies": ["FAFNIR_SILENCE", "JORMUNGANDR_COIL"],
        "interferences": ["ODIN_EYE"],
    },
    "FREYJA_WEAVE": {
        "synergies": ["IDUNN_BLOOM", "BALDR_LIGHT"],
        "interferences": ["GINNUNGAGAP_VOID"],
    },
    "GINNUNGAGAP_VOID": {
        "synergies": ["LOKI_SHADOW", "SURTR_ASH"],
        "interferences": ["FREYJA_WEAVE"],
    },
    "HEIMDALL_WATCH": {
        "synergies": ["SKADI_GLIDE", "ODIN_EYE"],
        "interferences": ["LOKI_SHADOW"],
    },
    "JORMUNGANDR_COIL": {
        "synergies": ["NIDHOGG_DECAY", "FENRIR_JAW"],
        "interferences": ["MUNINN_MEM"],
    },
    "BALDR_LIGHT": {
        "synergies": ["TYR_BARRIER", "BRAGI_SONG"],
        "interferences": ["BERSERKER_RAGE"],
    },
    "BRAGI_SONG": {
        "synergies": ["BALDR_LIGHT", "MIMIR_WELL"],
        "interferences": ["FAFNIR_SILENCE"],
    },
    "FENRIR_JAW": {
        "synergies": ["BERSERKER_RAGE", "JORMUNGANDR_COIL"],
        "interferences": ["TYR_BARRIER"],
    },
    "SURTR_ASH": {
        "synergies": ["SURTR_FLAME", "YMIR_STONE"],
        "interferences": ["HEL_COLD"],
    },
    "MIMIR_WELL": {
        "synergies": ["MUNINN_MEM", "BRAGI_SONG"],
        "interferences": ["HUGINN_SIGHT"],
    },
    "ODIN_EYE": {
        "synergies": ["HUGINN_SIGHT", "HEIMDALL_WATCH"],
        "interferences": ["NIDHOGG_DECAY"],
    },
}

__all__ = [
    "adjudicate_choice",
    "calculate_effective_stats",
    "get_combat_rating",
    "get_federated_seed",
    "trigger_restart",
    "update_domination",
]

def get_federated_seed(project_root: str) -> str:
    """
    Derives a unique seed from the project's Git metadata.
    
    Args:
        project_root: Path to the project root.
        
    Returns:
        A unique seed string starting with 'C*'.
    """
    try:
        git_hash = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=project_root,
            stderr=subprocess.STDOUT
        ).decode("utf-8").strip()
        return f"C*{git_hash}"
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "C*FALLBACK_GENESIS"

def calculate_effective_stats(
    inventory: dict[str, Chromosome],
    items: list[Item],
    world_modifiers: list[dict[str, Any]] | None = None
) -> dict[str, float]:
    """
    Calculates the ripple-effect math with Recursive Synergies and Compounds.

    Args:
        inventory: Map of IDs to Chromosome objects.
        items: List of Item objects currently equipped.
        world_modifiers: List of active environmental inversions/buffs.

    Returns:
        A map of Chromosome IDs to their final effective levels.
    """
    # 1. Start with base levels + Item Bonuses
    eff_stats = {id: float(c.level) for id, c in inventory.items()}
    for item in items:
        for chromo_id, bonus in item.buffs.items():
            if chromo_id in eff_stats:
                eff_stats[chromo_id] += bonus

    # Identify Inversions
    inversions = []
    if world_modifiers:
        inversions = [m["target"] for m in world_modifiers if m.get("type") == "INVERSION"]

    # 2. Tier 1 Ripples
    base_snapshot = {id: float(c.level) for id, c in inventory.items()}
    for char_id, level in base_snapshot.items():
        mapping = SYNERGY_MAP.get(char_id)
        if not mapping:
            continue

        # Apply logic: Inverted planets swap Synergies and Interferences
        is_inverted = char_id in inversions
        syn_mult = 0.10 if not is_inverted else -0.15
        int_mult = -0.15 if not is_inverted else 0.10

        for target in mapping["synergies"]:
            if target in eff_stats:
                eff_stats[target] += (level * syn_mult)
        for target in mapping["interferences"]:
            if target in eff_stats:
                eff_stats[target] += (level * int_mult)

    return eff_stats

def get_combat_rating(effective_stats: dict[str, float]) -> float:
    """
    Reduces the entire genetic manifest to a single 'Dominion Score'.
    
    Args:
        effective_stats: Map of effective trait levels.
        
    Returns:
        The sum of all effective levels.
    """
    if not effective_stats:
        return 0.0
    return sum(effective_stats.values())

def adjudicate_choice(
    state: UniverseState,
    choice: dict[str, Any],
    stats: dict[str, float],
    scenario: dict[str, Any]
) -> dict[str, Any]:
    """
    Calculates tactical outcome using a 'Weighted Die Cast' model.
    
    Args:
        state: The current UniverseState.
        choice: The selected option dictionary.
        stats: Effective player stats.
        scenario: The current scenario context.
        
    Returns:
        A dictionary containing the result of the adjudication.
    """
    from src.games.odin_protocol.engine.rng import TacticalRNG

    threshold = choice.get('threshold', 50.0)
    l_void = stats.get("GINNUNGAGAP_VOID", 0.0)

    # Void Divisor: Reduces enemy thresholds
    adjusted_threshold = threshold / (1 + (l_void * 0.05))
    rating = get_combat_rating(stats)

    # Probabilistic Weighting (The Die Cast)
    # Base chance is the ratio, clamped at 5% - 95%
    base_chance = (rating / adjusted_threshold) * 0.5

    # Gene Seed Influence: +15% if the specific trait is strong relative to threshold
    trait = choice.get('trait', 'Unknown')
    trait_lvl = stats.get(trait, 10.0)
    if trait_lvl > (adjusted_threshold * 0.15):
        base_chance += 0.15

    success_chance = max(0.05, min(0.95, base_chance))
    roll = TacticalRNG.random()
    success = roll < success_chance

    # Force Adjudication (Resource Drains)
    diff = choice.get('difficulty', 'Normal')
    costs = {"Trivial": 2.0, "Easy": 3.0, "Normal": 5.0, "Hard": 8.0, "Lethal": 12.0}
    base_cost = costs.get(diff, 5.0)

    # Success Mitigation: +50% cost reduction
    force_delta = -base_cost if not success else -(base_cost * 0.5)

    # Domination Adjudication
    if success:
        dom_delta = TacticalRNG.uniform(1.5, 4.0)
    else:
        dom_delta = -TacticalRNG.uniform(2.0, 5.0)

    penalty_msg = ""
    if not success:
        # Kingdom Death Penalties (Chromosome Decay)
        cid = TacticalRNG.choice(list(state.inventory.keys()))
        old_lvl = state.inventory[cid].level
        damage = TacticalRNG.randint(1, 3)
        state.inventory[cid].level = max(1, old_lvl - damage)
        penalty_msg = f"{cid} decayed by {damage} points."

    return {
        "success": success,
        "roll": round(roll, 2),
        "chance": round(success_chance, 2),
        "force_delta": round(force_delta, 1),
        "dom_delta": round(dom_delta, 1),
        "rating": round(rating, 2),
        "threshold": round(adjusted_threshold, 2),
        "penalty_msg": penalty_msg
    }

def update_domination(state: UniverseState, success: bool) -> None:
    """
    Updates domination percentage for the current world and global empire.

    Args:
        state: The current UniverseState object.
        success: Whether the previous encounter was successful.
    """
    if success:
        # Local Planet Progress
        p_inc = 15.0 + (state.mutation_charges * 0.5) # Slight boost from previous conquests
        state.current_planet_progress = min(100.0, state.current_planet_progress + p_inc)

        # Global Progress
        state.domination_percent = min(100.0, state.domination_percent + 5.0)

        # Mark Conquest if 100% reached
        if state.current_planet_progress >= 100.0:
            state.planets_dominated += 1
            state.mutation_charges = state.planets_dominated
            state.total_worlds_conquered += 1
    else:
        # Failure Penalties
        state.current_planet_progress = max(0.0, state.current_planet_progress - 20.0)
        state.domination_percent = max(0.0, state.domination_percent - 10.0)

        if state.domination_percent <= 0:
            trigger_restart(state)

def trigger_restart(state: UniverseState) -> None:
    """
    Resets the race state upon death while preserving history.

    Args:
        state: The current UniverseState object to reset.
    """
    # Restart percent = (max_percent / 3) rounded down
    restart_percent = float(int(state.max_percent_reached / 3.0))
    state.domination_percent = max(5.0, restart_percent) # Floor of 5%

    # Reset genetic levels to 1, but keep the inventory structure
    for chromosome in state.inventory.values():
        chromosome.level = 1
