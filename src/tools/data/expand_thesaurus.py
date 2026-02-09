import re
import os

path = 'thesaurus.md'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Extract all clusters
clusters = re.findall(r'- \*\*(.*?)\*\*: (.*?)$', content, re.MULTILINE)

inverted = {} # {word: set of synonyms}

for headword, syns_str in clusters:
    # Split by comma and clean
    words = [w.strip() for w in syns_str.split(',')]
    words.append(headword.strip())
    
    # Each word in the cluster should map to every other word
    for w in words:
        w = w.lower()
        if w not in inverted: inverted[w] = set()
        for other in words:
            other = other.lower()
            if w != other:
                inverted[w].add(other)

# Build new content
new_lines = [
    "# Corvus Star Thesaurus (Hyper-Expanded Version)",
    "",
    "## 🌊 Expanded Intent Clusters",
    ""
]

for w in sorted(inverted.keys()):
    syns = sorted(list(inverted[w]))
    new_lines.append(f"- **{w}**: {', '.join(syns)}")

with open(path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))

print(f"Expanded thesaurus from {len(clusters)} heads to {len(inverted)} atomic keys.")
