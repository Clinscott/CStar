import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { deps, resolveAutobotBeadId, buildAutobotWorkerNote, resolveAutobotCheckerShell } from  '../../../src/node/core/runtime/autobot_context.js';

describe('Autobot Context Unit Tests', () => {
    it('should resolve the correct bead ID based on priority', () => {
        const mockBeads = [
            { id: 'bead-open', status: 'OPEN', target_path: 'src/a.ts', acceptance_criteria: 'test' },
            { id: 'bead-set', status: 'SET', target_path: 'src/b.ts', acceptance_criteria: 'test' },
            { id: 'bead-in-progress', status: 'IN_PROGRESS', target_path: 'src/c.ts', acceptance_criteria: 'test' }
        ];

        mock.method(deps.database, 'getHallBeads', () => mockBeads);

        const result = resolveAutobotBeadId('/mock/root', null);
        assert.strictEqual(result, 'bead-in-progress');
        mock.reset();
    });

    it('should build a comprehensive worker note', () => {
        const mockBead = {
            id: 'bead-1',
            target_path: 'src/main.ts',
            contract_refs: ['contract-1'],
            rationale: 'Fix bug',
            acceptance_criteria: 'Run `npm test`',
            critique_payload: { target_symbol: 'Main' }
        };

        mock.method(deps.database, 'getHallBeads', () => [mockBead]);
        mock.method(deps.database, 'getHallFile', () => ({
            intent_summary: 'Core logic',
            interaction_summary: 'Exports main function'
        }));
        mock.method(deps, 'buildSkeletonContext', () => 'class Main {}');

        const note = buildAutobotWorkerNote('/mock/root', 'bead-1', null);

        assert.ok(note.includes('Active bead: bead-1'));
        assert.ok(note.includes('Target path: src/main.ts'));
        assert.ok(note.includes('Target skeleton: class Main {}'));
        assert.ok(note.includes('Checker shell: npm test'));
        assert.ok(note.includes('Target file role: Core logic'));
        mock.reset();
    });

    it('should resolve checker shell from session metadata if present', () => {
        const mockSession = {
            metadata: { checker_shell: 'ls -la' }
        } as any;

        const result = resolveAutobotCheckerShell('/mock/root', 'bead-1', mockSession);
        assert.strictEqual(result, 'ls -la');
    });

    it('should resolve checker shell from bead if not in session', () => {
        const mockBead = {
            id: 'bead-1',
            checker_shell: 'npx tsc'
        };

        mock.method(deps.database, 'getHallBeads', () => [mockBead]);

        const result = resolveAutobotCheckerShell('/mock/root', 'bead-1', null);
        assert.strictEqual(result, 'npx tsc');
        mock.reset();
    });
});
