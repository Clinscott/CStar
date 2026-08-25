import { parse } from '@babel/parser';

import {
    createGungnirMatrix,
    type GungnirMatrix,
} from '../../../types/gungnir.js';
import { isParseablePythonSource } from './python_syntax.js';
import { auditScriptHeuristics } from './script_rules.js';

const SCORE_MIN = 0;
const SCORE_MAX = 10;

export const GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS = [
    '.css',
    '.js',
    '.json',
    '.jsx',
    '.md',
    '.py',
    '.qmd',
    '.scss',
    '.ts',
    '.tsx',
    '.yaml',
    '.yml',
] as const;

export type GungnirCalculusExtension =
    (typeof GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS)[number];
export const SUPPORTED_GUNGNIR_EXTENSIONS: ReadonlySet<GungnirCalculusExtension> =
    new Set(GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS);
export type GungnirBreachSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface GungnirBreach {
    severity: GungnirBreachSeverity;
    code: string;
    message: string;
}

export interface GungnirCalculusResult {
    extension: GungnirCalculusExtension;
    coverage: 'heuristic';
    breaches: readonly GungnirBreach[];
    matrix: GungnirMatrix;
}

const severityPenalty: Readonly<Record<GungnirBreachSeverity, number>> = {
    LOW: 0.5,
    MEDIUM: 1.5,
    HIGH: 2.5,
    CRITICAL: 4,
};

function normalizeExtension(extension: string): GungnirCalculusExtension {
    const normalized = extension.toLowerCase();
    if (!SUPPORTED_GUNGNIR_EXTENSIONS.has(normalized as GungnirCalculusExtension)) {
        throw new RangeError(
            `Unsupported Gungnir file extension ${JSON.stringify(extension)}. `
            + `Supported extensions: ${GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS.join(', ')}`,
        );
    }
    return normalized as GungnirCalculusExtension;
}

function createBreach(
    code: string,
    severity: GungnirBreachSeverity,
    message: string,
): GungnirBreach {
    return Object.freeze({ severity, code, message });
}

function isParseable(source: string, extension: GungnirCalculusExtension): boolean {
    if (extension === '.py') {
        return isParseablePythonSource(source);
    }
    if (extension === '.json') {
        try {
            JSON.parse(source);
            return true;
        } catch {
            return false;
        }
    }
    if (['.js', '.jsx', '.ts', '.tsx'].includes(extension)) {
        try {
            parse(source, {
                sourceType: 'unambiguous',
                plugins: [
                    ...(extension === '.ts' || extension === '.tsx' ? ['typescript' as const] : []),
                    ...(extension === '.jsx' || extension === '.tsx' ? ['jsx' as const] : []),
                ],
            });
            return true;
        } catch {
            return false;
        }
    }
    return true;
}

function countPythonComplexity(source: string): number {
    const branchCount = source.split('\n').filter((line) => (
        /^\s*(?:if|elif|for|while|except|case)\b/.test(line)
        || /\b(?:and|or)\b/.test(line)
    )).length;
    const functionCount = Math.max(
        1,
        source.split('\n').filter((line) => /^\s*(?:async\s+)?def\s+/.test(line)).length,
    );
    return (branchCount + functionCount) / functionCount;
}

function findTopHeavyRatio(source: string): number | null {
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        const header = lines[index] ?? '';
        const match = /^(\s*)(?:async\s+)?def\s+/.exec(header);
        if (!match) continue;

        const headerIndent = match[1]?.length ?? 0;
        let setupSteps = 0;
        let executionSteps = 0;
        for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
            const line = lines[cursor] ?? '';
            if (!line.trim() || line.trimStart().startsWith('#')) continue;
            const indent = /^\s*/.exec(line)?.[0].length ?? 0;
            if (indent <= headerIndent) break;
            const trimmed = line.trim();
            if (/^(?:[A-Za-z_][\w.[\], ]*|\([^)]*\))\s*(?::[^=]+)?(?:[+\-*/%|&^]?=)(?!=)/.test(trimmed)) {
                setupSteps += 1;
            }
            if (/^(?:return|raise|yield)\b/.test(trimmed)
                || /^[A-Za-z_]\w*(?:\.\w+)*\s*\(/.test(trimmed)) {
                executionSteps += 1;
            }
        }
        if (executionSteps > 0 && setupSteps / executionSteps > 1.7) {
            return setupSteps / executionSteps;
        }
    }
    return null;
}

function auditPython(source: string): GungnirBreach[] {
    const breaches: GungnirBreach[] = [];
    const lines = source.split('\n');
    const complexity = countPythonComplexity(source);
    if (complexity > 15) {
        breaches.push(createBreach(
            'logic.python.complexity',
            'HIGH',
            `GUNGNIR_LOGIC_BREACH: High Complexity (${complexity.toFixed(1)}). Refactor God Methods.`,
        ));
    }

    const importCount = lines.filter((line) => (
        /^\s*import\s+\S+/.test(line) || /^\s*from\s+\S+\s+import\s+/.test(line)
    )).length;
    if (importCount > 10) {
        breaches.push(createBreach(
            'logic.python.coupling',
            'MEDIUM',
            `GUNGNIR_COUPLING_BREACH: Over-entangled (${importCount} imports). Isolate dependencies.`,
        ));
    }

    const documentationLines = lines.filter((line) => (
        /^(?:#|"""|''')/.test(line.trim())
    )).length;
    if (lines.length > 20 && documentationLines / lines.length < 0.15) {
        breaches.push(createBreach(
            'intel.python.documentation',
            'MEDIUM',
            `GUNGNIR_INTEL_BREACH: Low documentation ratio (${(documentationLines / lines.length).toFixed(2)}). Add intents/docstrings.`,
        ));
    }

    const topHeavyRatio = findTopHeavyRatio(source);
    if (topHeavyRatio !== null) {
        breaches.push(createBreach(
            'logic.python.balance',
            'MEDIUM',
            `GUNGNIR_LOGIC_BREACH: top-heavy setup detected (${topHeavyRatio.toFixed(1)}). Reduce preamble before execution.`,
        ));
    }

    let consecutiveLogicLines = 0;
    for (const line of lines) {
        if (line.trim() && !line.trimStart().startsWith('#')) {
            consecutiveLogicLines += 1;
            if (consecutiveLogicLines > 12) {
                breaches.push(createBreach(
                    'style.python.claustrophobia',
                    'LOW',
                    'GUNGNIR_STYLE_BREACH: Claustrophobic code block (>12 lines).',
                ));
                break;
            }
        } else {
            consecutiveLogicLines = 0;
        }
    }
    return breaches;
}

function auditJavaScriptFamily(source: string): GungnirBreach[] {
    const breaches: GungnirBreach[] = [];
    const elements = source.match(/<[a-zA-Z0-9]+/g)?.length ?? 0;
    const classMatches = [...source.matchAll(/className=["']([^"']+)["']/g)];
    const classes = classMatches.flatMap((match) => (match[1] ?? '').split(/\s+/).filter(Boolean));
    const complexity = Math.max(1, elements + new Set(classes).size);

    const arbitraryPixelCount = source.match(/-\[\d+px\]/g)?.length ?? 0;
    if (arbitraryPixelCount > 0) {
        breaches.push(createBreach(
            'style.ui.arbitrary-pixels',
            'CRITICAL',
            `GUNGNIR_UI_BREACH: Detection of arbitrary pixel sizes (${arbitraryPixelCount} counts). Use tokens.`,
        ));
    }

    const symmetricClasses = new Set([
        'flex',
        'grid',
        'justify-center',
        'items-center',
        'mx-auto',
        'text-center',
    ]);
    const order = classes.reduce(
        (total, className) => total + (symmetricClasses.has(className) ? 5 : 0),
        0,
    );
    if (elements > 5 && order / complexity < 0.25) {
        breaches.push(createBreach(
            'style.ui.birkhoff',
            'HIGH',
            `GUNGNIR_UI_BREACH: Low Birkhoff Measure (${(order / complexity).toFixed(2)}). Increase symmetry.`,
        ));
    }
    return breaches;
}

function auditStylesheet(source: string): GungnirBreach[] {
    const selectors = source.match(/}/g)?.length ?? 0;
    const properties = source.match(/:\s*[^;]+;/g)?.length ?? 0;
    const complexity = Math.max(1, selectors + properties);
    const variableUses = source.match(/var\(|--/g)?.length ?? 0;
    const order = variableUses * 3;
    return complexity > 10 && order / complexity < 0.15
        ? [createBreach(
            'style.stylesheet.tokens',
            'MEDIUM',
            `GUNGNIR_STYLE_BREACH: Stylistic Dissonance (M=${(order / complexity).toFixed(2)}). Use more CSS variables/tokens.`,
        )]
        : [];
}

function auditData(source: string): GungnirBreach[] {
    let depth = 0;
    let maxDepth = 0;
    for (const character of source) {
        if (character === '{' || character === '[') {
            depth += 1;
            maxDepth = Math.max(maxDepth, depth);
        } else if (character === '}' || character === ']') {
            depth -= 1;
        }
    }
    return maxDepth > 6
        ? [createBreach(
            'intel.data.nesting',
            'HIGH',
            `GUNGNIR_DATA_BREACH: Excessive data nesting (Depth: ${maxDepth}). Refactor for readability.`,
        )]
        : [];
}

function auditDocument(source: string): GungnirBreach[] {
    const paragraphCount = source.match(/\n\n/g)?.length ?? 0;
    const complexity = source.split('\n').length + paragraphCount;
    const headerCount = source.match(/^#+ /gm)?.length ?? 0;
    const alertCount = source.match(/^>\s*\[!/gm)?.length ?? 0;
    const order = (headerCount * 10) + (alertCount * 15);
    return complexity > 50 && order / complexity < 0.1
        ? [createBreach(
            'intel.document.structure',
            'MEDIUM',
            `GUNGNIR_DOCS_BREACH: Structure is too dense (M=${(order / complexity).toFixed(2)}). Add more headers or alerts.`,
        )]
        : [];
}

function collectBreaches(
    source: string,
    extension: GungnirCalculusExtension,
): readonly GungnirBreach[] {
    if (!isParseable(source, extension)) {
        return Object.freeze([createBreach(
            'logic.parse',
            'CRITICAL',
            'GUNGNIR_PARSE_ERROR: Source could not be parsed.',
        )]);
    }

    let breaches: GungnirBreach[];
    if (extension === '.py') {
        breaches = auditPython(source);
    } else if (extension === '.jsx' || extension === '.tsx') {
        breaches = [
            ...auditScriptHeuristics(source).map((finding) => createBreach(
                finding.code,
                finding.severity,
                finding.message,
            )),
            ...auditJavaScriptFamily(source),
        ];
    } else if (extension === '.js' || extension === '.ts') {
        breaches = auditScriptHeuristics(source).map((finding) => createBreach(
            finding.code,
            finding.severity,
            finding.message,
        ));
    } else if (extension === '.css' || extension === '.scss') {
        breaches = auditStylesheet(source);
    } else if (['.json', '.yaml', '.yml'].includes(extension)) {
        breaches = auditData(source);
    } else {
        breaches = auditDocument(source);
    }
    return Object.freeze(breaches);
}

function scoreBreaches(breaches: readonly GungnirBreach[]): GungnirMatrix {
    let logic = SCORE_MAX;
    let style = SCORE_MAX;
    let intel = SCORE_MAX;
    let evolution = SCORE_MAX;
    let anomaly = SCORE_MIN;

    for (const breach of breaches) {
        const penalty = severityPenalty[breach.severity];
        if (breach.code.startsWith('logic.')) {
            logic = Math.max(SCORE_MIN, logic - penalty);
        } else if (breach.code.startsWith('style.')) {
            style = Math.max(SCORE_MIN, style - penalty);
        } else {
            intel = Math.max(SCORE_MIN, intel - penalty);
        }
        evolution = Math.max(SCORE_MIN, evolution - (penalty * 0.25));
        if (breach.severity === 'CRITICAL') anomaly += 1;
    }

    return createGungnirMatrix({
        logic,
        style,
        intel,
        gravity: SCORE_MIN,
        vigil: SCORE_MAX,
        evolution,
        anomaly,
        sovereignty: Math.max(
            SCORE_MIN,
            Math.min(SCORE_MAX, (logic + style + intel + evolution) / 4),
        ),
    });
}

export function auditGungnirSource(
    source: string,
    extension: string,
): readonly GungnirBreach[] {
    return collectBreaches(source, normalizeExtension(extension));
}

export function scoreGungnirSource(
    source: string,
    extension: string,
): GungnirCalculusResult {
    const normalizedExtension = normalizeExtension(extension);
    const breaches = collectBreaches(source, normalizedExtension);
    return {
        extension: normalizedExtension,
        coverage: 'heuristic',
        breaches,
        matrix: scoreBreaches(breaches),
    };
}

export const evaluateGungnirSource = scoreGungnirSource;

export class GungnirCalculus {
    audit(source: string, extension: string): readonly GungnirBreach[] {
        return auditGungnirSource(source, extension);
    }

    score(source: string, extension: string): GungnirCalculusResult {
        return scoreGungnirSource(source, extension);
    }

    evaluate(source: string, extension: string): GungnirCalculusResult {
        return scoreGungnirSource(source, extension);
    }
}
