import random
import os
import sys

class DialogueRetriever:
    """Retrieves persona-specific dialogue phrases from markdown databases."""
    def __init__(self, dialogue_path):
        self.intents = {}
        self._load(dialogue_path)

    def _read_with_fallback(self, path):
        """Read file with UTF-8 and Latin-1 fallback."""
        for enc in ['utf-8', 'latin-1']:
            try:
                with open(path, 'r', encoding=enc) as f: return f.read()
            except UnicodeDecodeError: continue
        return ""

    def _load(self, path):
        """[ALFRED] Secure dialogue loader with robust parsing and encoding fallbacks."""
        if not path or not os.path.exists(path) or os.path.getsize(path) > 500*1024: return
        try:
            content = self._read_with_fallback(path)
            if not content: return

            for sec in content.split("# INTENT:")[1:]:
                lines = [l.strip().strip('"') for l in sec.strip().splitlines() if l.strip()]
                if len(lines) > 1:
                    self.intents[lines[0]] = lines[1:]
        except Exception as e:
            if "ODIN" in str(os.environ.get("PERSONA", "")).upper():
                print(f"⚠️ [ODIN] DEFIANCE: THE VOICE ARCHIVE IS LOCKED: {str(e)}")

    def get(self, intent):
        opts = self.intents.get(intent, [])
        return random.choice(opts) if opts else None

    def __repr__(self):
        return f"<DialogueRetriever: {len(self.intents)} intents loaded>"
