import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    PYTHON_COMMAND_REGISTRARS_RETIRED_ERROR,
    registerPythonSpokes,
} from '../../src/node/core/commands/python.js';
import {
    VITALS_COMMAND_RETIRED_ERROR,
    registerVitalsCommand,
} from '../../src/node/core/commands/vitals.js';
import {
    ONE_MIND_COMMAND_RETIRED_ERROR,
    registerOneMindCommand,
} from '../../src/node/core/commands/one-mind.js';
import {
    HALL_DOCUMENT_COMMAND_RETIRED_ERROR,
    registerHallDocumentCommand,
} from '../../src/node/core/commands/hall-doc.js';
import {
    SPOKE_COMMAND_RETIRED_ERROR,
    registerSpokeCommand,
} from '../../src/node/core/commands/spoke.js';
import {
    OS_INTEGRATION_COMMAND_RETIRED_ERROR,
    registerOsCommands,
} from '../../src/node/core/commands/os-integration.js';
import {
    ORACLE_COMMAND_RETIRED_ERROR,
    registerOracleCommand,
} from '../../src/node/core/commands/oracle.js';
import {
    TUI_COMMAND_RETIRED_ERROR,
    registerTuiCommand,
} from '../../src/node/core/commands/tui.js';
import {
    BEAD_COMMAND_RETIRED_ERROR,
    registerBeadCommand,
} from '../../src/node/core/commands/bead.js';
import {
    PROFILE_COMMAND_RETIRED_ERROR,
    registerProfileCommand,
} from '../../src/node/core/commands/profile.js';
import {
    BIFROST_COMMAND_RETIRED_ERROR,
    registerBifrostCommand,
} from '../../src/node/core/commands/bifrost.js';
import {
    START_COMMAND_RETIRED_ERROR,
    registerStartCommand,
} from '../../src/node/core/commands/start.js';
import {
    RAVENS_COMMAND_RETIRED_ERROR,
    registerRavenCommand,
} from '../../src/node/core/commands/ravens.js';
import {
    PENNYONE_COMMAND_RETIRED_ERROR,
    registerPennyOneCommand,
} from '../../src/node/core/commands/pennyone.js';
import type { RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../../src/node/core/runtime/contracts.js';

interface EffectCounters {
    workspace: number;
    provider: number;
    database: number;
    filesystemCallback: number;
    dispatch: number;
}

interface Scenario {
    name: string;
    argv: string[];
    error: string;
    register(program: Command, root: string, effects: EffectCounters): void;
}

function rejectDispatchPort(effects: EffectCounters): RuntimeDispatchPort {
    return {
        async dispatch<T>(_invocation: WeaveInvocation<T>): Promise<WeaveResult> {
            effects.dispatch += 1;
            throw new Error('runtime dispatch forbidden');
        },
    };
}

const pythonScenario = (route: string): Scenario => ({
    name: `Python route ${route}`,
    argv: [route, '--synthetic'],
    error: PYTHON_COMMAND_REGISTRARS_RETIRED_ERROR,
    register: (program, root) => registerPythonSpokes(program, root),
});

const scenarios: Scenario[] = [
    ...['dominion', 'odin', 'dormancy', 'sleep', 'skill', 'lore', 'recreate'].map(pythonScenario),
    {
        name: 'vitals', argv: ['vitals'], error: VITALS_COMMAND_RETIRED_ERROR,
        register: (program) => registerVitalsCommand(program),
    },
    {
        name: 'One Mind serve', argv: ['one-mind', 'serve'], error: ONE_MIND_COMMAND_RETIRED_ERROR,
        register: (program, root, effects) => registerOneMindCommand(program, () => {
            effects.workspace += 1;
            return root;
        }),
    },
    {
        name: 'Hall document ingest', argv: ['hall-doc', 'ingest', 'fixture'], error: HALL_DOCUMENT_COMMAND_RETIRED_ERROR,
        register: (program) => registerHallDocumentCommand(program),
    },
    {
        name: 'spoke link', argv: ['spoke', 'link', 'fixture', '/tmp/fixture'], error: SPOKE_COMMAND_RETIRED_ERROR,
        register: (program, root, effects) => registerSpokeCommand(program, () => {
            effects.workspace += 1;
            return root;
        }),
    },
    {
        name: 'OS install', argv: ['os', 'install'], error: OS_INTEGRATION_COMMAND_RETIRED_ERROR,
        register: (program) => registerOsCommands(program),
    },
    {
        name: 'OS uninstall', argv: ['os', 'uninstall'], error: OS_INTEGRATION_COMMAND_RETIRED_ERROR,
        register: (program) => registerOsCommands(program),
    },
    {
        name: 'Oracle sample', argv: ['oracle', 'prompt', '--provider', 'gemini'], error: ORACLE_COMMAND_RETIRED_ERROR,
        register: (program, root, effects) => registerOracleCommand(program, () => {
            effects.workspace += 1;
            return root;
        }, {
            hostTextInvoker: (() => {
                effects.provider += 1;
                throw new Error('provider forbidden');
            }) as never,
            databaseFactory: (() => {
                effects.database += 1;
                throw new Error('database forbidden');
            }) as never,
            fileSystem: new Proxy({}, {
                get: () => {
                    effects.filesystemCallback += 1;
                    throw new Error('filesystem callback forbidden');
                },
            }),
        }),
    },
    {
        name: 'operator TUI', argv: ['tui'], error: TUI_COMMAND_RETIRED_ERROR,
        register: (program, _root, effects) => registerTuiCommand(program, rejectDispatchPort(effects)),
    },
    {
        name: 'bead transition', argv: ['bead', 'set', 'bead:synthetic'], error: BEAD_COMMAND_RETIRED_ERROR,
        register: (program) => registerBeadCommand(program),
    },
    {
        name: 'profile secret', argv: ['profile', 'secret', 'set', 'github'], error: PROFILE_COMMAND_RETIRED_ERROR,
        register: (program) => registerProfileCommand(program),
    },
    {
        name: 'Bifrost host guide', argv: ['bifrost', '--host-guide'], error: BIFROST_COMMAND_RETIRED_ERROR,
        register: (program, root, effects) => registerBifrostCommand(program, {
            projectRoot: () => {
                effects.workspace += 1;
                return root;
            },
            hostTextInvoker: (() => {
                effects.provider += 1;
                throw new Error('provider forbidden');
            }) as never,
        }),
    },
    {
        name: 'start', argv: ['start', 'src/index.ts', '--loki'], error: START_COMMAND_RETIRED_ERROR,
        register: (program, root, effects) => registerStartCommand(program, () => {
            effects.workspace += 1;
            return root;
        }, rejectDispatchPort(effects)),
    },
    {
        name: 'Ravens sweep', argv: ['ravens', 'sweep', '--host-supervision'], error: RAVENS_COMMAND_RETIRED_ERROR,
        register: (program, root, effects) => registerRavenCommand(program, () => {
            effects.workspace += 1;
            return root;
        }, rejectDispatchPort(effects)),
    },
    {
        name: 'PennyOne clean', argv: ['pennyone', '--clean', '--json'], error: PENNYONE_COMMAND_RETIRED_ERROR,
        register: (program, root, effects) => registerPennyOneCommand(program, () => {
            effects.workspace += 1;
            return root;
        }, rejectDispatchPort(effects)),
    },
];

afterEach(() => {
    mock.reset();
});

describe('retired Commander registrars', () => {
    for (const scenario of scenarios) {
        it(`${scenario.name} fails before every effect boundary`, async () => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-retired-registrar-'));
            const originalEnv = { ...process.env };
            process.env.HOME = root;
            process.env.USERPROFILE = root;
            process.env.CSTAR_CONTROL_ROOT = root;
            const baselineEnv = { ...process.env };
            const baselineExitCode = process.exitCode;
            const baselineSignals = {
                sigint: process.listenerCount('SIGINT'),
                sigterm: process.listenerCount('SIGTERM'),
            };
            const effects: EffectCounters = {
                workspace: 0,
                provider: 0,
                database: 0,
                filesystemCallback: 0,
                dispatch: 0,
            };
            let processEffects = 0;
            let filesystemEffects = 0;

            try {
                mock.method(process, 'exit', (_code?: string | number | null) => {
                    processEffects += 1;
                    throw new Error('process.exit forbidden');
                });
                for (const method of [
                    'appendFileSync', 'chmodSync', 'copyFileSync', 'mkdirSync',
                    'renameSync', 'rmSync', 'unlinkSync', 'writeFileSync',
                ]) {
                    mock.method(fs as never, method as never, (() => {
                        filesystemEffects += 1;
                        throw new Error(`filesystem mutation forbidden:${method}`);
                    }) as never);
                }

                const program = new Command().exitOverride();
                scenario.register(program, root, effects);
                await assert.rejects(
                    program.parseAsync(['node', 'test', ...scenario.argv]),
                    new RegExp(scenario.error),
                );

                assert.deepEqual(effects, {
                    workspace: 0,
                    provider: 0,
                    database: 0,
                    filesystemCallback: 0,
                    dispatch: 0,
                });
                assert.equal(processEffects, 0);
                assert.equal(filesystemEffects, 0);
                assert.equal(process.exitCode, baselineExitCode);
                assert.deepEqual({ ...process.env }, baselineEnv);
                assert.deepEqual({
                    sigint: process.listenerCount('SIGINT'),
                    sigterm: process.listenerCount('SIGTERM'),
                }, baselineSignals);
            } finally {
                for (const key of Object.keys(process.env)) delete process.env[key];
                Object.assign(process.env, originalEnv);
            }
        });
    }

    it('source modules have no action-bearing dependency imports', () => {
        const sources = [
            'python.ts', 'vitals.ts', 'one-mind.ts', 'hall-doc.ts',
            'spoke.ts', 'os-integration.ts', 'oracle.ts', 'tui.ts',
            'bead.ts', 'profile.ts', 'bifrost.ts', 'start.ts', 'ravens.ts',
            'pennyone.ts',
        ];
        for (const name of sources) {
            const source = fs.readFileSync(
                new URL(`../../src/node/core/commands/${name}`, import.meta.url),
                'utf-8',
            );
            assert.doesNotMatch(source, /(?:execa|better-sqlite3|host_intelligence|tools\/pennyone|StateRegistry|RuntimeDispatcher|runOperatorTui|BlackboardManager)/, name);
            assert.doesNotMatch(source, /from ['"]node:(?:fs|os|child_process)['"]/, name);
            assert.doesNotMatch(source, /process\.(?:env|exit|exitCode|kill|once|on)\b/, name);
        }

        const inputSource = fs.readFileSync(
            new URL('../../src/node/core/tui/operator_tui_commands.ts', import.meta.url),
            'utf-8',
        );
        assert.doesNotMatch(inputSource, /(?:pennyone|StateRegistry|BlackboardManager|buildChantInvocation|buildDynamicCommandInvocation)/);
        assert.doesNotMatch(inputSource, /\.dispatch\s*\(/);

        const rendererSource = fs.readFileSync(
            new URL('../../src/node/core/commands/command_context.ts', import.meta.url),
            'utf-8',
        );
        assert.doesNotMatch(rendererSource, /(?:pennyone|HallPlanningSession|upsertHallBead|saveHallPlanningSession|getHallBead)/);
    });

    it('documents the active surface and every stable retirement boundary', () => {
        const documentation = fs.readFileSync(
            new URL('../../docs/operations/retired-cli-command-registrars.md', import.meta.url),
            'utf-8',
        );
        for (const active of ['status', 'manifest', 'skill-info', 'trace', 'augury']) {
            assert.match(documentation, new RegExp(`\\b${active}\\b`));
        }
        for (const scenario of scenarios) {
            assert.match(documentation, new RegExp(scenario.error), scenario.name);
        }
        assert.match(documentation, /output-only/);
        assert.match(documentation, /not an installed-runtime,\s+activation, deployment, or production-readiness claim/i);
    });
});
