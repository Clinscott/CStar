import type {
    AutomaticMissionAuthorityBinding,
    AutomaticMissionRecord,
    AutomaticMissionSetGrant,
    RootUserInstructionInput,
    RootUserInstructionRecord,
} from '../../../types/automatic_mission.js';
import {
    AUTOMATIC_MISSION_SET_GRANT_SCHEMA,
} from '../../../types/automatic_mission.js';
import {
    canonicalizeRootUserInstructionRecords,
    hashAutomaticMissionRootRecordSet,
    hashAutomaticMissionRootMessage,
    sha256,
    stableAutomaticMissionJson,
} from './automatic_mission_schema.js';

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER_CHARACTER = /[\p{L}\p{N}_:./-]/u;
const QUOTE = /["“”‘’`]/u;
const NONOPERATIVE = /\b(?:if|whether|maybe|might|could|would|should|example|hypothetical|quoted|quotation|report|recommends|says|discuss|discussion|button\s+label|phrase|but|however|not\s+an\s+instruction|do\s+not\s+act|don't\s+act)\b/i;

export type AutomaticMissionGrantKind = 'mission' | 'receipt';

export interface AutomaticMissionAuthorityResult {
    binding: AutomaticMissionAuthorityBinding;
    grant: AutomaticMissionSetGrant;
}

export interface AutomaticMissionAuthorityInput {
    mission: AutomaticMissionRecord;
    root_user_records?: RootUserInstructionInput[];
    now?: number;
}

function requiredHash(value: unknown, name: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) {
        throw new Error(`automatic_mission_${name}_invalid`);
    }
    return value;
}

function normalizeText(value: string): string {
    const text = value.trim().replace(/\s+/g, ' ');
    return text.endsWith('.') ? text.slice(0, -1).trimEnd() : text;
}

function lower(value: string): string {
    return value.toLocaleLowerCase('en-US');
}

/** Identifier boundaries include the complete CStar identifier alphabet. */
export function containsExactMissionIdentifier(text: string, reference: string): boolean {
    const normalizedText = lower(text);
    const needle = lower(reference);
    let offset = normalizedText.indexOf(needle);
    while (offset >= 0) {
        const before = offset > 0 ? normalizedText[offset - 1] : undefined;
        const after = normalizedText[offset + needle.length];
        if ((!before || !IDENTIFIER_CHARACTER.test(before))
            && (!after || !IDENTIFIER_CHARACTER.test(after))) return true;
        offset = normalizedText.indexOf(needle, offset + needle.length);
    }
    return false;
}

export const containsExactInstructionReference = containsExactMissionIdentifier;

function containsRawReference(text: string, reference: string): boolean {
    return lower(text).includes(lower(reference));
}

function missionReferences(mission: Pick<AutomaticMissionRecord,
    'mission_id' | 'decision_id' | 'bead_id' | 'request_id' | 'request_sha256'>): string[] {
    return [mission.mission_id, mission.decision_id, mission.bead_id,
        mission.request_id, mission.request_sha256];
}

function hasAnyReference(text: string, mission: Pick<AutomaticMissionRecord,
    'mission_id' | 'decision_id' | 'bead_id' | 'request_id' | 'request_sha256'>): boolean {
    return missionReferences(mission).some((reference) => containsRawReference(text, reference));
}

export function isAutomaticMissionRevocation(text: string): boolean {
    const normalized = text.trim().replace(/\s+/g, ' ');
    return /^(?:(?:stop|pause|never\s+mind)|(?:cancel|revoke|withdraw|rescind|terminate|abort)(?:\s+(?:it|this|that))?|do\s+not\s+(?:proceed|continue|resume))[.!]?$/i
        .test(normalized)
        || /\b(?:revoke|withdraw|rescind|cancel|stop|pause|terminate|abort)\b[^.\n]{0,100}\b(?:mission|set|grant|authority|work|implement|execute|receipt)\b/i.test(text)
        || /\b(?:do\s+not|don't|never|must\s+not|not\s+authorized\s+to|not\s+authorizing|not\s+permitting|not\s+allowing)\b[^.\n]{0,120}\b(?:mission|set|grant|authorize|implement|execute|proceed|continue|resume|work)\b/i.test(text)
        || /^(?:i\s+am\s+)?not\s+(?:authorizing|permitting|allowing)\s+(?:this|that|it)[.!]?$/i.test(normalized)
        || /^i\s+do\s+not\s+authorize\s+(?:this|that|it)[.!]?$/i.test(normalized)
        || /\b(?:mission|work|build|grant|authorization)\b[^.\n]{0,80}\bshould\s+not\s+have\s+(?:continued|resumed|proceeded)\b/i.test(text);
}

export const isMissionAuthorityRevocation = isAutomaticMissionRevocation;

function missionTemplates(
    mission: Pick<AutomaticMissionRecord,
        'mission_id' | 'decision_id' | 'bead_id' | 'request_id' | 'request_sha256'>,
): Array<{ kind: AutomaticMissionGrantKind; text: string }> {
    return [
        {
            kind: 'mission',
            text: `Authorize cstar_mission ${mission.mission_id} for ${mission.decision_id} on ${mission.bead_id} now`,
        },
        {
            kind: 'mission',
            text: `Authorize mission ${mission.mission_id} for ${mission.decision_id} on ${mission.bead_id} now`,
        },
        {
            kind: 'mission',
            text: `Authorize the bounded mission ${mission.mission_id} for decision ${mission.decision_id} on bead ${mission.bead_id} now`,
        },
        {
            kind: 'mission',
            text: `Authorize SET ${mission.mission_id} for ${mission.decision_id} on ${mission.bead_id} now`,
        },
        {
            kind: 'mission',
            text: `Continue and implement ${mission.decision_id} on ${mission.bead_id} now`,
        },
        {
            kind: 'receipt',
            text: `Authorize and execute only ${mission.request_id} with request SHA-256 ${mission.request_sha256} for ${mission.bead_id} now`,
        },
    ];
}

export function buildAutomaticMissionInstructionText(
    mission: Pick<AutomaticMissionRecord,
        'mission_id' | 'decision_id' | 'bead_id' | 'request_id' | 'request_sha256'>,
    kind: AutomaticMissionGrantKind = 'mission',
): string {
    const match = missionTemplates(mission).find((candidate) => candidate.kind === kind);
    if (!match) throw new Error('automatic_mission_instruction_kind_invalid');
    return `${match.text}.`;
}

export const buildMissionInstructionText = buildAutomaticMissionInstructionText;

function exactTemplateKind(
    text: string,
    mission: Pick<AutomaticMissionRecord,
        'mission_id' | 'decision_id' | 'bead_id' | 'request_id' | 'request_sha256'>,
): AutomaticMissionGrantKind | null {
    const candidate = normalizeText(text).toLocaleLowerCase('en-US');
    for (const template of missionTemplates(mission)) {
        if (candidate === template.text.toLocaleLowerCase('en-US')) return template.kind;
    }
    return null;
}

export function classifyAutomaticMissionInstruction(
    text: string,
    mission: Pick<AutomaticMissionRecord,
        'mission_id' | 'decision_id' | 'bead_id' | 'request_id' | 'request_sha256'>,
): AutomaticMissionGrantKind | 'informational' | 'nonoperative' {
    if (isAutomaticMissionRevocation(text)) throw new Error('automatic_mission_authority_revoked');
    const kind = exactTemplateKind(text, mission);
    if (kind) return kind;
    if (!hasAnyReference(text, mission)) return 'informational';
    if (QUOTE.test(text) || text.includes('?') || NONOPERATIVE.test(text)) return 'nonoperative';
    if (missionReferences(mission).some((reference) =>
        containsRawReference(text, reference) && !containsExactMissionIdentifier(text, reference))) {
        return 'nonoperative';
    }
    return 'nonoperative';
}

function selectAuthorityRecord(
    records: RootUserInstructionRecord[],
    mission: Pick<AutomaticMissionRecord,
        'mission_id' | 'decision_id' | 'bead_id' | 'request_id' | 'request_sha256'>,
): { record: RootUserInstructionRecord; index: number; grantKind: AutomaticMissionGrantKind } {
    if (records.length === 0) throw new Error('automatic_mission_root_user_record_required');
    const matches: Array<{
        record: RootUserInstructionRecord;
        index: number;
        grantKind: AutomaticMissionGrantKind;
    }> = [];
    for (const [index, record] of records.entries()) {
        if (isAutomaticMissionRevocation(record.text)) {
            throw new Error('automatic_mission_authority_revoked');
        }
        const kind = classifyAutomaticMissionInstruction(record.text, mission);
        if (kind === 'nonoperative') {
            throw new Error('automatic_mission_authority_nonoperative_text');
        }
        if (kind === 'mission' || kind === 'receipt') {
            matches.push({ record, index, grantKind: kind });
        }
    }
    if (matches.length === 0) throw new Error('automatic_mission_authority_grant_missing');
    if (matches.length !== 1) throw new Error('automatic_mission_authority_ambiguous');
    return matches[0]!;
}

export function buildAutomaticMissionAuthorityBinding(
    mission: AutomaticMissionRecord,
    records: RootUserInstructionRecord[],
    selected: { record: RootUserInstructionRecord; index: number; grantKind: AutomaticMissionGrantKind },
): AutomaticMissionAuthorityBinding {
    const setHash = hashAutomaticMissionRootRecordSet(records);
    if (!setHash) throw new Error('automatic_mission_root_record_set_missing');
    requiredHash(setHash, 'root_record_set_hash');
    const messageSha256 = hashAutomaticMissionRootMessage(
        records,
        mission.compatibility_profile,
    );
    const bindingSha256 = sha256(stableAutomaticMissionJson({
        schema: 'cstar.mission_set_authority_binding.v1',
        grant_kind: selected.grantKind,
        mission_id: mission.mission_id,
        decision_id: mission.decision_id,
        bead_id: mission.bead_id,
        request_id: mission.request_id,
        request_sha256: mission.request_sha256,
        design_sha256: mission.design_sha256,
        constraints_sha256: mission.constraints_sha256,
        root_user_record_sha256: selected.record.record_sha256,
        root_user_record_set_sha256: setHash,
        root_user_record_count: records.length,
        selected_record_index: selected.index,
        thread_id: selected.record.thread_id,
        turn_id: selected.record.turn_id,
        message_sha256: messageSha256,
    }));
    return {
        grant_kind: selected.grantKind,
        selected_record_index: selected.index,
        selected_record_sha256: selected.record.record_sha256,
        record_set_sha256: setHash,
        record_count: records.length,
        message_sha256: messageSha256,
        binding_sha256: bindingSha256,
        thread_id: selected.record.thread_id,
        turn_id: selected.record.turn_id,
    };
}

function effectiveNumber(
    designValue: number | null,
    constraintValue: number | null,
    fallback: number,
    name: string,
): number {
    // Explicit mission constraints are the outer SET boundary; design values
    // cannot widen them or inherit spend from another mission.
    const value = constraintValue ?? designValue ?? fallback;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`automatic_mission_${name}_invalid`);
    return value;
}

export function buildAutomaticMissionSetGrant(
    mission: AutomaticMissionRecord,
    binding: AutomaticMissionAuthorityBinding,
    now = Date.now(),
): AutomaticMissionSetGrant {
    const design = mission.design;
    if (!design) throw new Error('automatic_mission_design_required');
    const rootTask = design.root_task;
    if (!rootTask) throw new Error('automatic_mission_root_task_required');
    const expiresAt = effectiveNumber(design.expires_at, mission.constraints.expires_at, 0, 'expiry');
    if (expiresAt <= now) throw new Error('automatic_mission_authority_expired');
    const retryCeiling = effectiveNumber(design.retry_ceiling, mission.constraints.retry_ceiling, 0, 'retry_ceiling');
    const attemptCeiling = effectiveNumber(design.attempt_ceiling, mission.constraints.attempt_ceiling, 1, 'attempt_ceiling');
    const spendCeiling = effectiveNumber(design.spend_ceiling, mission.constraints.spend_ceiling, 0, 'spend_ceiling');
    if (attemptCeiling < 1 || retryCeiling > attemptCeiling) {
        throw new Error('automatic_mission_authority_ceiling_invalid');
    }
    const grantMaterial = {
        schema: AUTOMATIC_MISSION_SET_GRANT_SCHEMA,
        mission_id: mission.mission_id,
        decision_id: mission.decision_id,
        bead_id: mission.bead_id,
        request_id: mission.request_id,
        design_sha256: requiredHash(mission.design_sha256, 'design_hash'),
        constraints_sha256: requiredHash(mission.constraints_sha256, 'constraints_hash'),
        root_task: rootTask,
        root_task_sha256: sha256(rootTask),
        targets: [...design.targets],
        outputs: [...design.outputs],
        prohibitions: [...design.prohibitions],
        retry_ceiling: retryCeiling,
        attempt_ceiling: attemptCeiling,
        spend_ceiling: spendCeiling,
        expires_at: expiresAt,
        root_user_thread_id: binding.thread_id,
        root_user_turn_id: binding.turn_id,
        root_user_record_sha256: requiredHash(binding.selected_record_sha256, 'root_record_hash'),
        root_user_record_set_sha256: requiredHash(binding.record_set_sha256, 'root_record_set_hash'),
        root_user_record_count: binding.record_count,
        selected_root_user_record_index: binding.selected_record_index,
        authority_binding_sha256: requiredHash(binding.binding_sha256, 'authority_binding_hash'),
        adapter: design.adapter,
        callback: design.callback,
        validator: design.validator,
    };
    const grantHash = sha256(stableAutomaticMissionJson(grantMaterial));
    return {
        ...grantMaterial,
        grant_id: `set-grant:cstar:${grantHash.slice(0, 32)}`,
        status: 'BOUND',
        issued_at: now,
    };
}

export function bindAutomaticMissionAuthority(
    input: AutomaticMissionAuthorityInput,
): AutomaticMissionAuthorityResult {
    const records = input.root_user_records
        ? canonicalizeRootUserInstructionRecords(
            input.root_user_records,
            input.mission.compatibility_profile,
        )
        : input.mission.root_user_records;
    const selected = selectAuthorityRecord(records, input.mission);
    const binding = buildAutomaticMissionAuthorityBinding(input.mission, records, selected);
    const grant = buildAutomaticMissionSetGrant(input.mission, binding, input.now ?? Date.now());
    return { binding, grant };
}

export const bindAutomaticMissionSet = bindAutomaticMissionAuthority;
export const authorizeAutomaticMission = bindAutomaticMissionAuthority;

function grantMaterial(grant: AutomaticMissionSetGrant): Record<string, unknown> {
    const {
        grant_id: _grantId,
        status: _status,
        issued_at: _issuedAt,
        consumed_at: _consumedAt,
        revoked_at: _revokedAt,
        revocation_reason: _reason,
        ...material
    } = grant;
    return material;
}

export function verifyAutomaticMissionSetGrant(
    mission: AutomaticMissionRecord,
    grant: AutomaticMissionSetGrant,
    now = Date.now(),
): void {
    if (grant.schema !== AUTOMATIC_MISSION_SET_GRANT_SCHEMA) {
        throw new Error('automatic_mission_grant_schema_invalid');
    }
    if (grant.mission_id !== mission.mission_id
        || grant.decision_id !== mission.decision_id
        || grant.bead_id !== mission.bead_id
        || grant.request_id !== mission.request_id
        || grant.design_sha256 !== mission.design_sha256
        || grant.constraints_sha256 !== mission.constraints_sha256) {
        throw new Error('automatic_mission_grant_scope_mismatch');
    }
    const design = mission.design;
    if (!design) throw new Error('automatic_mission_design_required');
    const retryCeiling = effectiveNumber(
        design.retry_ceiling, mission.constraints.retry_ceiling, 0, 'retry_ceiling',
    );
    const attemptCeiling = effectiveNumber(
        design.attempt_ceiling, mission.constraints.attempt_ceiling, 1, 'attempt_ceiling',
    );
    const spendCeiling = effectiveNumber(
        design.spend_ceiling, mission.constraints.spend_ceiling, 0, 'spend_ceiling',
    );
    const expiresAt = effectiveNumber(
        design.expires_at, mission.constraints.expires_at, 0, 'expiry',
    );
    if (!design.root_task || expiresAt <= 0
        || grant.root_task !== design.root_task
        || grant.root_task_sha256 !== sha256(design.root_task)
        || stableAutomaticMissionJson(grant.targets) !== stableAutomaticMissionJson(design.targets)
        || stableAutomaticMissionJson(grant.outputs) !== stableAutomaticMissionJson(design.outputs)
        || stableAutomaticMissionJson(grant.prohibitions) !== stableAutomaticMissionJson(design.prohibitions)
        || grant.retry_ceiling !== retryCeiling
        || grant.attempt_ceiling !== attemptCeiling
        || grant.spend_ceiling !== spendCeiling
        || grant.expires_at !== expiresAt
        || stableAutomaticMissionJson(grant.adapter) !== stableAutomaticMissionJson(design.adapter)
        || stableAutomaticMissionJson(grant.callback) !== stableAutomaticMissionJson(design.callback)
        || stableAutomaticMissionJson(grant.validator) !== stableAutomaticMissionJson(design.validator)) {
        throw new Error('automatic_mission_grant_scope_mismatch');
    }
    if (mission.root_user_records.length === 0
        || grant.root_user_record_set_sha256 !== mission.root_user_record_set_sha256) {
        throw new Error('automatic_mission_grant_root_binding_mismatch');
    }
    const selected = selectAuthorityRecord(mission.root_user_records, mission);
    const expectedBinding = buildAutomaticMissionAuthorityBinding(
        mission, mission.root_user_records, selected,
    );
    if (grant.authority_binding_sha256 !== expectedBinding.binding_sha256
        || grant.root_user_record_sha256 !== expectedBinding.selected_record_sha256
        || grant.selected_root_user_record_index !== expectedBinding.selected_record_index
        || grant.root_user_record_count !== expectedBinding.record_count
        || grant.root_user_thread_id !== expectedBinding.thread_id
        || grant.root_user_turn_id !== expectedBinding.turn_id) {
        throw new Error('automatic_mission_grant_root_binding_mismatch');
    }
    if (grant.status === 'REVOKED') throw new Error('automatic_mission_authority_revoked');
    if (grant.status === 'CONSUMED') throw new Error('automatic_mission_grant_replayed');
    if (grant.status === 'EXPIRED' || now >= grant.expires_at) {
        throw new Error('automatic_mission_authority_expired');
    }
    const materialHash = sha256(stableAutomaticMissionJson(grantMaterial(grant)));
    if (!grant.grant_id.endsWith(materialHash.slice(0, 32))) {
        throw new Error('automatic_mission_grant_binding_invalid');
    }
}

export function consumeAutomaticMissionSetGrant(
    mission: AutomaticMissionRecord,
    grant: AutomaticMissionSetGrant,
    now = Date.now(),
): AutomaticMissionSetGrant {
    verifyAutomaticMissionSetGrant(mission, grant, now);
    grant.status = 'CONSUMED';
    grant.consumed_at = now;
    return grant;
}

export const consumeAutomaticMissionGrant = consumeAutomaticMissionSetGrant;

export function revokeAutomaticMissionSetGrant(
    grant: AutomaticMissionSetGrant,
    reason = 'operator_revoked',
    now = Date.now(),
): AutomaticMissionSetGrant {
    if (grant.status === 'CONSUMED') throw new Error('automatic_mission_grant_replay_after_consume');
    if (!reason.trim()) throw new Error('automatic_mission_revocation_reason_required');
    grant.status = 'REVOKED';
    grant.revoked_at = now;
    grant.revocation_reason = reason.trim();
    return grant;
}

export const revokeAutomaticMissionGrant = revokeAutomaticMissionSetGrant;
