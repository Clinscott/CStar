"""
[ENGINE] Game Master Client
Lore: "The link between the ravens and the All-Father."
Purpose: Coordinates between the LLM-powered GM (Gemini) and rule-based local engine.
"""

import json
import logging
import os
from typing import Any

try:
    from google import genai
    from google.genai import types
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

from src.games.odin_protocol.engine.scenarios import SovereignScenarioEngine


class OdinGM:
    """
    Lightweight Game Master client using the Sovereign Agent Engine.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model_name: str = "gemini-2.0-flash"
    ) -> None:
        """
        Initializes the GM client.

        Args:
            api_key: Optional Google AI API Key.
            model_name: The Gemini model to use for narrative generation.
        """
        self.model_name = model_name
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        self.client: genai.Client | None = None
        self.agent_engine = SovereignScenarioEngine()

        if HAS_GENAI and self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logging.error(f"Gemini Init Failed: {e}. Falling back to offline mode.")
        else:
            logging.info("OdinGM: Running in Sovereign Agent Mode (Offline).")

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
        Generates a brutal Kingdom Death scenario using the best available engine.

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
        if not self.client:
            return self.agent_engine.generate_scenario(
                stats,
                seed=seed,
                turn_id=turn_id,
                player_name=player_name,
                campaign_data=campaign_data,
                node_type=node_type
            )

        strongest = max(stats, key=stats.get) if stats else "None"
        combat_rating = sum(stats.values())

        planet = (
            campaign_data.get("planet_name", "Unknown") if campaign_data else "Unknown"
        )
        obj = (
            campaign_data.get("current_objective", "Recon") if campaign_data else "Recon"
        )
        cast = campaign_data.get("personas", "None") if campaign_data else "None"

        prompt = f"""
        ROLE: You are the Game Master of 'The Odin Protocol',
        a brutal Kingdom Death-inspired RPG.
        UNIVERSE SEED: {seed}
        CONQUEST INDEX: {turn_id}
        WARLORD NAME: {player_name}

        CONTEXT:
        Highest Trait: {strongest}
        Combat Rating: {combat_rating}
        Target Planet: {planet}
        Active Campaign: {obj}
        Cast: {cast}

        TASK:
        Generate a high-stakes planetary SCENE using the Scene/Sequel literary structure.
        The scene must have a clear 'goal' and a tangible 'conflict'.
        The 'options' (A, B, C, H) MUST be highly thematic and directly
        related to resolving the goal or navigating the conflict.

        OUTPUT FORMAT (JSON ONLY):
        {{
          "planet_name": "Evocative Name",
          "lore": "A description of why it's a target.",
          "goal": "A specific literary goal",
          "conflict": "A specific literary conflict",
          "disaster": "A potential failure disaster",
          "environmental_hazard": "A brutal description",
          "fauna": "Apex Predators/Docile Grazers/etc",
          "flora": "Glow-Forests/Adaptive Fungi/etc",
          "sediment": "Explosive Crust/Solid Obsidian/etc",
          "civ_type": "Ascended Neural Nets/Industrial Bastions/etc",
          "immediate_question": "How shall we achieve our goal?",
          "dominance_gain": 3.5,
          "failure_penalty": 10.0,
          "potential_item": {{
             "id": "ITEMID",
             "name": "Name",
             "category": "Gear/Augment",
             "buffs": {{"TRAIT_ID": 1.0}}
          }},
          "options": [
              {{"id": "A", "text": "Hard", "threshold": {combat_rating + 5.0}, "difficulty": "Hard"}},
              {{"id": "B", "text": "Normal", "threshold": {combat_rating + 1.0}, "difficulty": "Normal"}},
              {{"id": "C", "text": "Gamble", "threshold": {combat_rating + 10.0}, "difficulty": "Gamble"}},
              {{"id": "H", "text": "Easy", "threshold": {combat_rating - 2.0}, "difficulty": "Easy"}}
          ]
        }}
        """

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            data = json.loads(response.text)
            return data
        except Exception as e:
            logging.error(f"GM Error: {e}. Falling back to offline generator.")
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
        if not self.client:
            return self.agent_engine.get_outcome(player_name, choice_id, success)

        prompt = f"""
        ROLE: You are 'The Bard of the Void' for Warlord {player_name}.
        CONTEXT:
        Planet: {scenario['planet_name']}
        Action: {choice_id}
        Success: {success}

        TASK:
        Narrate the outcome. Hyperbolic for success, sugarcoated for failure.
        2-3 atmospheric sentences.
        """
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            return response.text.strip()
        except Exception:
            return f"The songs shall speak of this day, Warlord {player_name}."

    def scientist_query(self) -> dict[str, str]:
        """Generates a query to trigger mutation."""
        if not self.client:
            return self.agent_engine.get_scientist_query()

        prompt = "Starship scientist asking if Odin wants to modify genes."
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            return {"speaker": "GENETICIST", "message": response.text.strip()}
        except Exception:
            return {"speaker": "ENGINEER", "message": "Mutation readiness at 100%. Proceed?"}

