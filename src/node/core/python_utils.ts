import path from 'node:path';
import fs from 'node:fs';
import { registry } from '../../tools/pennyone/pathRegistry.js';

/**
 * [GUNGNIR] Python Utility
 * Purpose: Ensure the correct Python executable (.venv or system) is used.
 */
export function getPythonPath(): string {
    const root = registry.getRoot();
    
    // 1. Try .venv/Scripts/python.exe (Windows)
    const winVenv = path.join(root, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(winVenv)) return winVenv;

    // 2. Try .venv/bin/python (Linux/macOS)
    const unixVenv = path.join(root, '.venv', 'bin', 'python');
    if (fs.existsSync(unixVenv)) return unixVenv;

    // 3. Fallback to the host default interpreter
    return process.platform === 'win32' ? 'python' : 'python3';
}

