import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';

/**
 * [EMPIRE TDD]: Operation PennyOne Structural Rectification
 * Verify NeuralGraph.tsx adheres to ODIN mandates for Threading, Layout, and Types.
 */
test('◤ EMPIRE: NEURALGRAPH STRUCTURAL RECTIFICATION ◢', async (t) => {
    const neuralGraphPath = path.join(registry.getRoot(), 'src/tools/pennyone/vis/components/NeuralGraph.tsx');
    const content = fs.readFileSync(neuralGraphPath, 'utf-8');

    await t.test('Organic Physics Threading (No Blocking)', () => {
        // Assert absence of the blocking layout calculation loop
        assert.ok(!content.includes('for (let i = 0; i < 300; ++i) simulation.tick();'), 'NeuralGraph must not contain synchronous simulation blocking loops.');
        assert.ok(!content.includes('simulation.stop();'), 'NeuralGraph must not force stop the simulation prematurely.');
    });

    await t.test('Sovereign HUD Layout Containment', () => {
        // Assert absence of layout breach (fullscreen, absolute positioning)
        assert.ok(!content.includes('<Html fullscreen>'), 'NeuralGraph must not use absolute fullscreen HUD HTML tags.');
        assert.ok(!content.includes('position: absolute;'), 'NeuralGraph HUD must not have absolute positioning.');
        assert.ok(!content.includes('transform: translate(-50%, -50%);'), 'NeuralGraph HUD must rely on flexbox wrapping, not absolute translates.');
    });

    await t.test('Strict Typescript and ESLint Enforcement', () => {
        // Assert absence of ESLint and TS cowardice
        assert.ok(!content.includes('/* eslint-disable */'), 'NeuralGraph must not override Sentinel Scans with eslint-disable.');
        assert.ok(!content.includes(' as any'), 'NeuralGraph must not rely on explicit any types.');
    });
});
