import { INTENT_CATEGORIES } from './chant_intent_grammar.js';

export interface ParsedTraceSelectionGate {
    raw_block: string;
    intent_category?: string;
    intent?: string;
    selection_tier?: string;
    selection_name?: string;
    trajectory_status?: string;
    trajectory_reason?: string;
    mimirs_well: string[];
    gungnir_verdict?: string;
    confidence?: number;
    confidence_source?: 'explicit' | 'missing' | 'synthetic';
    body?: string;
    canonical_intent: string;
    issues: string[];
}

export interface TraceSelectionGateValidation {
    valid: boolean;
    errors: string[];
    trace: ParsedTraceSelectionGate | null;
}

export const CORVUS_STAR_AUGURY_HEADER = '// Corvus Star Augury [Ω]';
export const LEGACY_TRACE_SELECTION_HEADER = '// Corvus Star Trace [Ω]';
export const TRACE_SELECTION_HEADER = CORVUS_STAR_AUGURY_HEADER;
export const TRACE_SELECTION_HEADERS = [
    CORVUS_STAR_AUGURY_HEADER,
    LEGACY_TRACE_SELECTION_HEADER,
] as const;

const TRACE_SELECTION_REQUIRED_FIELDS = [
    'Intent Category',
    'Intent',
    'Selection',
    'Trajectory',
    'Mimir\'s Well',
    'Gungnir Verdict',
] as const;

function compactTraceText(value: string | undefined): string | undefined {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    return normalized || undefined;
}

function splitTraceHeader(lines: string[]): { headerLines: string[]; bodyLines: string[] } {
    const headerLines: string[] = [lines[0] ?? ''];
    let bodyStart = lines.length;

    for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const trimmed = line.trim();

        if (!trimmed) {
            headerLines.push(line);
            bodyStart = index + 1;
            break;
        }

        if (/^[A-Za-z' ]+:\s/.test(line)) {
            headerLines.push(line);
            continue;
        }

        bodyStart = index;
        break;
    }

    return {
        headerLines,
        bodyLines: lines.slice(bodyStart),
    };
}

function parseTraceSelectionDirective(value: string | undefined): {
    tier?: string;
    name?: string;
    error?: string;
} {
    const trimmed = compactTraceText(value);
    if (!trimmed) {
        return { error: 'Selection is missing.' };
    }

    const match = trimmed.match(/^(SKILL|WEAVE|SPELL|PRIME)\s*:\s*(.+)$/i);
    if (!match) {
        return { error: 'Selection must follow "<TIER>: <name>".' };
    }

    const selectionName = compactTraceText(match[2]);
    if (!selectionName) {
        return { error: 'Selection path is missing.' };
    }

    return {
        tier: match[1].toUpperCase(),
        name: selectionName,
    };
}

function parseTraceTrajectory(value: string | undefined): {
    status?: string;
    reason?: string;
    error?: string;
} {
    const trimmed = compactTraceText(value);
    if (!trimmed) {
        return { error: 'Trajectory is missing.' };
    }

    const match = trimmed.match(/^(STABLE|OSCILLATING|FAILED)\s*:\s*(.+)$/i);
    if (!match) {
        return { error: 'Trajectory must follow "<STATE>: <reason>".' };
    }

    const reason = compactTraceText(match[2]);
    if (!reason) {
        return { error: 'Trajectory reason is missing.' };
    }

    return {
        status: match[1].toUpperCase(),
        reason,
    };
}

function parseTraceConfidence(value: string | undefined): {
    confidence?: number;
    error?: string;
} {
    const trimmed = compactTraceText(value);
    if (!trimmed) {
        return {};
    }

    const confidence = Number(trimmed);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        return { error: 'Confidence must be a number between 0.0 and 1.0.' };
    }

    return { confidence };
}

export function parseTraceSelectionGate(query: string): ParsedTraceSelectionGate | null {
    const trimmed = query.trim();
    if (!TRACE_SELECTION_HEADERS.some((header) => trimmed.startsWith(header))) {
        return null;
    }

    const lines = trimmed.split(/\r?\n/);
    const { headerLines, bodyLines } = splitTraceHeader(lines);
    const fieldValues: Record<string, string> = {};

    for (const line of headerLines.slice(1)) {
        const match = line.match(/^([A-Za-z' ]+):\s*(.*)$/);
        if (!match) {
            continue;
        }
        fieldValues[match[1].trim()] = match[2] ?? '';
    }

    const issues: string[] = [];
    for (const field of TRACE_SELECTION_REQUIRED_FIELDS) {
        if (!compactTraceText(fieldValues[field])) {
            issues.push(`Missing ${field}.`);
        }
    }

    const intentCategory = compactTraceText(fieldValues['Intent Category']);
    if (intentCategory && !INTENT_CATEGORIES[intentCategory.toUpperCase()]) {
        issues.push(`Intent Category '${intentCategory}' is not in the closed grammar.`);
    }

    const selection = parseTraceSelectionDirective(fieldValues.Selection);
    if (selection.error) {
        issues.push(selection.error);
    }

    const trajectory = parseTraceTrajectory(fieldValues.Trajectory);
    if (trajectory.error) {
        issues.push(trajectory.error);
    }

    const mimirsWell = compactTraceText(fieldValues["Mimir's Well"])
        ? compactTraceText(fieldValues["Mimir's Well"])!
            .split('|')
            .map((entry) => entry.replace(/^\s*◈\s*/, '').trim())
            .filter(Boolean)
        : [];
    if (compactTraceText(fieldValues["Mimir's Well"]) && mimirsWell.length === 0) {
        issues.push('Mimir\'s Well must contain at least one source.');
    }

    const confidenceResult = parseTraceConfidence(fieldValues.Confidence);
    if (confidenceResult.error) {
        issues.push(confidenceResult.error);
    }

    const body = compactTraceText(bodyLines.join(' '));
    const intent = compactTraceText(fieldValues.Intent);

    return {
        raw_block: headerLines.join('\n').trimEnd(),
        intent_category: intentCategory?.toUpperCase(),
        intent,
        selection_tier: selection.tier,
        selection_name: selection.name,
        trajectory_status: trajectory.status,
        trajectory_reason: trajectory.reason,
        mimirs_well: mimirsWell,
        gungnir_verdict: compactTraceText(fieldValues['Gungnir Verdict']),
        confidence: confidenceResult.confidence,
        confidence_source: confidenceResult.confidence === undefined ? 'missing' : 'explicit',
        body,
        canonical_intent: body ?? intent ?? '',
        issues,
    };
}

export function validateTraceSelectionGate(query: string): TraceSelectionGateValidation {
    const trace = parseTraceSelectionGate(query);
    if (!trace) {
        return {
            valid: false,
            errors: ['Missing // Corvus Star Augury [Ω] header.'],
            trace: null,
        };
    }

    const errors = trace.issues.filter(Boolean);
    return {
        valid: errors.length === 0,
        errors,
        trace,
    };
}

export function normalizeIntent(query: string): string {
    const trace = parseTraceSelectionGate(query);
    if (trace) {
        return trace.canonical_intent.replace(/\s+/g, ' ').trim();
    }

    return query.trim().replace(/\s+/g, ' ');
}
