
import sys
import os
from pathlib import Path
import textwrap

# Ensure src is importable
root = Path(__file__).parent.parent.absolute()
sys.path.insert(0, str(root))

try:
    from src.sentinel.sovereign_fish import ValkyrieStrategist, TorvaldsStrategist
    
    print(f"Running Resilience Test on Root: {root}")
    
    # 1. Create a "poisoned" file (invalid syntax) to test robustness
    poison_path = root / "src" / "poison.py"
    # poison_path.write_text("def broken_syntax(:\n    pass", encoding="utf-8")
    
    # 2. Create a "dead" file (valid syntax, unused)
    dead_path = root / "src" / "dead_real.py"
    dead_path.write_text("def unused_real_function():\n    return 'I am dead'", encoding="utf-8")
    
    try:
        # VALKYRIE CHECK
        print("\n[Valkyrie] Scanning...")
        valkyrie = ValkyrieStrategist(root)
        v_targets = valkyrie.scan()
        print(f"[Valkyrie] Found {len(v_targets)} targets.")
        
        found_dead = False
        found_poison = False
        
        for t in v_targets:
            # print(f"  - {t['file']}: {t['action']}")
            if "dead_real.py" in t['file']:
                found_dead = True
                print("  [SUCCESS] Found injected dead code.")
            if "poison.py" in t['file']:
                found_poison = True
                print("  [INFO] Found poisoned file (unexpected if Vulture skips invalid syntax).")

        if not found_dead:
            print("  [FAIL] Did not find injected dead code.")
            
        # TORVALDS CHECK
        print("\n[Torvalds] Scanning...")
        # Create complex file
        complex_path = root / "src" / "complex_real.py"
        complex_code = "def complex_fn(x):\n" + "\n".join([f"    if x=={i}: pass" for i in range(20)])
        complex_path.write_text(complex_code, encoding="utf-8")
        
        torvalds = TorvaldsStrategist(root)
        t_targets = torvalds.scan()
        print(f"[Torvalds] Found {len(t_targets)} targets.")
        
        found_complex = False
        for t in t_targets:
            if "complex_real.py" in t['file']:
                found_complex = True
                print("  [SUCCESS] Found injected complex code.")
        
        if not found_complex:
             print("  [FAIL] Did not find injected complex code.")

    finally:
        # Cleanup
        # if poison_path.exists(): os.remove(poison_path)
        if dead_path.exists(): os.remove(dead_path)
        if (root / "src" / "complex_real.py").exists(): os.remove(root / "src" / "complex_real.py")
        pass

except Exception:
    import traceback
    traceback.print_exc()
