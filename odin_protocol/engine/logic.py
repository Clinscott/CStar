import subprocess

from .models import Chromosome, Item, UniverseState

# The Great Synergy Map (24 Chromosomes)
# Rule: Each trait has exactly 2 Synergies (+10%) and 1 Interference (-15%)
SYNERGY_MAP = {
    "AESIR_MIGHT": {"synergies": ["BERSERKER_RAGE", "TYR_BARRIER"], "interferences": ["LOKI_SHADOW"]},
    "BERSERKER_RAGE": {"synergies": ["AESIR_MIGHT", "FENRIR_JAW"], "interferences": ["BALDR_LIGHT"]},
    "VALKYRIE_LUNGE": {"synergies": ["SKADI_GLIDE", "FREYJA_WEAVE"], "interferences": ["YMIR_STONE"]},
    "SKADI_GLIDE": {"synergies": ["VALKYRIE_LUNGE", "HEIMDALL_WATCH"], "interferences": ["SURTR_FLAME"]},
    "HUGINN_SIGHT": {"synergies": ["MUNINN_MEM", "ODIN_EYE"], "interferences": ["FAFNIR_SILENCE"]},
    "MUNINN_MEM": {"synergies": ["HUGINN_SIGHT", "MIMIR_WELL"], "interferences": ["JORMUNGANDR_COIL"]},
    "LOKI_SHADOW": {"synergies": ["FAFNIR_SILENCE", "GINNUNGAGAP_VOID"], "interferences": ["HEIMDALL_WATCH"]},
    "FAFNIR_SILENCE": {"synergies": ["LOKI_SHADOW", "NIDHOGG_DECAY"], "interferences": ["BRAGI_SONG"]},
    "TYR_BARRIER": {"synergies": ["YMIR_STONE", "BALDR_LIGHT"], "interferences": ["FENRIR_JAW"]},
    "YMIR_STONE": {"synergies": ["TYR_BARRIER", "SURTR_ASH"], "interferences": ["VALKYRIE_LUNGE"]},
    "SURTR_FLAME": {"synergies": ["HEL_COLD", "SURTR_ASH"], "interferences": ["IDUNN_BLOOM"]},
    "HEL_COLD": {"synergies": ["SURTR_FLAME", "IDUNN_BLOOM"], "interferences": ["SKADI_GLIDE"]},
    "IDUNN_BLOOM": {"synergies": ["HEL_COLD", "FREYJA_WEAVE"], "interferences": ["SURTR_ASH"]},
    "NIDHOGG_DECAY": {"synergies": ["FAFNIR_SILENCE", "JORMUNGANDR_COIL"], "interferences": ["ODIN_EYE"]},
    "FREYJA_WEAVE": {"synergies": ["IDUNN_BLOOM", "BALDR_LIGHT"], "interferences": ["GINNUNGAGAP_VOID"]},
    "GINNUNGAGAP_VOID": {"synergies": ["LOKI_SHADOW", "SURTR_ASH"], "interferences": ["FREYJA_WEAVE"]},
    "HEIMDALL_WATCH": {"synergies": ["SKADI_GLIDE", "ODIN_EYE"], "interferences": ["LOKI_SHADOW"]},
    "JORMUNGANDR_COIL": {"synergies": ["NIDHOGG_DECAY", "FENRIR_JAW"], "interferences": ["MUNINN_MEM"]},
    "BALDR_LIGHT": {"synergies": ["TYR_BARRIER", "BRAGI_SONG"], "interferences": ["BERSERKER_RAGE"]},
    "BRAGI_SONG": {"synergies": ["BALDR_LIGHT", "MIMIR_WELL"], "interferences": ["FAFNIR_SILENCE"]},
    "FENRIR_JAW": {"synergies": ["BERSERKER_RAGE", "JORMUNGANDR_COIL"], "interferences": ["TYR_BARRIER"]},
    "SURTR_ASH": {"synergies": ["SURTR_FLAME", "YMIR_STONE"], "interferences": ["HEL_COLD"]},
    "MIMIR_WELL": {"synergies": ["MUNINN_MEM", "BRAGI_SONG"], "interferences": ["HUGINN_SIGHT"]},
    "ODIN_EYE": {"synergies": ["HUGINN_SIGHT", "HEIMDALL_WATCH"], "interferences": ["NIDHOGG_DECAY"]},
}

def get_federated_seed(project_root: str) -> str:
    """Derives a unique seed from the project's Git metadata.

    Args:
        project_root: The absolute path to the framework root.

    Returns:
        A deterministic seed string (e.g., 'C*a1b2c3d').
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

def calculate_effective_stats(inventory: dict[str, Chromosome], items: list[Item]) -> dict[str, float]:
    """Calculates the ripple-effect math for genetic synergies and item bonuses.

    This implements the 'Ripple Effect' logic where traits influence each other
    based on the established SYNERGY_MAP.

    Args:
        inventory: Map of IDs to Chromosome objects.
        items: List of Item objects currently equipped.

    Returns:
        A map of Chromosome IDs to their final effective levels.
    """
    # 1. Start with base levels
    effective_stats = {id: float(c.level) for id, c in inventory.items()}

    # 2. Apply Item Bonuses
    for item in items:
        for chromo_id, bonus in item.buffs.items():
            if chromo_id in effective_stats:
                effective_stats[chromo_id] += bonus

    # 3. Apply The Ripple Effect (Genetic Synergies/Interferences)
    # We use a copy to avoid order-of-operation bias during the iteration
    base_levels = {id: float(c.level) for id, c in inventory.items()}

    for char_id, level in base_levels.items():
        mapping = SYNERGY_MAP.get(char_id)
        if not mapping:
            continue

        # Apply Synergies (Buffs: +10% of source base level)
        for target_id in mapping["synergies"]:
            if target_id in effective_stats:
                effective_stats[target_id] += (level * 0.10)

        # Apply Interferences (Debuffs: -15% of source base level)
        for target_id in mapping["interferences"]:
            if target_id in effective_stats:
                effective_stats[target_id] -= (level * 0.15)

    return effective_stats

def get_combat_rating(effective_stats: dict[str, float]) -> float:
    """Reduces the entire genetic manifest to a single 'Dominion Score'.

    Args:
        effective_stats: The result of calculate_effective_stats.

    Returns:
        The sum of all effective levels.
    """
    if not effective_stats:
        return 0.0
    return sum(effective_stats.values())

def adjudicate_choice(stats: dict[str, float], threshold: float) -> bool:
    """Checks if the player's total combat rating meets the challenge threshold.

    Args:
        stats: Current effective stats.
        threshold: The difficulty rating to overcome.

    Returns:
        True if the rating meets/exceeds the threshold.
    """
    rating = get_combat_rating(stats)
    return rating >= threshold

def update_domination(state: UniverseState, success: bool) -> None:
    """Updates domination percentage and handles the death/restart logic.

    Args:
        state: The current UniverseState object.
        success: Whether the previous encounter was successful.
    """
    if success:
        increment = 15.0
        state.domination_percent = min(100.0, state.domination_percent + increment)
        state.domination_count += 1
        state.total_worlds_conquered += 1
        state.max_percent_reached = max(state.max_percent_reached, state.domination_percent)
    else:
        decrement = 20.0
        state.domination_percent -= decrement
        if state.domination_percent <= 0:
            trigger_restart(state)

def trigger_restart(state: UniverseState) -> None:
    """Resets the race state upon death while preserving history.

    Args:
        state: The current UniverseState object to reset.
    """
    # Restart percent = (max_percent / 3) rounded down
    restart_percent = float(int(state.max_percent_reached / 3.0))
    state.domination_percent = max(5.0, restart_percent) # Floor of 5%
    state.domination_count = 0

    # Reset genetic levels to 1, but keep the inventory structure
    for chromosome in state.inventory.values():
        chromosome.level = 1
