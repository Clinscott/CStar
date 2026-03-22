
import os

mappings = [
    ("src.sentinel.muninn_crucible", "src.core.engine.ravens.muninn_crucible"),
    ("src.sentinel.muninn_memory", "src.core.engine.ravens.muninn_memory"),
    ("src.sentinel.muninn_promotion", "src.core.engine.ravens.muninn_promotion"),
    ("src.sentinel.muninn_hunter", "src.core.engine.ravens.muninn_hunter"),
    ("src.sentinel.muninn_heart", "src.core.engine.ravens.muninn_heart"),
    ("src.sentinel.muninn", "src.core.engine.ravens.muninn"),
    ("src.sentinel.wardens", "src.core.engine.wardens"),
    ("src.sentinel._bootstrap", "src.core.bootstrap"),
    ("src.sentinel.coordinator", "src.core.engine.ravens.coordinator"),
    ("src.sentinel.code_sanitizer", "src.core.engine.ravens.code_sanitizer"),
    ("src.sentinel.git_spoke", "src.core.engine.ravens.git_spoke"),
    ("src.sentinel.repo_spoke", "src.core.engine.ravens.repo_spoke"),
    ("src.sentinel.stability", "src.core.engine.ravens.stability"),
    ("src.sentinel.sandbox_warden", "src.core.engine.ravens.sandbox_warden"),
    ("src.sentinel.score_cohesion", "src.core.engine.ravens.score_cohesion"),
    ("src.sentinel.recreate_chapter", "src.core.engine.ravens.recreate_chapter"),
    ("src.sentinel.ravens_cycle", "src.core.engine.ravens.ravens_cycle"),
    ("src.sentinel.ravens_runtime", "src.core.engine.ravens.ravens_runtime"),
    ("src.sentinel.harvest_responses", "src.core.engine.ravens.harvest_responses"),
    ("src.sentinel.taliesin_forge", "docs.legacy_archive.src_sentinel.taliesin_forge"),
    ("src.sentinel.taliesin", "docs.legacy_archive.src_sentinel.taliesin"),
    ("src.sentinel.x_api", "docs.legacy_archive.src_sentinel.x_api"),
]

# Generate slash versions
slash_mappings = []
for old, new in mappings:
    slash_mappings.append((old.replace(".", "/"), new.replace(".", "/")))

all_mappings = mappings + slash_mappings
# Sort by length descending
all_mappings.sort(key=lambda x: len(x[0]), reverse=True)

with open("files_to_update.txt", "r") as f:
    files_to_update = [line.strip() for line in f if line.strip()]

for file_path in files_to_update:
    if not os.path.exists(file_path):
        continue
    if os.path.isdir(file_path):
        continue
    
    # Skip the scripts themselves
    if file_path.endswith("update_imports.py") or file_path.endswith("files_to_update.txt"):
        continue

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Could not read {file_path}: {e}")
        continue
    
    new_content = content
    for old, new in all_mappings:
        new_content = new_content.replace(old, new)
    
    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated: {file_path}")
