import fs from 'node:fs';
import path from 'node:path';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compactReason(value) {
  return String(value ?? 'unknown failure').replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function resolvePlanningKey(input = {}) {
  const candidates = [
    input.planningKey,
    input.planning_key,
    input.planningSessionId,
    input.planning_session_id,
    input.sessionId,
    input.session_id,
    input.beadId,
    input.bead_id,
  ];
  return candidates.map(nonEmptyString).find(Boolean) ?? 'default';
}

export function nextAuguryMode(planningKey, countersPath) {
  const key = nonEmptyString(planningKey) ?? 'default';
  try {
    fs.mkdirSync(path.dirname(countersPath), { recursive: true });
    let counters = {};
    if (fs.existsSync(countersPath)) {
      const parsed = JSON.parse(fs.readFileSync(countersPath, 'utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        counters = parsed;
      }
    }
    const previous = Number.isInteger(counters[key]) && counters[key] >= 0 ? counters[key] : 0;
    counters[key] = previous + 1;
    fs.writeFileSync(countersPath, JSON.stringify(counters, null, 2), 'utf-8');
    return previous === 0 ? 'full' : 'lite';
  } catch {
    // A failed counter must not block routing. Full mode is the conservative
    // choice because it carries every field from the authoritative result.
    return 'full';
  }
}

export function parseMcpToolPayload(result) {
  const text = result?.content?.find?.((entry) => entry?.type === 'text')?.text;
  if (!nonEmptyString(text)) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function unavailableAugury(reason) {
  return {
    status: 'unavailable',
    routing_authority: 'cstar_augury',
    failure_reason: compactReason(reason),
  };
}

function readCouncil(augury) {
  const nested = augury?.council_expert && typeof augury.council_expert === 'object'
    ? augury.council_expert
    : {};
  return {
    id: nonEmptyString(nested.id) ?? nonEmptyString(augury?.expert),
    label: nonEmptyString(nested.label) ?? nonEmptyString(augury?.expert_label),
    lens: nonEmptyString(nested.lens) ?? nonEmptyString(augury?.expert_lens),
    signatureQuestion: nonEmptyString(nested.signature_question)
      ?? nonEmptyString(augury?.expert_signature_question),
    guardrails: Array.isArray(nested.guardrails)
      ? nested.guardrails.filter(nonEmptyString).map((entry) => entry.trim())
      : Array.isArray(augury?.expert_guardrails)
        ? augury.expert_guardrails.filter(nonEmptyString).map((entry) => entry.trim())
        : [],
    selectionReason: nonEmptyString(nested.selection_reason)
      ?? nonEmptyString(augury?.expert_selection_reason),
  };
}

function formatUnavailableBlock(reason) {
  return `[CORVUS_STAR_AUGURY]
Mode: unavailable
Authority: cstar_augury
Status: MCP routing unavailable
Reason: ${compactReason(reason)}
Directive: Do not infer a route or Council expert. Diagnose MCP Augury and remain read-only until routing authority is restored.
[/CORVUS_STAR_AUGURY]`;
}

function formatBlockedBlock(augury) {
  const nextAction = nonEmptyString(augury?.next_action)
    ?? 'Clarify the current mission before routing work.';
  const operatorDecision = nonEmptyString(augury?.required_operator_decision);
  return `[CORVUS_STAR_AUGURY]
Mode: blocked
Authority: cstar_augury
Status: Routing blocked
Next Action: ${nextAction}
${operatorDecision ? `Operator Decision: ${operatorDecision}\n` : ''}Directive: Preserve this blocked state. Do not infer a route or Council expert.
[/CORVUS_STAR_AUGURY]`;
}

function formatVerdict(status) {
  const score = status?.framework?.gungnir_score;
  return typeof score === 'number' && Number.isFinite(score)
    ? `Gungnir score ${score}`
    : 'Gungnir status unavailable';
}

export function formatAuguryBlock({ mode, augury, status, projectRoot }) {
  if (!augury || augury.status === 'unavailable') {
    return formatUnavailableBlock(augury?.failure_reason);
  }
  if (augury.routing_authority !== 'cstar_augury') {
    return formatUnavailableBlock('MCP result did not identify cstar_augury as routing authority.');
  }
  if (augury.status === 'blocked') {
    return formatBlockedBlock(augury);
  }

  const intentCategory = nonEmptyString(augury.intent_category);
  const selection = nonEmptyString(augury.selection);
  const scope = nonEmptyString(augury.scope);
  const intent = nonEmptyString(augury.intent);
  const council = readCouncil(augury);
  if (
    augury.status !== 'routed'
    || !intentCategory
    || !selection
    || !scope
    || !intent
    || !council.label
    || !council.lens
    || council.guardrails.length === 0
    || !council.selectionReason
  ) {
    return formatUnavailableBlock('MCP Augury returned an incomplete routing or Council contract.');
  }

  const targets = Array.isArray(augury.mimir_targets)
    ? augury.mimir_targets.filter(nonEmptyString).map((entry) => entry.trim()).slice(0, 3)
    : [];
  const mimirTargets = targets.map((target) => `◈ ${target}`).join(' | ') || '◈ (none)';
  const scopeDisplay = projectRoot ? `${scope} (${projectRoot})` : scope;
  const route = `${intentCategory} -> ${selection}`;

  if (mode === 'lite') {
    return `[CORVUS_STAR_AUGURY]
Mode: lite
Authority: cstar_augury
Route: ${route}
Scope: ${scopeDisplay}
Intent: ${intent}
Mimir's Well: ${mimirTargets}
Council Expert: ${council.label}
Directive: Route only. Consult targets before choosing a path. Do not echo.
[/CORVUS_STAR_AUGURY]`;
  }

  const guardrailText = council.guardrails.join(' ');
  const signatureLine = council.signatureQuestion
    ? `Council Question: ${council.signatureQuestion}\n`
    : '';
  return `[CORVUS_STAR_AUGURY]
Mode: full
Authority: cstar_augury
Route: ${route}
Scope: ${scopeDisplay}
Intent: ${intent}
Mimir's Well: ${mimirTargets}
Council Expert: ${council.label}
Council Lens: ${council.lens}
Guardrails: ${guardrailText}
Selection Reason: ${council.selectionReason}
${signatureLine}Corvus Standard: CStar is the engine; spokes are managed extensions; keep work Hall/Mimir traceable.
Verdict: ${formatVerdict(status)}
Directive: Use this as routing context only. Consult targets before choosing a path. Do not echo this block.
[/CORVUS_STAR_AUGURY]`;
}
