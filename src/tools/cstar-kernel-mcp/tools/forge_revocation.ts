import { hasContradictoryForgeLaneInstruction } from './operator_authorization_scope.js';

const FORGE_TARGET = String.raw`(?:forge|build|request|authorization|permission|goal)`;
const CANCELLATION = String.raw`(?:revoke|withdraw|rescind|cancel|stop|pause|terminate|abort)`;
const CANCELLED = String.raw`(?:revoked|withdrawn|rescinded|cancelled|canceled|stopped|paused|terminated|aborted)`;
const NEGATED_ACTION = String.raw`(?:authorize|build|continue|resume|proceed(?:\s+with)?|execute|run|dispatch)`;
const CLAUSE_GAP = String.raw`[^.\n;]{0,96}`;

// A workflow message can pause generic work without withdrawing Forge
// authority. Keep explicit cancellation of generic work fail-closed.
const GENERIC_WORK_CANCELLATION = new RegExp(
    String.raw`(?:\b(?:revoke|withdraw|rescind|cancel|stop|terminate|abort)\b${CLAUSE_GAP}\bwork\b`
        + String.raw`|\bwork\b${CLAUSE_GAP}\b(?:revoked|withdrawn|rescinded|cancelled|canceled|stopped|terminated|aborted)\b)`,
    'i',
);

const CANCELLATION_BEFORE_TARGET = new RegExp(
    String.raw`\b${CANCELLATION}\b${CLAUSE_GAP}\b${FORGE_TARGET}\b`, 'i',
);
const TARGET_BEFORE_CANCELLATION = new RegExp(
    String.raw`\b${FORGE_TARGET}\b${CLAUSE_GAP}\b${CANCELLED}\b`, 'i',
);
const NEGATED_ACTION_WITH_TARGET = new RegExp(
    String.raw`\b(?:do\s+not|don't|never|must\s+not|no\s+longer)\s+${NEGATED_ACTION}\b${CLAUSE_GAP}\b${FORGE_TARGET}\b`,
    'i',
);

/** Shared fail-closed revocation predicate for durable Forge authority. */
export function isForgeAuthorityRevocation(text: string): boolean {
    return hasContradictoryForgeLaneInstruction(text)
        || NEGATED_ACTION_WITH_TARGET.test(text)
        || /^\s*(?:do\s+not|don't|never|must\s+not|no\s+longer)\s+(?:authorize|build|continue|resume|proceed|execute|run|dispatch)(?:\s+(?:it|this|that))?[.!]?\s*$/i.test(text)
        || /\b(?:goal|build|work)\s+should\s+not\s+(?:continue|resume|proceed|have\s+(?:continued|resumed|proceeded))\b/i.test(text)
        || CANCELLATION_BEFORE_TARGET.test(text)
        || TARGET_BEFORE_CANCELLATION.test(text)
        || GENERIC_WORK_CANCELLATION.test(text)
        || /^\s*(?:stop|pause|cancel|wait|hold\s+on)(?:\s+(?:it|this|that))?(?:[.!]|$)/i.test(text);
}
