import sys
import json
from pathlib import Path

# Bootstrap project root
PROJECT_ROOT = Path(__file__).parent.parent.absolute()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Import Wardens
from src.sentinel.muninn import ValkyrieWarden, MimirWarden, EddaWarden, RuneCasterWarden, FreyaWarden, HuginnWarden
from src.core.annex import HeimdallWarden
from src.core.ui import HUD

def scout():
    root = PROJECT_ROOT
    HUD.box_top("SENTINEL SCOUT: BREACH DETECTION")
    HUD.box_row("ROOT", str(root))
    HUD.box_separator()
    
    results = {
        "ANNEX": [],
        "VALKYRIE": [],
        "MIMIR": [],
        "EDDA": [],
        "RUNE": [],
        "BEAUTY": [],
        "HUGINN": []
    }
    
    # 1. Annex (Structural/Test Breaches)
    try:
        annex = HeimdallWarden(root)
        annex.scan()
        results["ANNEX"] = annex.breaches
    except Exception as e:
        HUD.log("FAIL", "Annex Scan", str(e))

    # 2. Valkyrie (Dead Code)
    try:
        valkyrie = ValkyrieWarden(root)
        results["VALKYRIE"] = valkyrie.scan()
    except Exception as e:
        HUD.log("FAIL", "Valkyrie Scan", str(e))

    # 3. Mimir (Complexity)
    try:
        mimir = MimirWarden(root)
        results["MIMIR"] = mimir.scan()
    except Exception as e:
        HUD.log("FAIL", "Mimir Scan", str(e))

    # 4. Edda (Docstrings)
    try:
        edda = EddaWarden(root)
        results["EDDA"] = edda.scan()
    except Exception as e:
        HUD.log("FAIL", "Edda Scan", str(e))

    # 5. RuneCaster (Type Safety)
    try:
        rune = RuneCasterWarden(root)
        results["RUNE"] = rune.scan()
    except Exception as e:
        HUD.log("FAIL", "Rune Scan", str(e))

    # 6. Freya (Beauty)
    try:
        freya = FreyaWarden(root)
        results["BEAUTY"] = freya.scan()
    except Exception as e:
        HUD.log("FAIL", "Freya Scan", str(e))

    # 7. Huginn (Neural)
    try:
        huginn = HuginnWarden(root)
        results["HUGINN"] = huginn.scan()
    except Exception as e:
        HUD.log("FAIL", "Huginn Scan", str(e))

    # Summary
    HUD.box_separator()
    for k, v in results.items():
        color = HUD.RED if v else HUD.GREEN
        HUD.box_row(k, len(v), color=color)
    
    total = sum(len(v) for v in results.values())
    HUD.box_separator()
    HUD.box_row("TOTAL BREACHES", total, color=(HUD.RED if total else HUD.GREEN))
    HUD.box_bottom()
        
    queue_path = root / "breaches_queue.json"
    queue_path.write_text(json.dumps(results, indent=2), encoding='utf-8')
    HUD.persona_log("SUCCESS", f"Queue synchronized to {queue_path.name}")

if __name__ == "__main__":
    scout()
