import random
import os
import sys

class DialogueRetriever:
    """Retrieves persona-specific dialogue phrases from markdown databases."""
    def __init__(self, dialogue_path):
        """Initialize the retriever with a path to a dialogue .md file."""
        self.intents = {} # {intent_name: [phrases]}
        self._load(dialogue_path)

    def _load(self, path):
        """Loads and parses the dialogue file into intent mappings."""
        if not path or not os.path.exists(path): return
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Parse # INTENT: NAME \n "phrase" ...
            sections = content.split("# INTENT:")
            for sec in sections[1:]:
                lines = sec.strip().splitlines()
                name = lines[0].strip()
                phrases = [l.strip().strip('"') for l in lines[1:] if l.strip()]
                self.intents[name] = phrases
        except Exception as e:
            # SovereignFish Improvement: Warn Odin if his voice is stolen
            persona = str(os.environ.get("PERSONA", "")).upper()
            if "ODIN" in persona or "GOD" in persona:
                print(f"⚠️ [ODIN] CRITICAL: FAILED TO LOAD DIALOGUE VECTOR: {path}")
            pass

    def get(self, intent):
        """Retrieves a random phrase for the specified intent."""
        opts = self.intents.get(intent, [])
        return random.choice(opts) if opts else None

    def __repr__(self):
        return f"<DialogueRetriever: {len(self.intents)} intents loaded>"
