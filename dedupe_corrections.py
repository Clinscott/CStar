import re
import json

path = '.agent/corrections.json'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find all mapping entries
# Matches "key": "value", or "key": "value"
pattern = r'\"(.*?)\":\s*\"(.*?)\"'
all_matches = re.findall(pattern, content)

# The first match is usually "phrase_mappings", the rest are the actual mappings
# We want to skip the high level keys like phrase_mappings and synonym_updates if they match the pattern
skip_keys = ["phrase_mappings", "synonym_updates"]

deduped = {}
for k, v in all_matches:
    if k not in skip_keys:
        deduped[k] = v

new_content = {
    "phrase_mappings": deduped,
    "synonym_updates": {}
}

with open(path, 'w', encoding='utf-8') as f:
    json.dump(new_content, f, indent=4, ensure_ascii=False)

print(f"Deduplicated {len(all_matches)} entries into {len(deduped)} unique mappings.")
