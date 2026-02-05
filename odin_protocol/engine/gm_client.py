import json
import logging
import os
from typing import Any

try:
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

from .scenarios import SovereignScenarioEngine


class OdinGM:
    """Lightweight Game Master client using the Sovereign Agent Engine.

    This client coordinates between the LLM-powered Game Master (Gemini)
    and the rule-based local engine.
    """

    def __init__(self, api_key: str | None = None, model_name: str = "gemini-1.5-flash"):
        """Initializes the GM client.

        Args:
            api_key: Optional Google AI API Key.
            model_name: The Gemini model to use for narrative generation.
        """
        self.model_name = model_name
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        self.model = None
        self.agent_engine = SovereignScenarioEngine()

        if HAS_GENAI and self.api_key:
            try:
                genai.configure(api_key=self.api_key)
                self.model = genai.GenerativeModel(model_name)
            except Exception as e:
                logging.error(f"Gemini Init Failed: {e}. Falling back to offline mode.")
        else:
            logging.info("OdinGM: Running in Sovereign Agent Mode (Offline).")

    def generate_scenario(self, stats: dict[str, float], seed: str, turn_id: int, current_planet: str | None = None) -> dict[str, Any]:
        """Generates a brutal Kingdom Death scenario using the best available engine.

        Args:
            stats: Effective player stats.
            seed: The Federated Seed for uniqueness.
            turn_id: Current turn/conquest index.
            current_planet: Name of the current target world.

        Returns:
            Dictionary containing scenario details.
        """
        if not self.model:
            return self.agent_engine.generate(stats, seed=seed, turn_id=turn_id)

        strongest = max(stats, key=stats.get) if stats else "None"
        combat_rating = sum(stats.values())

        # Include the seed in the prompt to encourage 'Seeded Uniqueness' in the LLM output
        prompt = f"""
        ROLE: You are the Game Master of 'The Odin Protocol', a brutal Kingdom Death-inspired RPG.
        UNIVERSE SEED: {seed}
        CONQUEST INDEX: {turn_id}

        CONTEXT:
        Highest Trait: {strongest}
        Combat Rating: {combat_rating}
        Target Planet: {current_planet or "Unknown Frontiers"}

        TASK:
        Generate a high-stakes planetary hazard. Avoid mundane issues. Think cosmic horror, radiation death-zones, or siege of frozen hells.
        The seed should influence the 'vibe' or 'type' of hazard found in this sector.

        OUTPUT FORMAT (JSON ONLY):
        {{
          "planet_name": "Name",
          "environmental_hazard": "A brutal description of the lethal threat",
          "evolutionary_pressure": "Why {strongest} is becoming a liability here",
          "immediate_question": "A life-or-death choice for the Warlord",
          "dominance_gain": 3.5,  # Percentage gain on success (range 1.0 - 5.0)
          "failure_penalty": 10.0, # Percentage loss on failure (range 5.0 - 15.0)
          "potential_item": {{
             "id": "BOOTS_OF_ICE",
             "name": "Frost-Treader Soles",
             "category": "Gear",
             "buffs": {{"HEL_COLD": 1.0}}
          }}, # OPTIONAL: Only include if the environment warrants a discovery
          "options": [
              {{"id": "A", "text": "Brutal aggressive approach", "threshold": {combat_rating + 4.0}, "difficulty": "Hard"}},
              {{"id": "B", "text": "Calculating defensive approach", "threshold": {combat_rating + 1.0}, "difficulty": "Normal"}}
          ]
        }}
        """

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(response_mime_type="application/json")
            )
            data = json.loads(response.text)
            return data
        except Exception as e:
            logging.error(f"GM Error: {e}. Falling back to offline generator.")
            return self.agent_engine.generate(stats, seed=seed, turn_id=turn_id)

    def describe_outcome(self, scenario: dict[str, Any], player_name: str, choice_id: str, success: bool) -> str:
        """Narrates the result of a choice as a cautious or over-excited Bard.

        Args:
            scenario: The active scenario data.
            player_name: Name of the Warlord.
            choice_id: The option ID selected (A, B, C, D).
            success: Whether the check passed.

        Returns:
            The narrated outcome string.
        """
        if not self.model:
            return self.agent_engine.get_outcome(player_name, choice_id, success)

        prompt = f"""
        ROLE: You are 'The Bard of the Void', a traveling singer-historian for the Great Warlord {player_name}.
        CONTEXT:
        Planet: {scenario['planet_name']}
        Action Taken: {choice_id}
        Mathematic Success: {success}

        TASK:
        Narrate the outcome of this action.
        - IF SUCCESS: Be absolutely hyperbolic. Make it sound like {player_name} is a god who moved the stars themselves.
        - IF FAILURE: Sugarcoat it. Frame it as a 'strategic repositioning' or a 'test of fate'. Use flowery language to avoid the Warlord's wrath.

        Keep it to 2-3 atmospheric sentences.
        """
        try:
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception:
            return f"The songs shall speak of this day, Warlord {player_name}."

    def scientist_query(self) -> dict[str, str]:
        """Generates a query from a staff scientist to trigger mutation.

        Returns:
            Dictionary with speaker and message.
        """
        if not self.model:
            return self.agent_engine.get_scientist_query()

        prompt = "Generate a 1-sentence query from a starship scientist or mechanic asking if Odin wants to modify his genes after a conquest. Be thematic."
        try:
            response = self.model.generate_content(prompt)
            return {"speaker": "GENETICIST", "message": response.text.strip()}
        except Exception:
            return {"speaker": "ENGINEER", "message": "Mutation readiness at 100%. Proceed?"}

