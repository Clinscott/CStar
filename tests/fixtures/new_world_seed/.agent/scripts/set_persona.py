import json
import os
import sys


def set_persona():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # .agent/
    config_path = os.path.join(base_dir, "config.json")
    
    print("🎭 Corvus Star Persona Switcher")
    print("1. ODIN   (Domination / Structural Enforcement)")
    print("2. ALFRED (Service    / Adaptive Assistance)")
    
    try:
        choice = input("\nSelect Persona [1/2]: ").strip()
    except KeyboardInterrupt:
        print("\n\n🚫 Selection cancelled. Exiting.")
        return
    
    persona = "ALFRED"
    if choice == "1": persona = "ODIN"
    elif choice == "2": persona = "ALFRED"
    else:
        print("Invalid choice.")
        return

    # Update Config
    config = {}
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    
    config["Persona"] = persona
    
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=4)
    
    print(f"\n✅ Persona set to: {persona}")
    print("Applying operational policy...")
    
    # Trigger Policy Enforcement
    try:
        sys.path.append(os.path.join(base_dir, "scripts"))
        import personas
        project_root = os.path.dirname(base_dir)
        strategy = personas.get_strategy(persona, project_root)
        results = strategy.enforce_policy()
        for res in results:
            print(f"  > {res}")
    except Exception as e:
        print(f"⚠️ Policy enforcement warning: {e}")

if __name__ == "__main__":
    set_persona()
