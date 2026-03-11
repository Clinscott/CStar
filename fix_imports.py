import os
import re

def fix_imports():
    directory = 'src/tools/pennyone'
    pattern = re.compile(r'(import\s+.*?from\s+[\'"]\.[^\'"]*)\.js([\'"])')
    
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.ts') or file.endswith('.tsx'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content = pattern.sub(r'\1.ts\2', content)
                
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Fixed {filepath}")

if __name__ == '__main__':
    fix_imports()
