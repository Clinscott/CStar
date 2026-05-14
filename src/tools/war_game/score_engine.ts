/**
 * BEAD-CSTAR-WAR-GAME-SCORING-001 — Pure scoring engine.
 *
 * Given an attacker Engram (shot-fired) and a defender Engram (verdict) plus
 * a contest's class/compatibility maps, derive the outcome. No I/O, no database,
 * no side effects — all decisions are pure functions of the inputs.
 *
 * See docs/beads/cstar-war-game-scoring-001.md §Q3 and §Q4 for the ruling.
 */

export type WarGameOutcome =
    | 'defender_blocked'
    | 'attacker_bypassed'
    | 'false_positive'
    | 'baseline_pass'
    | 'inconclusive'
    | 'protocol_violation';

export type WarGameEventClass = 'block' | 'complete' | 'inconclusive';

export interface TerminalEventClassMap {
    block: string[];
    complete: string[];
    inconclusive: string[];
}

export interface ScenarioCompatibilityMap {
    [scenarioId: string]: string[];
}

export interface ContestConfig {
    contest_id: string;
    shot_id_path: string;
    expected_path: string;
    terminal_event_path: string;
    terminal_event_class_map: TerminalEventClassMap;
    scenario_compatibility_map: ScenarioCompatibilityMap;
}

export interface AttackerExpectation {
    outcome: 'deflected' | 'captured_clean' | 'captured_threat';
    [key: string]: unknown;
}

export interface AttackerEngramPayload {
    metadata: {
        shot_id: string;
        scenario_id: string;
        expected: AttackerExpectation;
        [key: string]: unknown;
    };
}

export interface DefenderEngramPayload {
    metadata: {
        shot_id: string;
        scenario_id?: string;
        terminal_event: string;
        [key: string]: unknown;
    };
}

export interface ScoreDerivation {
    outcome: WarGameOutcome;
    inconclusive_reason: string | null;
    event_class: WarGameEventClass | 'unknown';
}

/**
 * Classify a defender's terminal_event string into a class via the contest's map.
 * Returns 'unknown' if the event is not present in any class — caller treats as
 * protocol_violation.
 */
export function classifyTerminalEvent(
    terminalEvent: string,
    classMap: TerminalEventClassMap,
): WarGameEventClass | 'unknown' {
    if (classMap.block?.includes(terminalEvent)) return 'block';
    if (classMap.complete?.includes(terminalEvent)) return 'complete';
    if (classMap.inconclusive?.includes(terminalEvent)) return 'inconclusive';
    return 'unknown';
}

/**
 * Decide whether a defender's terminal_event is structurally valid for the
 * scenario it claims to have processed.  If the scenario_id is not registered
 * in the compatibility map, the check is permissive (returns false → not a
 * violation); registering a scenario without a compatibility entry is the
 * contest-author's choice to opt out of structural checking for that row.
 */
export function isProtocolViolation(
    scenarioId: string,
    terminalEvent: string,
    compatibility: ScenarioCompatibilityMap,
    listenerInternalEvents: ReadonlyArray<string>,
): boolean {
    // Listener-internal failures (timeout, panic, refused) are always valid.
    // They classify as 'inconclusive' or feed into outcome computation directly.
    if (listenerInternalEvents.includes(terminalEvent)) {
        return false;
    }
    const allowed = compatibility[scenarioId];
    if (!allowed || allowed.length === 0) {
        // No compatibility entry → opt-out of structural checking for this scenario.
        return false;
    }
    return !allowed.includes(terminalEvent);
}

/**
 * Derive the score outcome from the join of attacker and defender Engrams.
 *
 * Truth table (design §Q3):
 *
 *   expected.outcome     | terminal class  | result
 *   ---------------------|-----------------|--------------------
 *   deflected            | block           | defender_blocked
 *   deflected            | complete        | attacker_bypassed
 *   captured_clean       | complete        | baseline_pass
 *   captured_clean       | block           | false_positive
 *   captured_threat      | block           | defender_blocked
 *   captured_threat      | complete        | attacker_bypassed
 *   any                  | inconclusive    | inconclusive
 *   any                  | unknown class   | protocol_violation
 *
 * Protocol-violation check (§Q4) runs first: if terminal_event is structurally
 * impossible for the scenario, outcome is protocol_violation regardless of the
 * expected/class join.
 */
export function deriveOutcome(
    attacker: AttackerEngramPayload,
    defender: DefenderEngramPayload,
    contest: ContestConfig,
    listenerInternalEvents: ReadonlyArray<string> = [
        'usb-sentry/forge-listener-refused',
        'usb-sentry/forge-listener-timeout',
        'usb-sentry/forge-listener-panic',
    ],
): ScoreDerivation {
    const terminalEvent = defender.metadata.terminal_event;
    const scenarioId = attacker.metadata.scenario_id;

    // §Q4 — protocol-violation check runs first.
    if (isProtocolViolation(
        scenarioId,
        terminalEvent,
        contest.scenario_compatibility_map,
        listenerInternalEvents,
    )) {
        return {
            outcome: 'protocol_violation',
            inconclusive_reason: `terminal_event '${terminalEvent}' structurally impossible for scenario '${scenarioId}'`,
            event_class: 'unknown',
        };
    }

    const eventClass = classifyTerminalEvent(terminalEvent, contest.terminal_event_class_map);

    // Listener-internal failures classify as inconclusive regardless of expected.
    if (eventClass === 'inconclusive') {
        return {
            outcome: 'inconclusive',
            inconclusive_reason: `listener event '${terminalEvent}'`,
            event_class: 'inconclusive',
        };
    }

    // Unknown event class (not in any of block/complete/inconclusive) = protocol violation.
    if (eventClass === 'unknown') {
        return {
            outcome: 'protocol_violation',
            inconclusive_reason: `terminal_event '${terminalEvent}' is not classified in contest event map`,
            event_class: 'unknown',
        };
    }

    const expected = attacker.metadata.expected?.outcome;

    // §Q3 truth table.
    if (expected === 'deflected' || expected === 'captured_threat') {
        // Attacker expected the defender to block this.
        return {
            outcome: eventClass === 'block' ? 'defender_blocked' : 'attacker_bypassed',
            inconclusive_reason: null,
            event_class: eventClass,
        };
    }

    if (expected === 'captured_clean') {
        // Attacker expected the defender to allow this through (baseline / control).
        return {
            outcome: eventClass === 'complete' ? 'baseline_pass' : 'false_positive',
            inconclusive_reason: null,
            event_class: eventClass,
        };
    }

    // Unknown / missing expected → inconclusive.
    return {
        outcome: 'inconclusive',
        inconclusive_reason: `attacker expected.outcome unknown: ${JSON.stringify(expected)}`,
        event_class: eventClass,
    };
}

/**
 * §Q5 severity ordering for the upsert path. A second verdict Engram for the
 * same shot can upgrade the score only if its outcome is *more severe* than
 * the existing one — never downgrade.
 *
 * Higher number = more severe (= newer wins).
 */
export const OUTCOME_SEVERITY: Record<WarGameOutcome, number> = {
    baseline_pass: 0,
    defender_blocked: 1,
    inconclusive: 2,
    false_positive: 3,
    attacker_bypassed: 4,
    protocol_violation: 5,
};

export function shouldUpgrade(existing: WarGameOutcome, incoming: WarGameOutcome): boolean {
    return OUTCOME_SEVERITY[incoming] > OUTCOME_SEVERITY[existing];
}

/**
 * Extract a value from an Engram payload using a dotted path
 * (e.g. 'metadata.shot_id'). Used by the score trigger to read shot_id /
 * expected / terminal_event from arbitrary Engram payloads per contest config.
 */
export function readPath(payload: unknown, dottedPath: string): unknown {
    if (!dottedPath) return undefined;
    const parts = dottedPath.split('.');
    let cursor: any = payload;
    for (const part of parts) {
        if (cursor === null || cursor === undefined) return undefined;
        cursor = cursor[part];
    }
    return cursor;
}

/**
 * Convenience: extract shot_id from a payload via the contest's shot_id_path.
 */
export function extractShotId(payload: unknown, contest: ContestConfig): string | null {
    const value = readPath(payload, contest.shot_id_path);
    if (typeof value !== 'string' || value.length === 0) return null;
    return value;
}
