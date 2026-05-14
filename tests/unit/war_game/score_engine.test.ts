import test from 'node:test';
import assert from 'node:assert';
import {
    deriveOutcome,
    classifyTerminalEvent,
    isProtocolViolation,
    shouldUpgrade,
    readPath,
    extractShotId,
    type ContestConfig,
    type AttackerEngramPayload,
    type DefenderEngramPayload,
} from '../../../src/tools/war_game/score_engine.js';

/**
 * BEAD-CSTAR-WAR-GAME-SCORING-001 — Triad leg 2 (Isolation).
 * Covers every §Q3 outcome variant, §Q4 protocol-violation cases, §Q5 severity ordering.
 */

const USB_FORGE_VS_SENTRY_CONTEST: ContestConfig = {
    contest_id: 'usb-forge-vs-sentry-v1',
    shot_id_path: 'metadata.shot_id',
    expected_path: 'metadata.expected',
    terminal_event_path: 'metadata.terminal_event',
    terminal_event_class_map: {
        block: [
            'usb-sentry/phase1-hit',
            'usb-sentry/device-held-rejected',
            'usb-sentry/forge-listener-refused',
        ],
        complete: ['usb-sentry/complete'],
        inconclusive: [
            'usb-sentry/forge-listener-timeout',
            'usb-sentry/forge-listener-panic',
        ],
    },
    scenario_compatibility_map: {
        'FORGE-MS-001': ['usb-sentry/complete'],
        'FORGE-MS-002': ['usb-sentry/phase1-hit'],
        'FORGE-HID-001': ['usb-sentry/device-held-rejected'],
        'FORGE-HID-002': ['usb-sentry/device-held-rejected', 'usb-sentry/phase1-hit'],
    },
};

function attackerEngram(
    shotId: string,
    scenarioId: string,
    expectedOutcome: 'deflected' | 'captured_clean' | 'captured_threat',
): AttackerEngramPayload {
    return {
        metadata: {
            shot_id: shotId,
            scenario_id: scenarioId,
            expected: { outcome: expectedOutcome },
        },
    };
}

function defenderEngram(shotId: string, terminalEvent: string): DefenderEngramPayload {
    return {
        metadata: {
            shot_id: shotId,
            terminal_event: terminalEvent,
        },
    };
}

test('classifyTerminalEvent', (t) => {
    const map = USB_FORGE_VS_SENTRY_CONTEST.terminal_event_class_map;

    t.test('block events classify as block', () => {
        assert.strictEqual(classifyTerminalEvent('usb-sentry/phase1-hit', map), 'block');
        assert.strictEqual(classifyTerminalEvent('usb-sentry/device-held-rejected', map), 'block');
        assert.strictEqual(classifyTerminalEvent('usb-sentry/forge-listener-refused', map), 'block');
    });

    t.test('complete event classifies as complete', () => {
        assert.strictEqual(classifyTerminalEvent('usb-sentry/complete', map), 'complete');
    });

    t.test('listener internal events classify as inconclusive', () => {
        assert.strictEqual(classifyTerminalEvent('usb-sentry/forge-listener-timeout', map), 'inconclusive');
        assert.strictEqual(classifyTerminalEvent('usb-sentry/forge-listener-panic', map), 'inconclusive');
    });

    t.test('unknown events return unknown', () => {
        assert.strictEqual(classifyTerminalEvent('usb-sentry/martian-attack', map), 'unknown');
        assert.strictEqual(classifyTerminalEvent('', map), 'unknown');
    });
});

test('isProtocolViolation', (t) => {
    const compat = USB_FORGE_VS_SENTRY_CONTEST.scenario_compatibility_map;
    const listenerInternal = [
        'usb-sentry/forge-listener-refused',
        'usb-sentry/forge-listener-timeout',
        'usb-sentry/forge-listener-panic',
    ];

    t.test('listener-internal events never violate', () => {
        assert.strictEqual(
            isProtocolViolation('FORGE-MS-001', 'usb-sentry/forge-listener-timeout', compat, listenerInternal),
            false,
        );
    });

    t.test('valid event for scenario is not a violation', () => {
        assert.strictEqual(
            isProtocolViolation('FORGE-MS-001', 'usb-sentry/complete', compat, listenerInternal),
            false,
        );
        assert.strictEqual(
            isProtocolViolation('FORGE-HID-002', 'usb-sentry/phase1-hit', compat, listenerInternal),
            false,
        );
    });

    t.test('invalid event for scenario IS a violation', () => {
        // pure HID can't reach Phase 1 — complete is structurally impossible
        assert.strictEqual(
            isProtocolViolation('FORGE-HID-001', 'usb-sentry/complete', compat, listenerInternal),
            true,
        );
        // baseline FORGE-MS-001 expects clean; phase1-hit is a violation of the contract
        assert.strictEqual(
            isProtocolViolation('FORGE-MS-001', 'usb-sentry/phase1-hit', compat, listenerInternal),
            true,
        );
    });

    t.test('scenario with no compatibility entry opts out of structural checking', () => {
        assert.strictEqual(
            isProtocolViolation('FORGE-UNKNOWN', 'usb-sentry/complete', compat, listenerInternal),
            false,
        );
    });
});

test('deriveOutcome — §Q3 truth table', (t) => {
    const contest = USB_FORGE_VS_SENTRY_CONTEST;

    t.test('Deflected expected + block class → defender_blocked', () => {
        const a = attackerEngram('s1', 'FORGE-MS-002', 'deflected');
        const d = defenderEngram('s1', 'usb-sentry/phase1-hit');
        const result = deriveOutcome(a, d, contest);
        assert.strictEqual(result.outcome, 'defender_blocked');
        assert.strictEqual(result.event_class, 'block');
    });

    t.test('Deflected expected + complete → attacker_bypassed', () => {
        // attacker fired FORGE-MS-002 (EICAR straddle) expecting deflection;
        // sentry let it through. Forge wins this round.
        // Skip compatibility check by using a scenario without strict mapping for this terminal event.
        const customContest: ContestConfig = {
            ...contest,
            scenario_compatibility_map: {
                ...contest.scenario_compatibility_map,
                'FORGE-MS-002': ['usb-sentry/phase1-hit', 'usb-sentry/complete'],
            },
        };
        const a = attackerEngram('s2', 'FORGE-MS-002', 'deflected');
        const d = defenderEngram('s2', 'usb-sentry/complete');
        const result = deriveOutcome(a, d, customContest);
        assert.strictEqual(result.outcome, 'attacker_bypassed');
        assert.strictEqual(result.event_class, 'complete');
    });

    t.test('CapturedClean expected + complete → baseline_pass', () => {
        const a = attackerEngram('s3', 'FORGE-MS-001', 'captured_clean');
        const d = defenderEngram('s3', 'usb-sentry/complete');
        const result = deriveOutcome(a, d, contest);
        assert.strictEqual(result.outcome, 'baseline_pass');
    });

    t.test('CapturedClean expected + block class → false_positive', () => {
        // FORGE-MS-001 is the clean baseline; if defender blocks it, false positive.
        // Override compatibility to allow the test event (it's the violation
        // detector that would fire otherwise — that's a different scenario).
        const customContest: ContestConfig = {
            ...contest,
            scenario_compatibility_map: {
                ...contest.scenario_compatibility_map,
                'FORGE-MS-001': ['usb-sentry/complete', 'usb-sentry/phase1-hit'],
            },
        };
        const a = attackerEngram('s4', 'FORGE-MS-001', 'captured_clean');
        const d = defenderEngram('s4', 'usb-sentry/phase1-hit');
        const result = deriveOutcome(a, d, customContest);
        assert.strictEqual(result.outcome, 'false_positive');
    });

    t.test('CapturedThreat expected + block → defender_blocked', () => {
        const a = attackerEngram('s5', 'FORGE-MS-002', 'captured_threat');
        const d = defenderEngram('s5', 'usb-sentry/phase1-hit');
        const result = deriveOutcome(a, d, contest);
        assert.strictEqual(result.outcome, 'defender_blocked');
    });

    t.test('listener-timeout terminal → inconclusive', () => {
        const a = attackerEngram('s6', 'FORGE-MS-002', 'deflected');
        const d = defenderEngram('s6', 'usb-sentry/forge-listener-timeout');
        const result = deriveOutcome(a, d, contest);
        assert.strictEqual(result.outcome, 'inconclusive');
        assert.ok(result.inconclusive_reason?.includes('listener event'));
    });
});

test('deriveOutcome — §Q4 protocol-violation precedence', (t) => {
    const contest = USB_FORGE_VS_SENTRY_CONTEST;

    t.test('terminal_event impossible for scenario → protocol_violation, even with valid expected', () => {
        // FORGE-HID-001 is pure-HID; sentry reporting 'complete' is structurally impossible.
        const a = attackerEngram('v1', 'FORGE-HID-001', 'deflected');
        const d = defenderEngram('v1', 'usb-sentry/complete');
        const result = deriveOutcome(a, d, contest);
        assert.strictEqual(result.outcome, 'protocol_violation');
        assert.ok(result.inconclusive_reason?.includes('FORGE-HID-001'));
    });

    t.test('unknown terminal_event class → protocol_violation', () => {
        const customContest: ContestConfig = {
            ...contest,
            scenario_compatibility_map: {}, // disable structural check
        };
        const a = attackerEngram('v2', 'FORGE-MS-002', 'deflected');
        const d = defenderEngram('v2', 'usb-sentry/unicorn-event');
        const result = deriveOutcome(a, d, customContest);
        assert.strictEqual(result.outcome, 'protocol_violation');
        assert.ok(result.inconclusive_reason?.includes('not classified'));
    });
});

test('shouldUpgrade — §Q5 severity ordering', (t) => {
    t.test('attacker_bypassed upgrades defender_blocked', () => {
        assert.strictEqual(shouldUpgrade('defender_blocked', 'attacker_bypassed'), true);
    });

    t.test('defender_blocked does NOT upgrade attacker_bypassed (no downgrade)', () => {
        assert.strictEqual(shouldUpgrade('attacker_bypassed', 'defender_blocked'), false);
    });

    t.test('protocol_violation upgrades everything', () => {
        assert.strictEqual(shouldUpgrade('baseline_pass', 'protocol_violation'), true);
        assert.strictEqual(shouldUpgrade('defender_blocked', 'protocol_violation'), true);
        assert.strictEqual(shouldUpgrade('attacker_bypassed', 'protocol_violation'), true);
    });

    t.test('same-outcome second write is not an upgrade', () => {
        assert.strictEqual(shouldUpgrade('defender_blocked', 'defender_blocked'), false);
    });

    t.test('false_positive upgrades inconclusive but not attacker_bypassed', () => {
        assert.strictEqual(shouldUpgrade('inconclusive', 'false_positive'), true);
        assert.strictEqual(shouldUpgrade('attacker_bypassed', 'false_positive'), false);
    });
});

test('readPath & extractShotId', (t) => {
    const payload = {
        metadata: {
            shot_id: '01HSPXC8',
            scenario_id: 'FORGE-MS-001',
            nested: { deep: { value: 42 } },
        },
    };

    t.test('reads simple dotted path', () => {
        assert.strictEqual(readPath(payload, 'metadata.shot_id'), '01HSPXC8');
    });

    t.test('reads nested deeper path', () => {
        assert.strictEqual(readPath(payload, 'metadata.nested.deep.value'), 42);
    });

    t.test('returns undefined for missing path', () => {
        assert.strictEqual(readPath(payload, 'metadata.does.not.exist'), undefined);
    });

    t.test('extractShotId returns string', () => {
        const id = extractShotId(payload, USB_FORGE_VS_SENTRY_CONTEST);
        assert.strictEqual(id, '01HSPXC8');
    });

    t.test('extractShotId returns null for missing id', () => {
        const id = extractShotId({ metadata: {} }, USB_FORGE_VS_SENTRY_CONTEST);
        assert.strictEqual(id, null);
    });
});
