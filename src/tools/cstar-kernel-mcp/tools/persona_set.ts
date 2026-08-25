import { parseCanonicalPersona, type CanonicalPersona } from '../../../core/persona_contract.js';
import {
    readCanonicalPersonaState,
    setCanonicalPersonaState,
} from '../../pennyone/intel/persona_state.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { readBoundedConfiguredPersonaState } from '../../pennyone/persona_projection.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';

export interface PersonaSetArgs {
    persona: CanonicalPersona;
    expected_current?: CanonicalPersona;
}

function parseExpectedCurrent(value: unknown): CanonicalPersona | undefined {
    if (value === undefined) return undefined;
    const persona = parseCanonicalPersona(value);
    if (!persona) throw new Error('expected_current_canonical_value_required');
    return persona;
}

function readMigrationCurrent(root: string): CanonicalPersona | null {
    const configured = readBoundedConfiguredPersonaState(root);
    if (configured.status === 'projected') return configured.active_persona;
    if (configured.status === 'absent') return null;
    if (configured.status === 'invalid') throw new Error('persona_migration_config_invalid');
    throw new Error('persona_migration_reader_unavailable');
}

export async function handlePersonaSet(
    args: PersonaSetArgs,
    requestContext?: McpRequestContext,
): Promise<McpTextResponse> {
    try {
        const persona = parseCanonicalPersona(args.persona);
        if (!persona) throw new Error('persona_canonical_value_required');
        const expectedCurrent = parseExpectedCurrent(args.expected_current);
        await verifyCodexRequestIdentity(requestContext);

        const root = registry.getRoot();
        const canonical = readCanonicalPersonaState(root);
        if (canonical.status === 'invalid') throw new Error('persona_state_invalid');
        if (canonical.status === 'unavailable') throw new Error('persona_state_unavailable');
        const migrationCurrent = canonical.status === 'absent'
            ? readMigrationCurrent(root)
            : null;
        return textResponse(setCanonicalPersonaState(
            root,
            persona,
            expectedCurrent,
            migrationCurrent,
        ));
    } catch (error) {
        return errorResponse(error);
    }
}
