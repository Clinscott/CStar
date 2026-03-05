"""
[SPOKE] TALIESIN - X API Wrapper (Simulation Mode)
Lore: "The Herald's Voice."
Purpose: Handle authenticated posting to the X (Twitter) API.
Status: SIMULATION — Live X integration requires tweepy or direct OAuth.
"""

import os
from src.core.sovereign_hud import SovereignHUD


class XAPI:
    """X (Twitter) API interface with lazy credential loading.

    Credentials are resolved at post-time, not construction time,
    allowing environment changes to be picked up without re-init.
    """

    SIMULATION_MODE = True  # Flip to False once tweepy is integrated

    def _load_credentials(self) -> bool:
        """Lazily resolve X API credentials from environment."""
        self.api_key = os.environ.get("X_API_KEY")
        self.api_secret = os.environ.get("X_API_SECRET")
        self.access_token = os.environ.get("X_ACCESS_TOKEN")
        self.access_token_secret = os.environ.get("X_ACCESS_TOKEN_SECRET")

        return all([
            self.api_key,
            self.api_secret,
            self.access_token,
            self.access_token_secret,
        ])

    def post_article(self, content: str) -> bool:
        """Posts content to X. Currently operates in SIMULATION mode."""
        is_configured = self._load_credentials()

        if not is_configured:
            SovereignHUD.persona_log("WARN", "X API Credentials not found. Post simulated.")
            SovereignHUD.persona_log("INFO", f"CONTENT DUMP:\n{'-'*20}\n{content}\n{'-'*20}")
            return True

        if self.SIMULATION_MODE:
            SovereignHUD.persona_log("INFO", "[SIMULATION] X API configured but live posting disabled.")
            SovereignHUD.persona_log("INFO", f"CONTENT DUMP:\n{'-'*20}\n{content}\n{'-'*20}")
            return True

        # FUTURE: tweepy or OAuth 2.0 direct POST to /2/tweets
        SovereignHUD.persona_log("INFO", "Disseminating to the X feed...")
        SovereignHUD.persona_log("SUCCESS", "Post live on X Protocol.")
        return True
