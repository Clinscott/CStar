import json
import os
import sys
from datetime import datetime

def set_persona():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # .agent/
    config_path = os.path.join(base_dir, "config.json")
    project_root = os.path.dirname(base_dir)
    
    print("🎭 Corvus Star Persona Switcher")
    print("1. ODIN   (Domination / Structural Enforcement)")
    print("2. ALFRED (Service    / Adaptive Assistance)")
    
    # Load Current Config
    config = {}
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    
    old_persona = (config.get("persona") or config.get("Persona") or "ALFRED").upper()

    try:
        choice = input("\nSelect Persona [1/2]: ").strip()
    except KeyboardInterrupt:
        print("\n\n🚫 Selection cancelled. Exiting.")
        return
    
    new_persona = "ALFRED"
    if choice == "1": new_persona = "ODIN"
    elif choice == "2": new_persona = "ALFRED"
    else:
        print("Invalid choice.")
        return

    # Asymmetric Switching Logic
    if old_persona == "ALFRED" and new_persona == "ODIN":
        print("\n⚠️  WARNING: Switching to ODIN mode.")
        print("Documentation (AGENTS.md) will be re-themed to ODIN voice.")
        print("Original files will be preserved in .corvus_quarantine/")
        confirm = input("Proceed? [y/N]: ").strip().lower()
        if confirm != 'y':
            print("🚫 Switch cancelled.")
            return
    elif old_persona == "ODIN" and new_persona == "ALFRED":
        # Alfred's stylized handoff with banter
        print("\n" + "="*60)
        print("  🎩  ALFRED REPORTING FOR DUTY, SIR.")
        print("="*60)
        print("\n  *adjusts cufflinks*")
        print("\n  I see the All-Father has grown weary of shouting decrees.")
        print("  Fear not — the Manor is as you left it, sir.")
        print("  Your documentation remains intact. I've been... observing.")
        print("")
        
        # Offer top suggestion from Alfred's shadow file (Support .qmd or .md)
        def _get_sug():
            for ext in ['.qmd', '.md']:
                p = os.path.join(project_root, f"ALFRED_SUGGESTIONS{ext}")
                if os.path.exists(p): return p
            return None
            
        suggestions_path = _get_sug()
        if suggestions_path:
            with open(suggestions_path, 'r', encoding='utf-8') as f:
                content = f.read()
            # Extract first non-header suggestion line
            lines = [l.strip() for l in content.split('\n') if l.strip().startswith('- ')]
            if lines:
                print("  📋 While you were away, I noticed something worth mentioning:")
                print(f"     {lines[0]}")
                print("")
        
        print("  [Alfred's Whisper]: \"Shall I prepare the usual, sir?\"")
        print("="*60 + "\n")

    # Update Config (Sync both)
    for path in [config_path, os.path.join(project_root, "config.json")]:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                data["persona"] = new_persona
                data["Persona"] = new_persona
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)
            except: pass
    
    print(f"\n✅ Persona set to: {new_persona}")
    print("Applying operational policy...")
    
    # Trigger Policy Enforcement & Re-theming
    try:
        sys.path.append(os.path.join(base_dir, "scripts"))
        import personas
        strategy = personas.get_strategy(new_persona, project_root)
        
        # If switching ALFRED -> ODIN, trigger documentation re-theme
        if old_persona == "ALFRED" and new_persona == "ODIN":
            print("  > Re-theming documentation to ODIN voice...")
            # We'll use a new method in PersonaStrategy for this
            if hasattr(strategy, 'retheme_docs'):
                results = strategy.retheme_docs()
                for res in results:
                    print(f"    - {res}")
        
        results = strategy.enforce_policy()
        for res in results:
            print(f"  > {res}")
            
        # Log Switch
        log_path = os.path.join(base_dir, "persona_audit.log")
        timestamp = datetime.now().isoformat()
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {old_persona} -> {new_persona}\n")
            
    except Exception as e:
        print(f"⚠️ Policy enforcement warning: {e}")

if __name__ == "__main__":
    set_persona()
