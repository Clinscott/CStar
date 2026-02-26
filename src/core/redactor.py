"""
┌────────────────────────────────────────── Ω REDACTOR ENGINE Ω ──────────────────────────────────────────┐
│ THE SHIELD OF PRIVACY: Automatically masks sensitive runes in logs and displays.                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
"""
import re

from src.tools.vault import SovereignVault


class Redactor:
    """[ALFRED] A diligent filter to ensure no secrets are accidentally exposed."""

    _instance = None
    _patterns = []

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Loads secrets from the Vault and prepares regex patterns."""
        try:
            vault = SovereignVault()
            secrets = vault.get_secrets_map()

            # Create a list of (key_name, sensitive_value)
            # Sort by length descending to prevent partial matches
            sorted_secrets = sorted(secrets.items(), key=lambda x: len(x[1]), reverse=True)

            self._patterns = []
            for key, val in sorted_secrets:
                # Escape for regex and create a pattern
                pattern = re.compile(re.escape(val))
                self._patterns.append((key, pattern))
        except Exception:
            self._patterns = []

    def redact(self, text: str) -> str:
        """Applies all redaction patterns to the provided text."""
        if not text:
            return text

        redacted_text = text
        for key, pattern in self._patterns:
            # Replace with a themed placeholder
            placeholder = f"[REDACTED_{key}]"
            redacted_text = pattern.sub(placeholder, redacted_text)

        return redacted_text

def redact_text(text: str) -> str:
    """Shorthand helper to access the Redactor singleton."""
    return Redactor().redact(text)

if __name__ == "__main__":
    # Test Logic
    sample = "My key is AIzaSyD-fake-key and my brave key is 12345-brave."
    # For testing, we'd need to mock the vault or have a real .env.local
    print(f"Original: {sample}")
    print(f"Redacted: {redact_text(sample)}")
