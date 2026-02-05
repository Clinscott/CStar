import time
from dataclasses import dataclass, field


@dataclass
class Chromosome:
    """The 'DNA' of the Odin Protocol. Represents a specific genetic trait."""
    id: str                  # Unique Key (e.g., "AESIR_MIGHT")
    name: str                # Display Name (e.g., "Odin's Grip")
    level: int = 1           # Incremental Progress

    # The 4 Cardinal Traits (Flavor Text & Logic Tags)
    benefits: dict[str, str] = field(default_factory=lambda: {
        "major": "Unknown Benefit",
        "minor": "Dormant Potential"
    })
    defects: dict[str, str] = field(default_factory=lambda: {
        "vulnerability": "Unknown Flaw",
        "cost": "Biological Burden"
    })

    # The Graph Connections (The Ripple Effect)
    # These contain the IDs of OTHER chromosomes
    synergies: list[str] = field(default_factory=list)      # Buffs these
    interferences: list[str] = field(default_factory=list)  # Nerfs these

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "level": self.level,
            "benefits": self.benefits,
            "defects": self.defects,
            "synergies": self.synergies,
            "interferences": self.interferences
        }

@dataclass
class Item:
    """Equipment or resources used by the warlord's race."""
    id: str
    name: str
    category: str           # e.g., "Armor", "Engine", "Weapon"
    buffs: dict[str, float] # Chromosome ID -> Modifier (e.g., {"AESIR_MIGHT": 0.5})
    durability: int = 100   # Percentage (decreases on failure)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "buffs": self.buffs,
            "durability": self.durability
        }

@dataclass
class UniverseState:
    """The global state of the 'Federated Warlords' universe."""
    seed: str                           # Federated Seed (from Git Hash)
    player_name: str = "Odin"           # Warlord Name
    domination_percent: float = 10.0    # Current progress (0-100)
    max_percent_reached: float = 10.0   # Highest percent ever
    total_worlds_conquered: int = 0     # Total count across all runs
    domination_count: int = 0           # Count in current run

    # Planet Progress (Kingdom Death Siege)
    current_planet_name: str | None = None
    current_planet_progress: float = 0.0

    # Alfred's Protocols
    last_briefing_turn: int = -5        # Cooldown management

    inventory: dict[str, Chromosome] = field(default_factory=dict)
    items: list[Item] = field(default_factory=list)
    conquests: list[dict] = field(default_factory=list) # History of worlds
    last_updated: float = field(default_factory=time.time)

    def to_dict(self):
        return {
            "seed": self.seed,
            "player_name": self.player_name,
            "domination_percent": self.domination_percent,
            "max_percent_reached": self.max_percent_reached,
            "total_worlds_conquered": self.total_worlds_conquered,
            "domination_count": self.domination_count,
            "current_planet_name": self.current_planet_name,
            "current_planet_progress": self.current_planet_progress,
            "last_briefing_turn": self.last_briefing_turn,
            "inventory": {k: v.to_dict() for k, v in self.inventory.items()},
            "items": [i.to_dict() for i in self.items],
            "conquests": self.conquests,
            "last_updated": self.last_updated
        }
