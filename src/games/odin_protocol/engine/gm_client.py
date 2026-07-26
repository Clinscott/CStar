"""
[ENGINE] Game Master Client
Lore: "The link between the ravens and the All-Father."
Purpose: Exposes the deterministic local scenario engine to the game runtime.
"""

from typing import Any

from src.games.odin_protocol.engine.scenarios import SovereignScenarioEngine


class OdinGM:
    """
    Lightweight deterministic Game Master using the Sovereign Scenario Engine.
    """

    def __init__(self) -> None:
        """Initialize the local scenario engine."""
        self.agent_engine = SovereignScenarioEngine()

    def generate_scenario(
        self,
        stats: dict[str, float],
        seed: str,
        turn_id: int,
        player_name: str = "Odin",
        campaign_data: dict[str, Any] | None = None,
        node_type: str | None = None
    ) -> dict[str, Any]:
        """
        Generate a brutal Kingdom Death scenario with the local engine.

        Args:
            stats: Effective player stats.
            seed: The Federated Seed for uniqueness.
            turn_id: Current turn/conquest index.
            player_name: The name of the Warlord.
            campaign_data: Persistent story data.
            node_type: Optional nodal campaign type.

        Returns:
            Dictionary containing scenario details.
        """
        return self.agent_engine.generate_scenario(
            stats,
            seed=seed,
            turn_id=turn_id,
            player_name=player_name,
            campaign_data=campaign_data,
            node_type=node_type
        )

    def describe_outcome(self, scenario: dict[str, Any], player_name: str, choice_id: str, success: bool) -> str:
        """Narrates the result of a choice."""
        return self.agent_engine.get_outcome(player_name, choice_id, success)

    def scientist_query(self) -> dict[str, str]:
        """Generates a query to trigger mutation."""
        return self.agent_engine.get_scientist_query()
