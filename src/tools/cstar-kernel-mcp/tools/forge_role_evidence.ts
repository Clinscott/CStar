const ROLE_ORDER = ['specifier', 'coder', 'cleaner', 'architect', 'hardener', 'qa'] as const;
const DIGEST = /^[a-f0-9]{64}$/;
const ZERO_DIGEST = '0'.repeat(64);
const ROLE_PLAN_SHA256 = '61e9b28d65ad80495bce567307dc8e577a5335d6897a46591efdd54b76b62d52';
const RECEIPT_KEYS = [
    'input_handoff_sha256', 'input_tokens', 'output_handoff_sha256', 'output_tokens',
    'phase', 'role', 'specification_handoff_sha256',
].sort();

export interface ForgeRoleReceiptEvidence {
    role: typeof ROLE_ORDER[number];
    phase: string;
    input_handoff_sha256: string;
    specification_handoff_sha256: string;
    output_handoff_sha256: string;
    input_tokens: number;
    output_tokens: number;
}

export interface ForgeRoleEvidenceProjection {
    valid: boolean;
    forge_topology: 'bounded-six-role-manifest-v1' | null;
    role_plan_sha256: string | null;
    role_receipts: ForgeRoleReceiptEvidence[] | null;
    provider_requests_started: number | null;
    provider_requests_completed: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
}

function boundedInteger(value: unknown, maximum: number): number | null {
    return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum
        ? Number(value) : null;
}

function projectReceipts(value: unknown): ForgeRoleReceiptEvidence[] | null {
    if (!Array.isArray(value) || value.length > ROLE_ORDER.length) return null;
    const projected: ForgeRoleReceiptEvidence[] = [];
    let previousOutput = ZERO_DIGEST;
    let specification = ZERO_DIGEST;
    for (let index = 0; index < value.length; index += 1) {
        const raw = value[index];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)
            || Object.keys(raw).sort().join('\0') !== RECEIPT_KEYS.join('\0')) return null;
        const receipt = raw as Record<string, unknown>;
        const inputTokens = boundedInteger(receipt.input_tokens, 1_000_000_000);
        const outputTokens = boundedInteger(receipt.output_tokens, 1_000_000_000);
        const output = receipt.output_handoff_sha256;
        if (receipt.role !== ROLE_ORDER[index] || receipt.phase !== `${index + 1}/${ROLE_ORDER.length}`
            || receipt.input_handoff_sha256 !== previousOutput
            || typeof output !== 'string' || !DIGEST.test(output)
            || inputTokens === null || outputTokens === null) return null;
        if (index === 0) specification = output;
        const expectedSpecification = index === 0 ? ZERO_DIGEST : specification;
        if (receipt.specification_handoff_sha256 !== expectedSpecification) return null;
        projected.push({
            role: ROLE_ORDER[index], phase: receipt.phase as string,
            input_handoff_sha256: receipt.input_handoff_sha256 as string,
            specification_handoff_sha256: expectedSpecification,
            output_handoff_sha256: output, input_tokens: inputTokens, output_tokens: outputTokens,
        });
        previousOutput = output;
    }
    return projected;
}

export function projectForgeRoleEvidence(
    envelope: Record<string, unknown> | null,
): ForgeRoleEvidenceProjection {
    const topology = envelope?.forge_topology === 'bounded-six-role-manifest-v1'
        ? envelope.forge_topology : null;
    const plan = envelope?.role_plan_sha256 === ROLE_PLAN_SHA256 ? ROLE_PLAN_SHA256 : null;
    const receipts = projectReceipts(envelope?.role_receipts);
    const started = boundedInteger(envelope?.provider_requests_started, ROLE_ORDER.length);
    const completed = boundedInteger(envelope?.provider_requests_completed, ROLE_ORDER.length);
    const inputTokens = boundedInteger(envelope?.input_tokens, 6_000_000_000);
    const outputTokens = boundedInteger(envelope?.output_tokens, 6_000_000_000);
    const receiptInput = receipts?.reduce((total, item) => total + item.input_tokens, 0) ?? -1;
    const receiptOutput = receipts?.reduce((total, item) => total + item.output_tokens, 0) ?? -1;
    const success = envelope?.status === 'ok';
    const valid = topology !== null && plan !== null && receipts !== null
        && started !== null && completed !== null && completed <= started
        && receipts.length <= completed && inputTokens !== null && outputTokens !== null
        && inputTokens >= receiptInput && outputTokens >= receiptOutput
        && (!success || (started === 6 && completed === 6 && receipts.length === 6
            && inputTokens === receiptInput && outputTokens === receiptOutput));
    return {
        valid, forge_topology: topology, role_plan_sha256: plan,
        role_receipts: receipts, provider_requests_started: started,
        provider_requests_completed: completed, input_tokens: inputTokens, output_tokens: outputTokens,
    };
}
