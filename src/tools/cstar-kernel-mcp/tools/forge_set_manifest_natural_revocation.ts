const REVOCATION_ACTIONS = ['stop', 'pause', 'cancel', 'revoke', 'withdraw'] as const;
const REVOCATION_TARGETS = ['it', 'this', 'that', 'the mission', 'this mission'] as const;
const CONTINUOUS_DENIALS = ['authorizing', 'permitting', 'allowing'] as const;
const SIMPLE_DENIALS = ['authorize', 'permit', 'allow'] as const;

const EXACT_NATURAL_SET_REVOCATIONS = new Set<string>([
    ...REVOCATION_ACTIONS,
    ...REVOCATION_ACTIONS.flatMap((action) => (
        REVOCATION_TARGETS.map((target) => `${action} ${target}`)
    )),
    ...CONTINUOUS_DENIALS.flatMap((action) => (
        REVOCATION_TARGETS.map((target) => `i am not ${action} ${target}`)
    )),
    ...SIMPLE_DENIALS.flatMap((action) => (
        REVOCATION_TARGETS.map((target) => `i do not ${action} ${target}`)
    )),
]);

function normalizeExactNaturalRevocation(text: string): string | null {
    if (/[^A-Za-z.! \t\r\n]/u.test(text)) return null;
    const normalized = text.replace(/[ \t\r\n]+/g, ' ').trim();
    const candidate = /[.!]$/u.test(normalized)
        ? normalized.slice(0, -1).trimEnd() : normalized;
    if (candidate.length === 0 || /[.!]$/u.test(candidate)) return null;
    return candidate.toLocaleLowerCase('en-US');
}

/** Finite full-record revocations for the one-use natural SET translation seam. */
export function isExactForgeNaturalSetRevocation(text: string): boolean {
    const normalized = normalizeExactNaturalRevocation(text);
    return normalized !== null && EXACT_NATURAL_SET_REVOCATIONS.has(normalized);
}
