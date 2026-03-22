
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

# Sort mappings by length of the source string, descending, to match specific ones first
mappings.sort(key=lambda x: len(x[0]), reverse=True)

files_to_update = [
    "src/core/cstar_dispatcher.py",
    "src/core/engine/ravens/harvest_responses.py",
    "src/core/engine/ravens/muninn_crucible.py",
    "src/core/engine/ravens/muninn_hunter.py",
    "src/core/engine/ravens/muninn_promotion.py",
    "src/core/engine/ravens/ravens_cycle.py",
    "src/core/engine/ravens/ravens_runtime.py",
    "src/core/engine/ravens/repo_spoke.py",
    "src/core/engine/wardens/edda.py",
    "src/core/engine/wardens/freya.py",
    "src/core/engine/wardens/ghost_warden.py",
    "src/core/engine/wardens/huginn.py",
    "src/core/engine/wardens/mimir.py",
    "src/core/engine/wardens/norn.py",
    "src/core/engine/wardens/runecaster.py",
    "src/core/engine/wardens/scour.py",
    "src/core/engine/wardens/security.py",
    "src/core/engine/wardens/shadow_forge.py",
    "src/core/engine/wardens/taste.py",
    "src/core/engine/wardens/valkyrie.py",
    "src/core/kernel_bridge.py",
    "src/core/sv_engine.py",
    "src/games/odin_protocol/engine/adjudicator.py",
    "src/games/odin_protocol/engine/logic.py",
    "src/skills/local/CacheBro/cache_bro.py",
    "src/skills/local/KnowledgeHunter/hunter.py",
    "src/skills/local/SkillLearning/learn.py",
    "src/skills/local/VisualExplainer/visual_explainer.py",
    "src/skills/local/WildHunt/wild_hunt.py",
    "src/tools/acquire.py",
    "src/tools/brave_search.py",
    "src/tools/debug/verify_fish.py",
    "src/tools/loop.py",
    "test_cohesion_loop.py",
    "tests/augmented_intel/test_injection_neutralization.py",
    "tests/contracts/test_code_sanitizer.py",
    "tests/contracts/test_muninn.py",
    "tests/contracts/test_strategists_bonus.py",
    "tests/crucible/test_gungnir_calculus_edges.py",
    "tests/crucible/test_muninn_crucible.py",
    "tests/harness/manual_learn.py",
    "tests/harness/ragnarok_muninn.js",
    "tests/harness/stress_test.py",
    "tests/harness/verify_hud.py",
    "tests/harness/verify_loop_logic.py",
]

for file_path in files_to_update:
    if not os.path.exists(file_path):
        print(f"Skipping non-existent file: {file_path}")
        continue
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content
    for old, new in mappings:
        new_content = new_content.replace(old, new)
    
    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated: {file_path}")
    else:
        print(f"No changes needed: {file_path}")
