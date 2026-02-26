"""
[MODELS] Odin Protocol Data Structures
Lore: "The blueprints of existence and the code of the ravens."
Purpose: Defines the 'DNA' (Chromosome), Items, and Universe State for the game.
"""

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Chromosome:
    """
    The 'DNA' of the Odin Protocol. Represents a specific genetic trait.
    """
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
    synergies: list[str] = field(default_factory=list)      # Buffs these
    interferences: list[str] = field(default_factory=list)  # Nerfs these

    def to_dict(self) -> dict[str, Any]:
        """Converts the chromosome to a dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "level": self.level,
            "benefits": self.benefits,
            "defects": self.defects,
            "synergies": self.synergies,
            "interferences": self.interferences
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> 'Chromosome':
        """Restores a chromosome from a dictionary."""
        return cls(**data)


@dataclass
class Item:
    """
    Equipment or resources used by the warlord's race.
    """
    id: str
    name: str
    category: str           # e.g., "Armor", "Engine", "Weapon"
    buffs: dict[str, float] # Chromosome ID -> Modifier (e.g., {"AESIR_MIGHT": 0.5})
    durability: int = 100   # Percentage (decreases on failure)

    def to_dict(self) -> dict[str, Any]:
        """Converts the item to a dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "buffs": self.buffs,
            "durability": self.durability
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> 'Item':
        """Restores an item from a dictionary."""
        return cls(**data)


@dataclass
class UniverseState:
    """
    The global state of the 'Federated Warlords' universe.
    """
    seed: str                           # Federated Seed (from Git Hash)
    player_name: str = "Odin"           # Warlord Name
    domination_percent: float = 10.0    # Current progress (0-100)
    max_percent_reached: float = 10.0   # Highest percent ever
    total_worlds_conquered: int = 0     # Total count across all runs
    planets_dominated: int = 0          # New metric for total conquest
    mutation_charges: int = 0           # Capacity based on conquest
    total_turns_played: int = 0         # Monotonically increasing counter

    # Resources
    force: float = 100.0                # Tactical resource

    # Planet Progress
    current_planet_name: str | None = None
    current_planet_progress: float = 0.0

    # Nodal Tracking
    nodal_progress: dict[str, float] = field(default_factory=lambda: {
        "HIVE": 0.0, "SIEGE": 0.0, "RESOURCE": 0.0, "DROP": 0.0
    })

    # Ticker State
    ticker_velocity: float = 0.0
    momentum_turns: int = 0
    active_node: str | None = None

    # Alfred's Protocols
    last_briefing_turn: int = -5        # Cooldown management
    active_persona: str = "ALFRED"      # Track the chosen guide
    active_campaigns: dict[str, dict[str, Any]] = field(default_factory=dict)

    inventory: dict[str, Chromosome] = field(default_factory=dict)
    items: list[Item] = field(default_factory=list)
    conquests: list[dict[str, Any]] = field(default_factory=list)
    last_updated: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        """Converts the universe state to a dictionary."""
        return {
            "seed": self.seed,
            "player_name": self.player_name,
            "domination_percent": self.domination_percent,
            "max_percent_reached": self.max_percent_reached,
            "total_worlds_conquered": self.total_worlds_conquered,
            "planets_dominated": self.planets_dominated,
            "mutation_charges": self.mutation_charges,
            "total_turns_played": self.total_turns_played,
            "force": self.force,
            "current_planet_name": self.current_planet_name,
            "current_planet_progress": self.current_planet_progress,
            "nodal_progress": self.nodal_progress,
            "ticker_velocity": self.ticker_velocity,
            "momentum_turns": self.momentum_turns,
            "last_briefing_turn": self.last_briefing_turn,
            "active_persona": self.active_persona,
            "active_campaigns": self.active_campaigns,
            "active_node": self.active_node,
            "inventory": {k: v.to_dict() for k, v in self.inventory.items()},
            "items": [i.to_dict() for i in self.items],
            "conquests": self.conquests,
            "last_updated": self.last_updated
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> 'UniverseState':
        """Restores the universe state from a dictionary."""
        # Deep restore nested objects
        inventory_data = data.pop("inventory", {})
        inventory = {k: Chromosome.from_dict(v) for k, v in inventory_data.items()}

        items_data = data.pop("items", [])
        items = [Item.from_dict(i) for i in items_data]

        return cls(inventory=inventory, items=items, **data)
