import os
import sys
import shutil
import json

def install_skill(skill_name):
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config_path = os.path.join(base_path, "config.json")
    
    if not os.path.exists(config_path):
        print(f"Error: .agent/config.json not found.")
        return

    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    framework_root = config.get("FrameworkRoot")
    if not framework_root:
        print("Error: FrameworkRoot not defined in config.json")
        return

    source = os.path.join(framework_root, "skills_db", skill_name)
    dest = os.path.join(base_path, "skills", skill_name)

    if not os.path.exists(source):
        print(f"Error: Skill '{skill_name}' not found in global registry ({source}).")
        return

    if os.path.exists(dest):
        print(f"Skill '{skill_name}' is already installed.")
        return

    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copytree(source, dest)
    print(f"Successfully installed skill: {skill_name}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        install_skill(sys.argv[1])
    else:
        print("Usage: python install_skill.py [skill_name]")
