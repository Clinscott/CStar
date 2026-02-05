import hashlib
import random
from typing import Any


class SovereignScenarioEngine:
    """A rule-based generator that uses the Agent's logic to create Kingdom Death scenarios.

    This engine ensures that planetary encounters are deterministic based on the
    Federated Seed of the unique Corvus instance.
    """

    ENV_PAIRS = [
        {"name": "Gravity", "factor": "Physical_Hardness", "pairs": ["AESIR_MIGHT", "BERSERKER_RAGE"]},
        {"name": "Atmosphere", "factor": "Terrain_Complexity", "pairs": ["VALKYRIE_LUNGE", "SKADI_GLIDE"]},
        {"name": "Information_Density", "factor": "Visual_Clarity", "pairs": ["HUGINN_SIGHT", "MUNINN_MEM"]},
        {"name": "Sensor_Resolution", "factor": "Ambient_Noise", "pairs": ["LOKI_SHADOW", "FAFNIR_SILENCE"]},
        {"name": "Radiation", "factor": "Impact_Force", "pairs": ["TYR_BARRIER", "YMIR_STONE"]},
        {"name": "Temperature", "factor": "Energy_Stability", "pairs": ["SURTR_FLAME", "HEL_COLD"]},
        {"name": "Bio_Hazard", "factor": "Nutrient_Richness", "pairs": ["IDUNN_BLOOM", "NIDHOGG_DECAY"]},
        {"name": "Ether_Density", "factor": "Reality_Stability", "pairs": ["FREYJA_WEAVE", "GINNUNGAGAP_VOID"]},
        {"name": "Vibration", "factor": "Electromagnetic_Storm", "pairs": ["HEIMDALL_WATCH", "JORMUNGANDR_COIL"]},
        {"name": "Chaos_Level", "factor": "Social_Cohesion", "pairs": ["BALDR_LIGHT", "BRAGI_SONG"]},
        {"name": "Entropy", "factor": "Volatile_Atmosphere", "pairs": ["FENRIR_JAW", "SURTR_ASH"]},
        {"name": "Ancient_Power", "factor": "Knowledge_Scarcity", "pairs": ["MIMIR_WELL", "ODIN_EYE"]}
    ]

    PLANET_PREFIXES = ["Grave of", "Echo of", "Siege of", "Void of", "Iron", "Frozen", "Burning", "Shattered"]
    PLANET_SUFFIXES = ["Solitude", "Niflheim", "Muspelheim", "Hel", "Yggdrasil", "Fensalir", "Vanaheim", "Asgard"]

    ADJECTIVES = ["crushing", "lethal", "unstable", "ancient", "volatile", "frozen", "scorched", "haunted"]
    NOUNS = ["marrow", "circuitry", "willpower", "structure", "foundation", "legacy", "biomass", "essence"]

    def generate(self, stats: dict[str, float], seed: str = "C*DEFAULT", turn_id: int = 0) -> dict[str, Any]:
        """Generates a scenario based on stats and a deterministic seed.

        Args:
            stats: Effective player stats.
            seed: The Federated Seed from the UniverseState.
            turn_id: The turn number or conquest count to ensure variety.

        Returns:
            A dictionary containing the scenario data.
        """
        # Create a deterministic random instance
        seed_hash = hashlib.sha256(f"{seed}_{turn_id}".encode()).hexdigest()
        local_rng = random.Random(seed_hash)

        pair_data = local_rng.choice(self.ENV_PAIRS)
        env = pair_data["name"]
        factor = pair_data["factor"]
        target_chromo = local_rng.choice(pair_data["pairs"])

        prefix = local_rng.choice(self.PLANET_PREFIXES)
        suffix = local_rng.choice(self.PLANET_SUFFIXES)
        planet_name = f"{prefix} {suffix}"

        adj = local_rng.choice(self.ADJECTIVES)
        noun = local_rng.choice(self.NOUNS)

        combat_rating = sum(stats.values())

        preludes = [
            f"The scanners scream as we break the atmosphere of {planet_name}. Below, a {adj} {env} field stretches across the horizon like a bruised sky.",
            f"Ancient records spoke of {planet_name}, but they failed to mention the {adj} {env} that now chokes its orbit.",
            f"We have arrived at the {planet_name}. The {env} here is not just a hazard; it is a predator, seeking a way into our {noun}."
        ]

        options = [
            {"id": "A", "text": f"Brute Force {noun} (Might/Fury)", "threshold": combat_rating + 5.0, "difficulty": "Hard"},
            {"id": "B", "text": f"Analyze {env} patterns (Intellect)", "threshold": combat_rating + 1.0, "difficulty": "Normal"},
            {"id": "C", "text": f"Evasive {noun} Maneuvers (Agility)", "threshold": combat_rating + 0.5, "difficulty": "Easy"},
            {"id": "D", "text": f"Sacrifice {noun} segments (Risky)", "threshold": combat_rating - 2.0, "difficulty": "Gamble"}
        ]

        hints = [
            f"Master, the {env} seems particularly sensitive to {target_chromo} fluctuations.",
            f"Sir, research suggests that {factor} can be bypassed with a high enough Combat Rating.",
            f"Observations indicate the {noun} is under significant strain, Warlord."
        ]

        return {
            "planet_name": planet_name,
            "prelude": local_rng.choice(preludes),
            "environmental_hazard": f"A {adj} {env} field is {local_rng.choice(['disrupting', 'exploiting', 'neutralizing'])} your {noun}.",
            "evolutionary_pressure": f"High {factor} detects weakness in {target_chromo}.",
            "immediate_question": f"How shall we bypass this {adj} obstruction, Warlord?",
            "dominance_gain": round(local_rng.uniform(1.5, 4.0), 1),
            "failure_penalty": round(local_rng.uniform(5.0, 12.0), 1),
            "potential_item": self._generate_item(target_chromo, local_rng),
            "alfred_hint": local_rng.choice(hints),
            "options": options
        }

    def _generate_item(self, chromo_id: str, local_rng: random.Random) -> dict[str, Any] | None:
        """Determines if an item drop occurs and generates its data."""
        if local_rng.random() > 0.4:
            return None

        return {
            "id": f"ITEM_{chromo_id}",
            "name": f"Ancient {chromo_id.replace('_', ' ').title()} Catalyst",
            "category": "Augment",
            "buffs": {chromo_id: 1.0},
            "durability": 100
        }

    def get_outcome(self, player_name: str, choice_id: str, success: bool) -> str:
        """Generates a thematic outcome for a player's choice.

        Note: Outcomes remain slightly random to preserve 'Bardic License'.
        """
        if success:
            if choice_id == "A": # Might
                verses = [
                    f"Warlord {player_name}, you crushed the obstruction like brittle bone. The Bard sings of your absolute fury.",
                    f"The ground trembles still, {player_name}. Your might has left a scar on this world's history."
                ]
            elif choice_id == "B": # Intellect
                verses = [
                    f"Calculating and cold, {player_name}. You unraveled the hazard's logic before it could grasp you.",
                    "The Bard notes your surgical precision. Information is the sharpest blade, and you wield it well."
                ]
            elif choice_id == "C": # Agility
                verses = [
                    f"A phantom in the storm, {player_name}. You danced through the lethal field while it grasped at nothing.",
                    "Evasion is a form of godhood. The Bard's lyre hums with the rhythm of your untraceable movements."
                ]
            else: # Gamble/Sacrifice
                verses = [
                    f"A heavy price paid, {player_name}, but the way is open. The Bard mourns the sacrifice but celebrates the result.",
                    "You have bartered with fate itself. The void accepted your offering and let you pass."
                ]
            return random.choice(verses)
        else:
            verses = [
                f"A temporary tactical repositioning, {player_name}. The Bard frames this as a 'test of endurance'.",
                f"The lyre strings snap in mourning, {player_name}. We shall speak of this instead as a 'strategic realignment'.",
                "Forgive the dissonance, Warlord. Fate simply demands a more grueling verse today."
            ]
            return random.choice(verses)

    def get_scientist_query(self) -> dict[str, str]:
        """Provides a greeting from the ship's staff."""
        queries = [
            {"speaker": "Chief Vahl", "message": "Biomass saturation at 100%. Shall we weave the new strands, Warlord?"},
            {"speaker": "Mechanic Korg", "message": "The scrap from that world is pure gold. Ready to augment the race?"},
            {"speaker": "Void-Speaker", "message": "The silence of the conquered planet is... useful. Do we modify the sequence?"}
        ]
        return random.choice(queries)
