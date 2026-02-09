import json
import os
import re


def tokenize(text):
    if not text: return []
    return re.findall(r'\w+', text.lower())

base_path = ".agent"
config_path = os.path.join(base_path, "config.json")
with open(config_path, 'r', encoding='utf-8') as f:
    config = json.load(f)

root = config.get("FrameworkRoot")
g_path = os.path.join(root, "skills_db")

print(f"FrameworkRoot: {root}")
print(f"Skills DB Path: {g_path}")
print(f"Exists: {os.path.exists(g_path)}")

if os.path.exists(g_path):
    for folder in os.listdir(g_path):
        f_path = os.path.join(g_path, folder)
        is_dir = os.path.isdir(f_path)
        print(f"  Folder: {folder}, is_dir: {is_dir}")
        if is_dir:
            s_md = os.path.join(f_path, "SKILL.md")
            exists_md = os.path.exists(s_md)
            print(f"    SKILL.md exists: {exists_md}")
            if exists_md:
                with open(s_md, 'r', encoding='utf-8') as f:
                    content = f.read()
                print(f"    Content length: {len(content)}")
                print(f"    Tokens: {tokenize(content)}")
