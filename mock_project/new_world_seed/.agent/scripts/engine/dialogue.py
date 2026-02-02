import random
import os
import sys

class DialogueRetriever:
    def __init__(self, dialogue_path):
        self.intents = {} # {intent_name: [phrases]}
        self._load(dialogue_path)

    def _load(self, path):
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
            if "ODIN" in str(os.environ.get("PERSONA", "")).upper() or "GOD" in str(os.environ.get("PERSONA", "")).upper():
                print(f"⚠️ [ODIN] CRITICAL: FAILED TO LOAD DIALOGUE VECTOR: {path}")
            pass

    def get(self, intent):
        opts = self.intents.get(intent, [])
        return random.choice(opts) if opts else None
