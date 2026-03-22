import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resolvePythonPath, loadSkillRegistryManifest, discoverLegacyCommands, deps } from '../../../../src/node/core/runtime/adapters/legacy_commands.ts';

describe('legacy_commands', () => {
    beforeEach(() => {
        deps.fs = {
            existsSync: () => false,
            readFileSync: () => '',
            readdirSync: () => [],
        } as any;
        deps.getPythonPath = () => 'python-default';
    });

    describe('resolvePythonPath', () => {
        test('should return Windows venv path if it exists', () => {
            deps.fs.existsSync = (p: string) => p.includes('Scripts');
            const result = resolvePythonPath('/root');
            assert.ok(result.includes('.venv/Scripts/python.exe') || result.includes('.venv\\Scripts\\python.exe'));
        });

        test('should return Unix venv path if it exists and Windows does not', () => {
            deps.fs.existsSync = (p: string) => p.includes('bin/python') || p.includes('bin\\python');
            const result = resolvePythonPath('/root');
            assert.ok(result.includes('.venv/bin/python') || result.includes('.venv\\bin\\python'));
        });

        test('should return default python path if no venv exists', () => {
            const result = resolvePythonPath('/root');
            assert.strictEqual(result, 'python-default');
        });
    });

    describe('loadSkillRegistryManifest', () => {
        test('should return empty map if manifest does not exist', () => {
            deps.fs.existsSync = () => false;
            const result = loadSkillRegistryManifest('/root');
            assert.strictEqual(result.size, 0);
        });

        test('should return map of commands from manifest', () => {
            deps.fs.existsSync = () => true;
            deps.fs.readFileSync = () => JSON.stringify({
                skills: {
                    'TestCommand': { entrypoint_path: 'src/test.py' }
                }
            });
            const result = loadSkillRegistryManifest('/root');
            assert.strictEqual(result.get('testcommand'), '/root/src/test.py');
        });

        test('should handle malformed manifest', () => {
            deps.fs.existsSync = () => true;
            deps.fs.readFileSync = () => 'invalid json';
            const result = loadSkillRegistryManifest('/root');
            assert.strictEqual(result.size, 0);
        });
    });

    describe('discoverLegacyCommands', () => {
        test('should discover python scripts in various directories', () => {
            deps.fs.existsSync = (p: string) => p.includes('scripts');
            deps.fs.readdirSync = (p: string) => {
                if (p.includes('scripts')) {
                    return [{
                        isFile: () => true,
                        isDirectory: () => false,
                        name: 'my_script.py'
                    }] as any;
                }
                return [];
            };
            const result = discoverLegacyCommands('/root');
            assert.strictEqual(result.get('my_script'), '/root/scripts/my_script.py');
        });

        test('should discover scripts in subdirectories with scripts/ folder', () => {
            const existingPaths = new Set([
                '/root/src/tools',
                '/root/src/tools/my_tool/scripts/my_tool.py'
            ]);
            deps.fs.existsSync = (p: string) => existingPaths.has(p.replace(/\\/g, '/'));
            deps.fs.readdirSync = (p: string) => {
                if (p.replace(/\\/g, '/').includes('src/tools')) {
                    return [{
                        isFile: () => false,
                        isDirectory: () => true,
                        name: 'my_tool'
                    }] as any;
                }
                return [];
            };
            const result = discoverLegacyCommands('/root');
            assert.strictEqual(result.get('my_tool'), '/root/src/tools/my_tool/scripts/my_tool.py');
        });

        test('should discover workflows', () => {
             deps.fs.existsSync = (p: string) => p.includes('workflows');
             deps.fs.readdirSync = (p: string) => {
                 if (p.includes('workflows')) {
                     return ['my_flow.md', 'ignored.txt'] as any;
                 }
                 return [];
             };
             const result = discoverLegacyCommands('/root');
             assert.strictEqual(result.get('my_flow'), '/root/.agents/workflows/my_flow.md');
        });
    });
});
