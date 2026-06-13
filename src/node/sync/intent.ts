/**
 * Intent → CLI argv mapping (the "up" drain).
 *
 * The mapping is the security boundary: the worker only ever shells the
 * sanctioned pipeline CLI with an argv array built here. Operator-supplied
 * fields are passed as discrete argv elements (never interpolated into a
 * shell string), so they cannot inject commands.
 */

import { INTENT_ACTIONS, type IntentAction, type IntentDoc } from './types.js';

/**
 * Type guard for the closed set of supported actions.
 * @param action - The candidate action value from an intent document.
 * @returns True when the value is one of {@link INTENT_ACTIONS}.
 */
export function isIntentAction(action: unknown): action is IntentAction {
    return typeof action === 'string' && (INTENT_ACTIONS as readonly string[]).includes(action);
}

/**
 * Coerce a payload `notes` field to the string the CLI expects.
 * @param notes - Candidate notes value (may be absent / null / non-string).
 * @returns The notes string, or `''` when absent — matching `payload.notes ?? ""`.
 */
function normalizeNotes(notes: unknown): string {
    return typeof notes === 'string' ? notes : '';
}

/**
 * Map a queued intent to the pipeline CLI argv array.
 *
 * Throws (rather than shelling anything) when the action is outside the
 * supported set or a required field is missing — the caller marks such
 * intents `failed`.
 *
 * @param intent - The intent document drained from `intent_queue`.
 * @returns The CLI argv: subcommand followed by `--id` / `--notes` / `--payload` flags.
 */
export function mapIntentToArgv(intent: Pick<IntentDoc, 'action' | 'proposal_id' | 'payload'>): string[] {
    const { action } = intent;
    if (!isIntentAction(action)) {
        throw new Error(`Unsupported intent action: ${JSON.stringify(action)}`);
    }

    const proposalId = intent.proposal_id;
    if (typeof proposalId !== 'string' || proposalId.length === 0) {
        throw new Error('Intent is missing a string proposal_id');
    }

    const payload = intent.payload ?? null;

    if (action === 'edit') {
        if (payload === null || typeof payload !== 'object') {
            throw new Error('edit intent requires a payload object containing a `payload` spec');
        }
        const spec = (payload as Record<string, unknown>).payload;
        if (spec === undefined) {
            throw new Error('edit intent payload is missing the `payload` spec object');
        }
        const notes = normalizeNotes((payload as Record<string, unknown>).notes);
        return ['edit', '--id', proposalId, '--payload', JSON.stringify(spec), '--notes', notes];
    }

    // accept | decline | refine | dispatch: payload is { notes } | null.
    const notes = normalizeNotes(
        payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>).notes : null,
    );
    return [action, '--id', proposalId, '--notes', notes];
}
