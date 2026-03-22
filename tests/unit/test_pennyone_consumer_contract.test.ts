import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { materializeNeuralData } from  '../../src/tools/pennyone/vis/logic/useNeuralData.js';

describe('PennyOne consumer contract hardening (CS-P5-03)', () => {
    it('materializes nodes from the canonical projection envelope without graph-era assumptions', () => {
        const data = materializeNeuralData(
            {
                projection: {
                    authority: 'hall_projection',
                    artifact_role: 'runtime_view',
                    repo_root: '/repo',
                },
                files: [
                    {
                        path: '/repo/src/main.ts',
                        loc: 12,
                        complexity: 3,
                        matrix: { overall: 8.1 },
                        intent: 'Main entry point',
                        interaction_protocol: 'Dispatch via runtime',
                        dependencies: ['/repo/src/helper.ts'],
                    },
                    {
                        path: '/repo/src/helper.ts',
                        loc: 5,
                        complexity: 1,
                        matrix: { overall: 7.2 },
                        intent: 'Helper sector',
                    },
                ],
                summary: { total_files: 2, total_loc: 17, average_score: 7.65 },
            } as any,
            { '/repo/src/main.ts': 9 },
        );

        assert.equal(data.allNodes.length, 2);
        assert.equal(data.links.length, 1);
        assert.equal(data.allNodes[0]?.interactionProtocol, 'Dispatch via runtime');
        assert.equal(data.allNodes[0]?.gravity, 9);
        assert.equal(data.links[0]?.target, '/repo/src/helper.ts');
    });

    it('tolerates reduced compatibility fields and malformed dependency payloads', () => {
        const data = materializeNeuralData(
            {
                projection: {
                    authority: 'hall_projection',
                    artifact_role: 'runtime_view',
                    repo_root: '/repo',
                },
                files: [
                    {
                        path: '/repo/src/reduced.py',
                        matrix: { overall: 6.8, interaction_protocol: 'Legacy fallback' },
                        intent: 'Reduced payload',
                        dependencies: null,
                    },
                    {
                        path: '/repo/src/other.ts',
                        matrix: { overall: 6.2 },
                        intent: 'Other payload',
                        dependencies: [42, '/repo/src/reduced.py'],
                    },
                ],
            } as any,
            {},
        );

        assert.equal(data.allNodes.length, 2);
        assert.equal(data.pyNodes.length, 1);
        assert.equal(data.allNodes[0]?.interactionProtocol, 'Legacy fallback');
        assert.equal(data.links.length, 1);
        assert.equal(data.links[0]?.target, '/repo/src/reduced.py');
    });
});
