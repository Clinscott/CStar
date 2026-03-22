import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { extractTargetSymbol, injectTargetSymbol, buildSkeletonContext, deps } from '../../../src/node/core/runtime/ast_slicer.ts';

describe('ast_slicer', () => {
    let mockSourceFile: any;
    let mockProject: any;

    beforeEach(() => {
        mockSourceFile = {
            getFunction: () => null,
            getClass: () => null,
            getVariableDeclaration: () => null,
            getFunctions: () => [],
            getClasses: () => [],
            saveSync: () => {},
            getText: () => 'mock content',
            replaceWithText: () => {},
        };

        mockProject = {
            addSourceFileAtPath: () => mockSourceFile,
        };

        deps.fs = {
            existsSync: () => true,
        } as any;

        deps.path = {
            resolve: (...args: string[]) => args.join('/'),
        } as any;

        deps.Project = class {
            addSourceFileAtPath() {
                return mockSourceFile;
            }
        } as any;
    });

    test('extractTargetSymbol should return function text if found', () => {
        mockSourceFile.getFunction = (name: string) => {
            if (name === 'myFunc') {
                return { getText: () => 'function myFunc() {}' };
            }
            return null;
        };

        const result = extractTargetSymbol('/root', 'file.ts', 'myFunc');
        assert.strictEqual(result, 'function myFunc() {}');
    });

    test('extractTargetSymbol should return null if not found', () => {
        const result = extractTargetSymbol('/root', 'file.ts', 'nonExistent');
        assert.strictEqual(result, null);
    });

    test('injectTargetSymbol should return true if replaced', () => {
        let replaced = false;
        mockSourceFile.getFunction = (name: string) => {
            if (name === 'myFunc') {
                return {
                    replaceWithText: (text: string) => {
                        replaced = true;
                    }
                };
            }
            return null;
        };

        const result = injectTargetSymbol('/root', 'file.ts', 'myFunc', 'new content');
        assert.strictEqual(result, true);
        assert.strictEqual(replaced, true);
    });

    test('buildSkeletonContext should strip function bodies', () => {
        const mockFunc = {
            getName: () => 'otherFunc',
            getBody: () => ({
                replaceWithText: (text: string) => {
                    assert.strictEqual(text, '{ /* ...omitted... */ }');
                }
            })
        };
        mockSourceFile.getFunctions = () => [mockFunc];
        mockSourceFile.getText = () => 'skeleton content';

        const result = buildSkeletonContext('/root', 'file.ts');
        assert.strictEqual(result, 'skeleton content');
    });
});
