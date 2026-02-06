import hashlib
import math
import random
from typing import Any


class SovereignScenarioEngine:
    """A procedural generator that uses the Agent's logic to create Kingdom Death scenarios.

    This engine ensures that planetary encounters are deterministic based on the
    Federated Seed and implements the WorldForge (NMS-style) generation protocol.
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

    GOALS = [
        "The extraction of a primordial Bio-Seed from the world's marrow",
        "The clinical subjugation of an Ascended Hive-Mind screaming in the void",
        "The reclamation of a Lost Genetic Vault buried beneath shifting obsidian",
        "The containment of a volatile Bio-Hazard threatening to liquefy your race",
        "The systematic erosion of reality within a Primordial Abyss",
        "The forced inoculation of the World-Seed with your genetic signature"
    ]

    CONFLICTS = [
        "The atmosphere is a choking fog of electromagnetic discharge and static screams.",
        "Raging gravity storms are liquefying your structural supports in real-time.",
        "The local flora is a sentient, pulsating mesh actively resisting your neural probes.",
        "A temporal anomaly has fractured the timeline, causing tactical echoes and loops.",
        "Deep-crust tectonic volatility threatens to swallow your entire landing zone.",
        "Lethal radiation from the exposed world-core is melting your physical shielding."
    ]

    DISASTERS = [
        "The world-seed rejects your presence, triggering a planet-wide tectonic collapse.",
        "A temporal feedback loop erases your tactical gains and fractures your causality.",
        "The local civilizations launch a desperate, scorched-earth neural counter-strike.",
        "The environment itself inverts, turning your genetic strengths into lethal flaws."
    ]

    ENCOUNTER_PILLARS = ["HAZARD", "CONFRONTATION", "ELEMENTAL", "FAILURE", "REFLECTIVE"]

    PILLAR_DEFINITIONS = {
        "HAZARD": "Environmental survival. The world itself is trying to erase your presence.",
        "CONFRONTATION": "Direct tactical engagement with local forces or predators.",
        "ELEMENTAL": "Navigating the raw, chaotic physics of the planetary crust.",
        "FAILURE": "Technical or gear-related malfunctions requiring urgent triage.",
        "REFLECTIVE": "A quiet, philosophical moment in the ruinscape with a weary comrade."
    }

    PILLAR_PROMPTS = {
        "HAZARD": "The planet itself is striking back. Warlord, how do we survive the environmental onslaught?",
        "CONFRONTATION": "Tactical engagement is unavoidable. Warlord, how do we break the local resistance?",
        "ELEMENTAL": "The world's raw physics are unstable. Warlord, how do we navigate this atmospheric chaos?",
        "FAILURE": "Our systems are failing under the pressure. Warlord, how do we triage this technical collapse?",
        "REFLECTIVE": "A moment of stillness in the slaughter. Warlord, what is your insight on this conquest?"
    }

    PILLAR_OPTIONS = {
        "HAZARD": [
            {"text": "Reinforce Structural Hardening", "trait": "TYR_BARRIER", "id": "A", "base_difficulty": "Hard"},
            {"text": "Divert Power to Life-Support", "trait": "SURTR_FLAME", "id": "B", "base_difficulty": "Normal"},
            {"text": "Push Through the Volatility", "trait": "AESIR_MIGHT", "id": "C", "base_difficulty": "Gamble"},
            {"text": "Hunker in Cryo-Stasis", "trait": "FAFNIR_SILENCE", "id": "H", "base_difficulty": "Easy"}
        ],
        "CONFRONTATION": [
            {"text": "Launch Kinetic Strike", "trait": "BERSERKER_RAGE", "id": "A", "base_difficulty": "Hard"},
            {"text": "Flank through the Ruins", "trait": "VALKYRIE_LUNGE", "id": "B", "base_difficulty": "Normal"},
            {"text": "Invoke Dominatrix Synergy", "trait": "LOKI_SHADOW", "id": "C", "base_difficulty": "Gamble"},
            {"text": "Suppressing Fire & Extract", "trait": "HEIMDALL_WATCH", "id": "H", "base_difficulty": "Easy"}
        ],
        "ELEMENTAL": [
            {"text": "Anchor to the Deep-Crust", "trait": "YMIR_STONE", "id": "A", "base_difficulty": "Hard"},
            {"text": "Bypass via Aerial-Stream", "trait": "SKADI_GLIDE", "id": "B", "base_difficulty": "Normal"},
            {"text": "Acknowledge the Storm's Will", "trait": "FREYJA_WEAVE", "id": "C", "base_difficulty": "Gamble"},
            {"text": "Shielded Observation", "trait": "HUGINN_SIGHT", "id": "H", "base_difficulty": "Easy"}
        ],
        "FAILURE": [
            {"text": "Overclock Damaged Systems", "trait": "FENRIR_JAW", "id": "A", "base_difficulty": "Hard"},
            {"text": "Manual Triage & Repair", "trait": "MIMIR_WELL", "id": "B", "base_difficulty": "Normal"},
            {"text": "Purge Compromised Buffers", "trait": "GINNUNGAGAP_VOID", "id": "C", "base_difficulty": "Gamble"},
            {"text": "Standard Diagnostic Loop", "trait": "MUNINN_MEM", "id": "D", "base_difficulty": "Easy"}
        ],
        "REFLECTIVE": [
            {"text": "Discuss the Weight of Conquest", "trait": "BRAGI_SONG", "id": "A", "base_difficulty": "Normal"},
            {"text": "Share a Ration in Silence", "trait": "IDUNN_BLOOM", "id": "B", "base_difficulty": "Normal"},
            {"text": "Challenge the Void with Verse", "trait": "BALDR_LIGHT", "id": "C", "base_difficulty": "Gamble"},
            {"text": "Brief Rest in the Ruinscape", "trait": "ODIN_EYE", "id": "H", "base_difficulty": "Easy"}
        ]
    }

    PLANET_LORE = {
        "Muspelheim": "A primordial furnace world where the core is exposed, necessitates a kinetic siege to reclaim the lost Bio-Seeds from the shifting ash.",
        "Asgard": "The ancestral seat of the genetic elite, currently undergoing a temporal fracture that threatens to erase the Hugin/Munin memory banks.",
        "Niflheim": "A frozen hell of cryo-obsidian where the local hive-minds have retreated into the deep crust, resisting subjugation through absolute thermal silence.",
        "Hel": "A world of eternal decay where the bio-hazard levels have reached a critical state, threatening to liquefy any genome that lacks the Hela-Synergy.",
        "Solitude": "An isolated moon of crystalline silence. The planetary goal is obscured by electromagnetic isolation, requiring a surgical strike to extract data.",
        "Yggdrasil": "A lush, bio-synthetic forest world where the flora is sentient and connected. Every action here ripples through the global neural network.",
        "Fensalir": "A world of endless ocean-mist and bioluminescent reefs. The local civilizations thrive in the deep-pressure zones, guarding their genetic hoards.",
        "Vanaheim": "A chaotic, fast-evolving biosphere where the fauna undergoes rapid mutation every solar cycle, forcing constant tactical adaptation."
    }

    # Persona Engine Data
    RANKS = ["Sergeant", "Corporal", "Lieutenant", "Specialist", "Elder", "Civ-Lead"]
    NAMES = ["Varick", "Kael", "Thorne", "Vahl", "Zora", "Hera", "Mimir", "Surt"]
    TRAITS = ["Grim", "Loyal", "Calculated", "Fearful", "Resilient", "Defiant"]
    ROLES = ["Vanguard", "Bio-Tech", "Scout", "Civilian", "Resistance"]

    CAMPAIGN_OBJECTIVES = [
        "Establish Forward Hive-Base",
        "Subjugate Local Militia",
        "Secure Food & Provisions",
        "Breach Deep-Crust Vaults",
        "Inoculate World-Core",
        "Suppress Neural Resistance"
    ]

    RESOLUTION_FLAVOR = {
        0: { # Atmosphere fog
            "Hard": "force the sensor array through the static screams to pin a landing",
            "Normal": "filter the electromagnetic discharge via manual triangulation",
            "Gamble": "commune with the static screams to find a freak path through the fog",
            "Easy": "deploy localized dampeners to quiet the atmospheric roar"
        },
        1: { # Gravity storms
            "Hard": "overclock gravity anchors and plunge into the storm's eye",
            "Normal": "compensate for structural liquefaction with emergency shunting",
            "Gamble": "surf the gravity waves to slingshot past the lethal zone",
            "Easy": "calculate stable Lagrange points to drift through the turbulence"
        },
        2: { # Sentient flora
            "Hard": "crash through the pulsating mesh using brute-force kinetic overrides",
            "Normal": "manually prune the sentient vines blocking the entry conduits",
            "Gamble": "induce a localized necrosis to wither the flora's neural center",
            "Easy": "modify ship resonance to match the flora and sneak through undetected"
        },
        3: { # Temporal anomaly
            "Hard": "shatter the tactical echoes by venting raw, chaotic chronons",
            "Normal": "calibrate localized time-locks to stabilize the deck chronology",
            "Gamble": "exploit a tactical recursion to manifest multiple landing attempts",
            "Easy": "anchor the timeline to a fixed memory of the mission's goal"
        },
        4: { # Tectonic volatility
            "Hard": "burn the engines to white-heat and blast through the rising crust",
            "Normal": "re-route power to localized stabilizers to hold the landing zone",
            "Gamble": "detonate seismic charges to force the tectonic plates into a temporary lock",
            "Easy": "glide across the shifting plates using active terrain-mapping"
        },
        5: { # Core radiation
            "Hard": "reinforce physical shielding with depleted hulls and push through the heat",
            "Normal": "modulate the energy-grid to deflect the incoming radiation",
            "Gamble": "absorb the core radiation to supercharge the kinetic thrusters",
            "Easy": "deploy leaden-mesh clouds to mask the ship from the world-core"
        }
    }

    def generate_scenario(self, stats: dict[str, float], seed: str = "C*DEFAULT", turn_id: int = 0, player_name: str = "Odin", campaign_data: dict = None, node_type: str = None) -> dict[str, Any]:
        """The WorldForge Algorithm: Procedurally generates a Narrative Campaign Step."""
        world_id_str = f"{seed}_{turn_id}"
        seed_hash = hashlib.sha256(world_id_str.encode()).hexdigest()
        local_rng = random.Random(seed_hash)

        # 1. Campaign Context Retrieval
        planet_suffix = local_rng.choice(self.PLANET_SUFFIXES)
        planet_base_name = f"{local_rng.choice(self.PLANET_PREFIXES)} {planet_suffix}"

        # If we have campaign data, we use it for consistency
        if campaign_data and campaign_data.get('planet_name'):
            planet_name = campaign_data['planet_name']
        else:
            planet_name = f"SIEGE OF {planet_base_name.upper()}"

        campaign = self._get_or_create_campaign(planet_name, planet_suffix, local_rng, campaign_data)

        # 2. WorldForge Attributes (Persistent)
        attributes = campaign.get('attributes', {})
        fauna = attributes.get('fauna', 'Unknown')
        flora = attributes.get('flora', 'Unknown')
        sediment = attributes.get('sediment', 'Unknown')
        civ_type = attributes.get('civ_type', 'Unknown')

        # 3. Environment & Inversion
        pair_data = local_rng.choice(self.ENV_PAIRS)
        env_name = pair_data["name"]
        target_chromo = local_rng.choice(pair_data["pairs"])

        is_inverted = local_rng.random() > 0.8
        modifiers = []
        if is_inverted:
            modifiers.append({
                "type": "INVERSION",
                "target": target_chromo,
                "description": f"The {env_name} anomalous. {target_chromo} interferences act as Synergies."
            })

        # 4. Narrative Selection
        pillar = local_rng.choice(self.ENCOUNTER_PILLARS)
        goal = campaign['current_objective']
        conflict_raw = local_rng.choice(self.CONFLICTS)
        conflict = conflict_raw

        # RESOLUTION FLAVOR: Difficulty-aware atmospheric descriptions
        conflict_idx = self.CONFLICTS.index(conflict_raw)
        flavor_map = self.RESOLUTION_FLAVOR.get(conflict_idx, {})

        # Persona Injection
        persona = local_rng.choice(campaign['personas'])
        persona_str = f"{persona['rank']} {persona['name']} ({persona['trait']})"

        # Pillar Transformation
        if pillar == "HAZARD":
            conflict = f"the ship's structural supports are liquefying under {conflict.lower()}"
        elif pillar == "REFLECTIVE":
            conflict = f"{persona_str} whispers about {conflict.lower()} through the ruinscape silence"
        elif pillar == "FAILURE":
            conflict = f"critical gear failure manifests as {conflict.lower()}"
        elif pillar == "CONFRONTATION":
            conflict = f"{persona_str} reports the local forces are regrouping. {conflict}"

        # Combat Rating & Dynamic Difficulty (BRUTAL Check)
        combat_rating = sum(stats.values()) if stats else 25.0
        is_brutal = node_type is not None # Nodal campaigns are always harder

        # Choice Generation (Dynamic Difficulty Mapping)
        pillar_opts = self.PILLAR_OPTIONS[pillar]
        options = []
        for opt in pillar_opts:
            base_diff = opt['base_difficulty']
            trait = opt.get('trait', 'Unknown')

            # Action Description (sensory/atmospheric)
            action_flavor = flavor_map.get(base_diff, "navigate the planetary crisis")
            desc = f"{opt['text']} and {action_flavor}"

            # Threshold Calculation (Kingdom Death Scaling)
            threshold = combat_rating
            if base_diff == "Hard": threshold += 5.0
            elif base_diff == "Gamble": threshold += 10.0
            elif base_diff == "Normal": threshold += 1.0
            elif base_diff == "Easy": threshold -= 2.0

            # Brutal Modifier
            if is_brutal:
                threshold += 15.0 # The "Kingdom Death" Spike

            # Dynamic Display Label (Gene Seed Integration)
            eff_stat = stats.get(trait, 10.0)

            if eff_stat > threshold + 10: diff_label = "Trivial"
            elif eff_stat > threshold + 3: diff_label = "Easy"
            elif eff_stat < threshold - 15: diff_label = "Lethal" # Higher lethal cap in brutal
            elif eff_stat < threshold - 5: diff_label = "Hard"
            else: diff_label = "Normal"

            options.append({
                "id": opt['id'],
                "text": desc,
                "trait": trait,
                "threshold": round(threshold, 1),
                "difficulty": diff_label
            })

        # Calculate Genetic Affinity for Ticker (log scale)
        affinity = self._calculate_affinity(stats, attributes)

        # Immersive Question: Leading with the Nodal Crisis
        prompt = self.PILLAR_PROMPTS.get(pillar, "Warlord, how shall we proceed?")
        if node_type:
            prompt = f"NODE [{node_type}] BREACHED: {prompt}"

        return {
            "planet_name": planet_name,
            "lore": campaign['intro_text'],
            "pillar": pillar,
            "pillar_description": self.PILLAR_DEFINITIONS[pillar],
            "goal": goal,
            "conflict": conflict,
            "disaster": disaster,
            "fauna": fauna,
            "flora": flora,
            "sediment": sediment,
            "civ_type": civ_type,
            "world_modifiers": modifiers,
            "active_persona": persona,
            "campaign_state": campaign,
            "affinity_score": affinity,
            "environmental_hazard": f"A volatile {env_name} field is straining your structure.",
            "immediate_question": f"{conflict.capitalize()} {prompt}",
            "dominance_gain": round(local_rng.uniform(1.5, 6.0), 1),
            "failure_penalty": round(local_rng.uniform(5.0, 15.0), 1),
            "potential_item": self._generate_item(target_chromo, local_rng),
            "options": options
        }

    def _calculate_affinity(self, stats: dict[str, float], world_attrs: dict) -> float:
        """Calculates Warlord-to-Planet affinity (log-scaled background growth)."""
        if not stats: return 1.0

        # Simple mapping for Phase 9 demo:
        # Fauna -> MIGHT/RAGE, Flora -> BLOOM/SIGHT, Sediment -> STONE/BARRIER
        affinity = 0.0

        # Fauna Affinity
        if world_attrs.get('fauna') == "Apex Predators":
            affinity += stats.get("BERSERKER_RAGE", 10) * 0.1

        # Flora Affinity
        if world_attrs.get('flora') == "Glow-Forests":
            affinity += stats.get("HUGINN_SIGHT", 10) * 0.1

        # Sediment Affinity
        if world_attrs.get('sediment') == "Solid Obsidian":
            affinity += stats.get("YMIR_STONE", 10) * 0.1

        return round(math.log10(max(1.1, affinity)) * 0.5, 3)

    def _get_or_create_campaign(self, planet_name: str, suffix: str, rng: random.Random, existing: dict = None) -> dict:
        """Helper to maintain campaign state or initialize a fresh one."""
        if existing:
            # Migration/Persistence Fix: Ensure attributes exist
            if 'attributes' not in existing:
                def get_world_att(): return rng.random()
                f_v, fl_v, s_v, c_v = get_world_att(), get_world_att(), get_world_att(), get_world_att()

                # Bias based on suffix if available, otherwise use provided suffix
                sfx = existing.get('planet_suffix', suffix)
                if sfx == "Yggdrasil": fl_v = 0.9
                elif sfx == "Asgard": c_v = 0.9
                elif sfx == "Niflheim": s_v = 0.9
                elif sfx == "Muspelheim": s_v = 0.2

                fauna = "Apex Predators" if f_v > 0.7 else ("Docile Grazers" if f_v < 0.3 else "Nomadic Packs")
                flora = "Glow-Forests" if fl_v > 0.7 else ("Dead Scrub" if fl_v < 0.3 else "Adaptive Fungi")
                sediment = "Explosive Crust" if s_v > 0.7 else ("Solid Obsidian" if s_v < 0.3 else "Sifting Ash")
                civ_type = "Ascended Neural Nets" if c_v > 0.7 else ("Industrial Bastions" if c_v > 0.3 else "Primitive Hives")

                existing['attributes'] = {
                    "fauna": fauna, "flora": flora,
                    "sediment": sediment, "civ_type": civ_type
                }
            return existing

        # Generate Cast
        personas = []
        for _ in range(3):
            personas.append({
                "name": rng.choice(self.NAMES),
                "rank": rng.choice(self.RANKS),
                "trait": rng.choice(self.TRAITS),
                "role": rng.choice(self.ROLES),
                "status": "Healthy"
            })

        # WorldForge Attributes (Seeded once per planet)
        def get_world_att(): return rng.random()
        f_v, fl_v, s_v, c_v = get_world_att(), get_world_att(), get_world_att(), get_world_att()

        # Biasing based on suffix
        if suffix == "Yggdrasil": fl_v = 0.9  # Lush
        elif suffix == "Asgard": c_v = 0.9   # Ascended
        elif suffix == "Niflheim": s_v = 0.9 # Obsidian
        elif suffix == "Muspelheim": s_v = 0.2 # Ash

        fauna = "Apex Predators" if f_v > 0.7 else ("Docile Grazers" if f_v < 0.3 else "Nomadic Packs")
        flora = "Glow-Forests" if fl_v > 0.7 else ("Dead Scrub" if fl_v < 0.3 else "Adaptive Fungi")
        sediment = "Explosive Crust" if s_v > 0.7 else ("Solid Obsidian" if s_v < 0.3 else "Sifting Ash")
        civ_type = "Ascended Neural Nets" if c_v > 0.7 else ("Industrial Bastions" if c_v > 0.3 else "Primitive Hives")

        return {
            "planet_name": planet_name,
            "planet_suffix": suffix,
            "intro_text": self.PLANET_LORE.get(suffix, "A distant world on the edge of the void."),
            "current_objective": rng.choice(self.CAMPAIGN_OBJECTIVES),
            "personas": personas,
            "attributes": {
                "fauna": fauna,
                "flora": flora,
                "sediment": sediment,
                "civ_type": civ_type
            },
            "history": [],
            "state_vars": {"casualties": 0, "loyalty": 1.0}
        }

    def _generate_item(self, chromo_id: str, local_rng: random.Random) -> dict[str, Any] | None:
        if local_rng.random() > 0.6: return None
        return {
            "id": f"ITEM_{chromo_id}",
            "name": f"Ancient {chromo_id.replace('_', ' ').title()} Catalyst",
            "category": "Augment",
            "buffs": {chromo_id: 1.0},
            "durability": 100
        }

    def get_outcome(self, player_name: str, choice_id: str, success: bool) -> str:
        """Outcome is now just the raw mathematical directive. Bardic prose is Agent-generated."""
        res = "SUCCESS" if success else "FAILURE"
        return f"[DIRECTIVE]: {res} for choice {choice_id}. Awaiting Agentic Manifestation."

    def get_scientist_query(self) -> dict[str, str]:
        return {"speaker": "Chief Vahl", "message": "The void is yawning, sir."}
