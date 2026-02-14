import yaml
import sys
from pathlib import Path

def validate_persona_phrases(file_path):
    path = Path(file_path)
    if not path.exists():
        print(f"[ERROR] Phrase bank not found at {file_path}")
        return False

    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
    except Exception as e:
        print(f"[ERROR] Failed to parse YAML: {e}")
        return False

    required_keywords = {
        "ODIN": ["shatters", "hel"],
        "ALFRED": ["setback", "backups"]
    }

    errors = []

    for persona, intents in data.items():
        if persona not in required_keywords:
            continue
        
        # Check TASK_FAILED for specific keywords needed for context-routing
        failed_phrases = intents.get("TASK_FAILED", [])
        combined_text_failed = " ".join([p.get('phrase', '').lower() for p in failed_phrases])
        
        # Check ERROR_RECOVERY for Alfred
        recovery_phrases = intents.get("ERROR_RECOVERY", [])
        combined_text_recovery = " ".join([p.get('phrase', '').lower() for p in recovery_phrases])

        for word in required_keywords[persona]:
            if persona == "ODIN" and word not in combined_text_failed:
                errors.append(f"[CRITICAL] {persona} is missing '{word}' phrases in TASK_FAILED. Context-routing will fail.")
            if persona == "ALFRED" and word not in combined_text_recovery:
                errors.append(f"[CRITICAL] {persona} is missing '{word}' phrases in ERROR_RECOVERY. Context-routing will fail.")

        # Check for tag consistency
        for intent, phrases in intents.items():
            for i, p in enumerate(phrases):
                if 'tags' not in p or not p['tags']:
                    errors.append(f"[WARNING] {persona} {intent} index {i} is missing tags.")

    if errors:
        for err in errors:
            print(err)
        return False
    
    print("✅ Phrase bank validated for state-aware routing.")
    return True

if __name__ == "__main__":
    target = "src/data/dialogue/phrases.yaml"
    if len(sys.argv) > 1:
        target = sys.argv[1]
    if not validate_persona_phrases(target):
        sys.exit(1)
