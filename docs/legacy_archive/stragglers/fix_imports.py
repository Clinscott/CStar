import os
import re
import sys

def fix_imports(dir_path):
    # Pattern to match import/export paths
    # Matches:
    # 1. import { ... } from './path'
    # 2. export { ... } from './path'
    # 3. import './path'
    # 4. import('./path')
    # 5. export * from './path'
    #
    # We want to capture everything before the quote, the quote itself, the path, and the closing quote.
    
    # This pattern matches:
    # Group 1: (import|export)(possibly more things like type or { ... } from) and the following spaces
    # Group 2: The opening quote
    # Group 3: The path itself (starts with ./ or ../)
    # Group 4: The closing quote
    pattern = r"((?:import|export)(?:[\s\w{}*]*?from)?\s+|import\s*\()(['\"])(\.?\.\/.*?)(\2)"

    for root, dirs, files in os.walk(dir_path):
        for file in files:
            if file.endswith(('.ts', '.tsx', '.js', '.mjs')):
                file_path = os.path.join(root, file)
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                def replace_path(match):
                    prefix = match.group(1)
                    quote = match.group(2)
                    path = match.group(3)
                    
                    # Clean up multiple spaces in prefix if it was added by my previous run
                    # Only if it contains 'from '
                    if 'from ' in prefix:
                        prefix = re.sub(r'\s{2,}$', ' ', prefix)
                    
                    # Handle path extensions
                    new_path = path
                    if path.endswith(('.ts', '.tsx')):
                        new_path = path.rsplit('.', 1)[0] + '.js'
                    elif not any(path.endswith(ext) for ext in ['.js', '.mjs', '.json', '.css']):
                        # Missing extension
                        clean_path = path.split('?')[0].split('#')[0]
                        full_path_base = os.path.join(root, clean_path)
                        
                        if os.path.isdir(full_path_base):
                            new_path = path.rstrip('/') + '/index.js'
                        else:
                            new_path = path + '.js'
                    
                    return f"{prefix}{quote}{new_path}{quote}"

                new_content = re.sub(pattern, replace_path, content)
                
                if new_content != content:
                    print(f"Updating {file_path}")
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fix_imports.py <directory>")
        sys.exit(1)
    for dir_arg in sys.argv[1:]:
        fix_imports(dir_arg)
