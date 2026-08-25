import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';

import { blackboardManagerDeps } from '../../../src/node/core/blackboard_manager.js';
import {
    TUI_COMMAND_RETIRED_ERROR,
    registerTuiCommand,
} from '../../../src/node/core/commands/tui.js';
import {
    operatorTuiRuntimeDeps,
    runOperatorTui,
    type OperatorSnapshot,
} from '../../../src/node/core/tui/operator_tui.js';
import {
    dispatchOperatorInput,
    TUI_ACTION_RETIRED_ERROR,
} from '../../../src/node/core/tui/operator_tui_commands.js';
import type { RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../../../src/node/core/runtime/contracts.js';

function makeSnapshot(events: OperatorSnapshot['events']): OperatorSnapshot {
    return {
        workspaceRoot: '/synthetic/cstar',
        state: {
            framework: {
                status: 'AWAKE',
                last_awakening: 1,
                active_persona: '',
                gungnir_score: 0,
                intent_integrity: 100,
            },
            identity: {
                name: 'CStar', tagline: 'Control plane', guiding_principles: [],
                use_systems: {
                    interface: 'TUI', orchestration: 'Runtime', intelligence: 'Kernel',
                    memory: 'Hall', visualization: 'PennyOne',
                },
            },
            hall_of_records: {
                description: 'Hall',
                primary_assets: { database: '', contracts: '', lore: '', history: '' },
            },
            managed_spokes: [],
            operator_console: {
                default_entrypoint: 'tui', preferred_prompt_position: 'top',
                verbose_stream: false, theme: 'matrix',
            },
            agents: {}, blackboard: [], terminal_logs: [],
        },
        hallSummary: null,
        beads: [],
        planningSessions: [],
        proposals: [],
        events,
        activeTab: 'OVERVIEW',
    };
}

class RejectDispatchPort implements RuntimeDispatchPort {
    public calls = 0;

    public async dispatch<T>(_invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.calls += 1;
        throw new Error('ambient dispatch forbidden');
    }
}

afterEach(() => {
    mock.reset();
});

describe('retired operator TUI boundary', () => {
    it('opens read-only with zero provider, model, or runtime dispatch calls', async () => {
        const dispatchPort = new RejectDispatchPort();
        const providerMock = mock.method(blackboardManagerDeps, 'requestHostText', async () => {
            throw new Error('ambient provider call forbidden');
        });
        mock.method(operatorTuiRuntimeDeps, 'getWorkspaceRoot', () => '/synthetic/cstar');
        mock.method(operatorTuiRuntimeDeps, 'getHallSummary', () => null);
        mock.method(operatorTuiRuntimeDeps, 'readSnapshot', (events) => makeSnapshot(events));
        mock.method(operatorTuiRuntimeDeps, 'isInteractive', () => false);
        const writeMock = mock.method(operatorTuiRuntimeDeps, 'write', () => undefined);

        await runOperatorTui(dispatchPort);

        assert.equal(dispatchPort.calls, 0);
        assert.equal(providerMock.mock.callCount(), 0);
        assert.equal(writeMock.mock.callCount(), 1);
    });

    it('keeps only passive navigation, refresh, clear, and exit input semantics', async () => {
        const dispatchPort = new RejectDispatchPort();
        const results = await Promise.all([
            dispatchOperatorInput('status', dispatchPort, '/synthetic/cstar', 'OVERVIEW'),
            dispatchOperatorInput('hall', dispatchPort, '/synthetic/cstar', 'OVERVIEW'),
            dispatchOperatorInput('blackboard', dispatchPort, '/synthetic/cstar', 'OVERVIEW'),
            dispatchOperatorInput('', dispatchPort, '/synthetic/cstar', 'OVERVIEW'),
            dispatchOperatorInput('clear', dispatchPort, '/synthetic/cstar', 'OVERVIEW'),
            dispatchOperatorInput('exit', dispatchPort, '/synthetic/cstar', 'OVERVIEW'),
        ]);

        assert.equal(dispatchPort.calls, 0);
        assert.deepEqual(results.map((result) => result.events[0]?.level), [
            'PASS', 'PASS', 'INFO', 'INFO', 'INFO', 'PASS',
        ]);
        assert.equal(results[2].activeTab, 'BLACKBOARD');
        assert.equal(results[5].exit, true);
    });

    it('fails every action-bearing input before callback or dispatch', async () => {
        const dispatchPort = new RejectDispatchPort();
        const inputs = [
            'compact blackboard',
            'hand worker inspect logs',
            'broadcast maintenance window',
            'chant repair the system',
            'forge execute',
            'pennyone refresh',
        ];

        for (const input of inputs) {
            const result = await dispatchOperatorInput(
                input,
                dispatchPort,
                '/synthetic/cstar',
                'OVERVIEW',
                'session:synthetic',
            );
            assert.equal(result.events[0]?.level, 'FAIL');
            assert.equal(result.events[0]?.detail, TUI_ACTION_RETIRED_ERROR);
            assert.equal(result.planningSessionId, 'session:synthetic');
        }
        assert.equal(dispatchPort.calls, 0);
    });

    it('fails direct Commander registration before invoking the supplied dispatch port', async () => {
        const dispatchPort = new RejectDispatchPort();
        const program = new Command().exitOverride();
        registerTuiCommand(program, dispatchPort);

        await assert.rejects(
            program.parseAsync(['node', 'test', 'tui', '--interactive']),
            new RegExp(TUI_COMMAND_RETIRED_ERROR),
        );
        assert.equal(dispatchPort.calls, 0);
    });
});
