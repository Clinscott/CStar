import chalk from 'chalk';

import type { HallPlanningSessionRecord } from '../../../types/hall.js';
import { formatTraceDesignation } from './trace_contract.js';
import { buildTraceFailuresPayload, buildTraceStatusPayload } from './trace_payload.js';
import type {
    AuguryDoctorPayload,
    AuguryExplainPayload,
    TraceAgentHandoffPayload,
    TraceFailuresPayload,
} from './trace_types.js';

export function renderTraceHandoffLines(handoff: TraceAgentHandoffPayload | null): string[] {
    if (!handoff) {
        return [chalk.dim('handoff=none')];
    }

    const lines = [
        chalk.cyan(`[HANDOFF] gate=${handoff.execution_gate} phase=${handoff.phase}`),
        chalk.dim(`next=${handoff.next_action}`),
        chalk.dim(`resume=${handoff.resume_command}`),
    ];

    const designation = formatTraceDesignation(handoff.designation);
    if (designation) {
        lines.push(chalk.dim(`designation=${designation}`));
    }
    if (handoff.designation?.intent_category) {
        lines.push(chalk.dim(`category=${handoff.designation.intent_category}`));
    }
    if (handoff.designation?.trajectory_status) {
        lines.push(chalk.dim(`trajectory=${handoff.designation.trajectory_status}`));
    }
    if (handoff.designation?.council_expert?.label) {
        lines.push(chalk.dim(`expert=${handoff.designation.council_expert.label}`));
    }
    if (handoff.designation?.council_expert?.selection_reason) {
        lines.push(chalk.dim(`expert_reason=${handoff.designation.council_expert.selection_reason}`));
    }
    if (handoff.designation?.council_expert?.anti_behavior?.length) {
        lines.push(chalk.dim(`anti=${handoff.designation.council_expert.anti_behavior.slice(0, 2).join(' ')}`));
    }

    if (handoff.lead_bead_id) {
        lines.push(chalk.dim(`lead_bead=${handoff.lead_bead_id}`));
    }
    if (handoff.target_paths.length > 0) {
        lines.push(chalk.dim(`targets=${handoff.target_paths.slice(0, 4).join(', ')}`));
    }
    if (handoff.validation_command) {
        lines.push(chalk.dim(`validate=${handoff.validation_command}`));
    }
    if (handoff.host_context?.note) {
        lines.push(chalk.dim(`note=${handoff.host_context.note}`));
    }

    return lines;
}

export function rewriteTraceDisplayLabel(line: string): string {
    return line
        .replace('[TRACE]', '[AUGURY]')
        .replace('[HANDOFF]', '[AUGURY_HANDOFF]')
        .replace('trace=none', 'augury=none')
        .replace('trace_failures=none', 'augury_failures=none');
}

export function renderAuguryStatusLines(session: HallPlanningSessionRecord | null, rootPath: string): string[] {
    return renderTraceStatusLines(session, rootPath).map(rewriteTraceDisplayLabel);
}

export function renderAuguryHandoffLines(handoff: TraceAgentHandoffPayload | null): string[] {
    return renderTraceHandoffLines(handoff).map(rewriteTraceDisplayLabel);
}

export function renderAuguryFailureLines(sessions: HallPlanningSessionRecord[], rootPath: string): string[] {
    return renderTraceFailureLines(sessions, rootPath).map(rewriteTraceDisplayLabel);
}


export function renderAuguryDoctorLines(payload: AuguryDoctorPayload): string[] {
    const lines = [
        chalk.cyan(`[AUGURY_DOCTOR] status=${payload.status} score=${payload.score} noise=${payload.noise_score}`),
        chalk.dim(`next=${payload.agent_next_action}`),
    ];
    for (const [name, check] of Object.entries(payload.checks)) {
        lines.push(chalk.dim(`${name}=${check.status} ${check.message}`));
    }
    return lines;
}

export function renderAuguryExplainLines(payload: AuguryExplainPayload): string[] {
    if (payload.status === 'missing') {
        return [
            chalk.cyan('[AUGURY_EXPLAIN] status=missing'),
            chalk.dim(`next=${payload.agent_next_action}`),
            ...payload.warnings.map((warning) => chalk.dim(`warning=${warning}`)),
        ];
    }
    const mimirTargets = payload.mimir?.targets ?? [];
    return [
        chalk.cyan('[AUGURY_EXPLAIN] status=available'),
        chalk.dim(`route=${payload.route?.designation ?? 'unknown'}`),
        chalk.dim(`scope=${payload.scope?.value ?? 'unknown'} basis=${payload.scope?.basis ?? 'unknown'}`),
        chalk.dim(`expert=${payload.expert?.label ?? payload.expert?.id ?? 'unknown'} basis=${payload.expert?.basis ?? 'unknown'}`),
        chalk.dim(`mimir=${mimirTargets.length > 0 ? mimirTargets.slice(0, 3).join(', ') : 'none'}`),
        chalk.dim(`mode=${payload.mode?.basis ?? 'unknown'}`),
        chalk.dim(`next=${payload.agent_next_action}`),
    ];
}


export function renderTraceStatusLines(session: HallPlanningSessionRecord | null, rootPath: string): string[] {
    const payload = buildTraceStatusPayload(session, rootPath);
    if (!payload) {
        return [chalk.dim('trace=none')];
    }

    const lines = [
        chalk.cyan(`[TRACE] ${payload.status} ${payload.handle ?? payload.session_id ?? 'unknown'}`),
        chalk.dim(`focus=${payload.focus}`),
        chalk.dim(`updated=${payload.updated_at_iso}`),
    ];

    if (payload.digest_badge) {
        lines.push(chalk.dim(`digest=${payload.digest_badge}`));
    }

    lines.push(chalk.dim(
        `beads total=${payload.bead_summary.total} set=${payload.bead_summary.set} open=${payload.bead_summary.open} review=${payload.bead_summary.review}`,
    ));
    lines.push(chalk.dim(`gate=${payload.agent_handoff.execution_gate}`));
    lines.push(chalk.dim(`resume=${payload.agent_handoff.resume_command}`));
    const auguryContract = payload.augury_contract ?? payload.trace_contract;
    const designation = formatTraceDesignation(auguryContract);
    if (designation) {
        lines.push(chalk.dim(`designation=${designation}`));
    }
    if (auguryContract?.intent_category) {
        lines.push(chalk.dim(`category=${auguryContract.intent_category}`));
    }
    if (auguryContract?.trajectory_status) {
        lines.push(chalk.dim(`trajectory=${auguryContract.trajectory_status}`));
    }
    if (auguryContract?.council_expert?.label) {
        lines.push(chalk.dim(`expert=${auguryContract.council_expert.label}`));
    }
    if (auguryContract?.council_expert?.selection_reason) {
        lines.push(chalk.dim(`expert_reason=${auguryContract.council_expert.selection_reason}`));
    }
    if (auguryContract?.council_expert?.anti_behavior?.length) {
        lines.push(chalk.dim(`anti=${auguryContract.council_expert.anti_behavior.slice(0, 2).join(' ')}`));
    }
    if (payload.lineage?.augury_designation_source ?? payload.lineage?.trace_designation_source) {
        lines.push(chalk.dim(`designation_source=${payload.lineage.augury_designation_source ?? payload.lineage.trace_designation_source}`));
    }

    if (payload.agent_handoff.lead_bead_id) {
        lines.push(chalk.dim(`lead_bead=${payload.agent_handoff.lead_bead_id}`));
    }
    if (payload.agent_handoff.target_paths.length > 0) {
        lines.push(chalk.dim(`targets=${payload.agent_handoff.target_paths.slice(0, 4).join(', ')}`));
    }
    if (payload.failure?.phase) {
        lines.push(chalk.dim(`failure_phase=${payload.failure.phase}`));
    }
    if (payload.failure?.error) {
        lines.push(chalk.dim(`failure_error=${payload.failure.error}`));
    }
    if (payload.failure?.recovery_hint) {
        lines.push(chalk.dim(`next=${payload.failure.recovery_hint}`));
    } else {
        lines.push(chalk.dim(`next=${payload.agent_handoff.next_action}`));
    }

    if (payload.agent_handoff.validation_command) {
        lines.push(chalk.dim(`validate=${payload.agent_handoff.validation_command}`));
    }
    if (payload.host_context?.note) {
        lines.push(chalk.dim(`note=${payload.host_context.note}`));
    }
    if (payload.artifacts.length > 0) {
        lines.push(chalk.dim(`artifacts=${payload.artifacts.slice(0, 4).join(', ')}`));
    }

    for (const group of payload.branches.slice(0, 4)) {
        const labels = group.labels.slice(0, 3).join(', ');
        lines.push(chalk.dim(
            `branch ${group.kind} x${group.count}${group.needs_revision ? ' rev' : ''}${labels ? ` labels=${labels}` : ''}`,
        ));
    }

    return lines;
}


export function renderTraceFailureLines(sessions: HallPlanningSessionRecord[], rootPath: string): string[] {
    const payload = buildTraceFailuresPayload(sessions, rootPath);
    if (payload.sessions.length === 0) {
        return [chalk.dim('trace_failures=none')];
    }

    const lines: string[] = [];
    payload.sessions.forEach((session, index) => {
        lines.push(chalk.cyan(`[TRACE] FAILED ${session.handle ?? session.session_id ?? 'unknown'} updated=${session.updated_at_iso}`));
        lines.push(chalk.dim(`focus=${session.focus ?? 'Failed planning session.'}`));
        lines.push(chalk.dim(
            `beads total=${session.bead_summary.total} set=${session.bead_summary.set} open=${session.bead_summary.open} review=${session.bead_summary.review}`,
        ));
        lines.push(chalk.dim(`gate=${session.agent_handoff.execution_gate}`));
        lines.push(chalk.dim(`resume=${session.agent_handoff.resume_command}`));
        if (session.failure?.phase) {
            lines.push(chalk.dim(`failure_phase=${session.failure.phase}`));
        }
        if (session.failure?.error) {
            lines.push(chalk.dim(`failure_error=${session.failure.error}`));
        }
        lines.push(chalk.dim(`next=${session.agent_handoff.next_action}`));
        if (index < payload.sessions.length - 1) {
            lines.push(chalk.dim('---'));
        }
    });
    return lines;
}

