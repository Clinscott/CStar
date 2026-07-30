export interface ScriptHeuristicFinding {
    code: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
}

export function auditScriptHeuristics(source: string): ScriptHeuristicFinding[] {
    const findings: ScriptHeuristicFinding[] = [];
    const lines = source.split('\n');
    const imports = lines.filter((line) => /^\s*import\b/.test(line)).length;
    const functions = Math.max(
        1,
        source.match(/\bfunction\b|=>|\b(?:get|set)\s+\w+\s*\(/g)?.length ?? 0,
    );
    const decisions = source.match(/\b(?:if|for|while|catch|case)\b|&&|\|\||\?(?![.?])/g)?.length ?? 0;
    const averageComplexity = (decisions + functions) / functions;
    const documentationLines = lines.filter((line) => (
        /^\s*(?:\/\/|\/\*|\*)/.test(line)
    )).length;

    if (averageComplexity > 15) {
        findings.push({
            code: 'logic.script.complexity',
            severity: 'HIGH',
            message: `GUNGNIR_LOGIC_BREACH: High average branch complexity (${averageComplexity.toFixed(1)}).`,
        });
    }
    if (imports > 10) {
        findings.push({
            code: 'logic.script.coupling',
            severity: 'MEDIUM',
            message: `GUNGNIR_COUPLING_BREACH: Over-entangled (${imports} imports).`,
        });
    }
    if (lines.length > 40 && documentationLines / lines.length < 0.05) {
        findings.push({
            code: 'intel.script.documentation',
            severity: 'MEDIUM',
            message: `GUNGNIR_INTEL_BREACH: Low documentation ratio (${(documentationLines / lines.length).toFixed(2)}).`,
        });
    }
    if (lines.some((line) => line.length > 180)) {
        findings.push({
            code: 'style.script.line-length',
            severity: 'LOW',
            message: 'GUNGNIR_STYLE_BREACH: Source contains a line longer than 180 characters.',
        });
    }
    return findings;
}
