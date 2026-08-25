import { randomUUID } from 'node:crypto';

import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS }
    from '../../../src/types/forge.js';
import { bindForgeMissionGrantEnvelopeMetadata }
    from '../../../src/tools/pennyone/intel/forge_mission_grant_envelope.js';
import { handleForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import {
    appendUserMessage,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    insertBead,
    parse,
    requestArgs,
    setupRoot,
} from './forge_natural_authorization_test_support.js';

export const MISSION_PARENT = 'bead:cstar:mission-compatibility:parent';
export const MISSION_CHILDREN = [
    'bead:cstar:mission-compatibility:01',
    'bead:cstar:mission-compatibility:02',
    'bead:cstar:mission-compatibility:03',
] as const;
export const MISSION_DECISION = 'decision:cstar:mission-compatibility';
export const MISSION_DESIGN = '6'.repeat(64);

type Root = ReturnType<typeof setupRoot>;
type Identity = Awaited<ReturnType<typeof verifyCodexRequestIdentity>>;
type Context = ReturnType<typeof validRequestContext>;

export interface MissionFixture {
    value: Root;
    session: ReturnType<typeof createSession>;
    setContext: Context;
    setIdentity: Identity;
}

function mutationIdentity(identity: Identity) {
    return {
        source: 'codex_request_meta',
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        turn_record_set_sha256: identity.turn_record_set_sha256,
    };
}

function writeMetadata(value: Root, beadId: string, metadata: object): void {
    value.db.prepare('UPDATE hall_beads SET metadata_json = ? WHERE bead_id = ?')
        .run(JSON.stringify(metadata), beadId);
}

export function rewriteMissionMetadata(
    fixture: MissionFixture,
    beadId: string,
    update: (metadata: Record<string, any>) => void,
): void {
    const raw = fixture.value.db.prepare(
        'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
    ).pluck().get(beadId) as string;
    const metadata = JSON.parse(raw) as Record<string, any>;
    update(metadata);
    writeMetadata(fixture.value, beadId, metadata);
}

export function writeMissionChildIdentity(
    fixture: MissionFixture,
    index: number,
    identity: Identity,
): void {
    const child = MISSION_CHILDREN[index]!;
    writeMetadata(fixture.value, child, {
        source: 'cstar-kernel-mcp',
        parent_bead_id: MISSION_PARENT,
        order: index + 1,
        depends_on: index === 0 ? [] : [MISSION_CHILDREN[index - 1]],
        design_sha256: MISSION_DESIGN,
        owning_lane: 'Forge',
        mutation_request_identity: mutationIdentity(identity),
    });
}

export async function createMissionFixture(
    label: string,
    childCount = 2,
): Promise<MissionFixture> {
    const value = setupRoot(`mission-compat-${label}`);
    const session = createSession({
        textParts: ['SET'],
        timestamp: new Date(Date.now() - 30_000).toISOString(),
    });
    const setContext = validRequestContext(session.threadId, session.turnId);
    const setIdentity = await verifyCodexRequestIdentity(setContext);
    const children = MISSION_CHILDREN.slice(0, childCount);
    insertBead(value, MISSION_PARENT, MISSION_DECISION);
    children.forEach((child, index) => insertBead(
        value, child, `${MISSION_DECISION}:batch-${index + 1}`,
    ));
    writeMetadata(value, MISSION_PARENT, bindForgeMissionGrantEnvelopeMetadata({
        source: 'cstar-kernel-mcp',
        schema: 'cstar.set_manifest.v1',
        decision_id: MISSION_DECISION,
        design_revision: 1,
        design_sha256: MISSION_DESIGN,
        batch_order: children,
        operator_set: true,
        mission_grant_envelope: {
            schema: 'cstar.forge_mission_grant_envelope.v1',
            allowed_targets: [value.target],
            allowed_outputs: [value.target],
            allowed_actions: ['response_only', 'validation_artifacts'],
            prohibited_actions: [
                ...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS,
                'project_files',
                'authorized_source_collection',
            ],
            adapter_ref: 'cstar-forge-hermes-minimax-adapter',
            write_capability: 'response_only',
            total_provider_attempt_ceiling: childCount,
            retry_derived_iteration_ceiling: 0,
            paid_attempt_ceiling: childCount,
        },
        mutation_request_identity: mutationIdentity(setIdentity),
    }));
    const fixture = { value, session, setContext, setIdentity };
    children.forEach((_, index) => writeMissionChildIdentity(fixture, index, setIdentity));
    return fixture;
}

export async function requestMissionChild(
    fixture: MissionFixture,
    index: number,
    context: Context = fixture.setContext,
    mutate?: (args: ReturnType<typeof requestArgs>) => void,
): Promise<Record<string, any>> {
    const args = requestArgs(
        fixture.value,
        MISSION_CHILDREN[index]!,
        `${MISSION_DECISION}:batch-${index + 1}`,
        fixture.session.threadId,
    );
    mutate?.(args);
    return parse(await handleForgeRequest(args, context));
}

export function structuralMissionContext(fixture: MissionFixture): Context {
    return validRequestContext(fixture.session.threadId, randomUUID());
}

export function appendMissionTurn(
    fixture: MissionFixture,
    text: string,
    offsetMs = 20_000,
): Context {
    const turnId = randomUUID();
    appendUserMessage(
        fixture.session.sessionFile,
        turnId,
        text,
        new Date(Date.parse(fixture.session.timestamp) + offsetMs).toISOString(),
    );
    return validRequestContext(fixture.session.threadId, turnId);
}

export function appendSetTurnRecord(
    fixture: MissionFixture,
    text: string,
    offsetMs = 1_000,
): void {
    appendUserMessage(
        fixture.session.sessionFile,
        fixture.session.turnId,
        text,
        new Date(Date.parse(fixture.session.timestamp) + offsetMs).toISOString(),
    );
}
