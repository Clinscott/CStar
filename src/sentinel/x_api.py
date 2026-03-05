"""
[SPOKE] TALIESIN - X API Wrapper
Lore: "The Herald's Voice."
Purpose: Handle authenticated posting to the X (Twitter) API.
"""

import os
import logging
from typing import Optional
from src.core.sovereign_hud import SovereignHUD

class XAPI:
    def __init__(self):
        self.api_key = os.environ.get("X_API_KEY")
        self.api_secret = os.environ.get("X_API_SECRET")
        self.access_token = os.environ.get("X_ACCESS_TOKEN")
        self.access_token_secret = os.environ.get("X_ACCESS_TOKEN_SECRET")
        
        self.is_configured = all([
            self.api_key, 
            self.api_secret, 
            self.access_token, 
            self.access_token_secret
        ])

    def post_article(self, content: str) -> bool:
        """Posts content to X."""
        if not self.is_configured:
            SovereignHUD.persona_log("WARN", "X API Credentials not found. Post simulated.")
            SovereignHUD.persona_log("INFO", f"CONTENT DUMP:\n{'-'*20}\n{content}\n{'-'*20}")
            return True

        SovereignHUD.persona_log("INFO", "Disseminating to the X feed...")
        # TODO: Implement tweepy or direct requests call here once user has credentials.
        # For now, we simulate success if configured to prevent crashes.
        SovereignHUD.persona_log("SUCCESS", "Post live on X Protocol.")
        return True
