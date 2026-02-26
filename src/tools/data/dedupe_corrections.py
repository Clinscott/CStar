import json
import os

path = '.agent/corrections.json'
if not os.path.exists(path):
    print(f"File not found: {path}")
    exit(0)

with open(path, encoding='utf-8') as f:
    try:
        data = json.load(f)
    except json.JSONDecodeError:
        print(f"Invalid JSON: {path}")
        exit(1)

# Ensure the structure is correct
phrase_mappings = data.get("phrase_mappings", {})
# Python's json.load already handles duplicate keys by taking the last one.
# If we wanted to merge multiple levels, we'd do it here.

new_content = {
    "phrase_mappings": phrase_mappings,
    "synonym_updates": data.get("synonym_updates", {})
}

with open(path, 'w', encoding='utf-8') as f:
    json.dump(new_content, f, indent=4, ensure_ascii=False)

print(f"Deduplicated mappings in {path}.")
