import { Command } from 'commander';
import chalk from 'chalk';

import { getHallBead, upsertHallBead } from '../../../tools/pennyone/intel/bead_controller.js';
import type { HallBeadRecord, HallBeadStatus } from '../../../types/hall.js';
import type { SovereignBead } from '../../../types/bead.js';

function sovereignToRecord(bead: SovereignBead, nextStatus: HallBeadStatus, now: number): HallBeadRecord {
    return {
        bead_id: bead.id,
        repo_id: bead.repo_id,
        scan_id: bead.scan_id || undefined,
        target_kind: bead.target_kind,
        target_ref: bead.target_ref,
        target_path: bead.target_path,
        rationale: bead.rationale,
        contract_refs: bead.contract_refs,
        baseline_scores: bead.baseline_scores,
        acceptance_criteria: bead.acceptance_criteria,
        checker_shell: bead.checker_shell,
        status: nextStatus,
        assigned_agent: bead.assigned_agent,
        source_kind: bead.source_kind,
        triage_reason: bead.triage_reason,
        resolution_note: bead.resolution_note,
        resolved_validation_id: bead.resolved_validation_id,
        superseded_by: bead.superseded_by,
        architect_opinion: bead.architect_opinion,
        critique_payload: bead.critique_payload,
        metadata: bead.metadata,
        created_at: bead.created_at,
        updated_at: now,
    };
}

function applyBeadStatus(beadId: string, nextStatus: HallBeadStatus): void {
    const bead = getHallBead(beadId);
    if (!bead) {
        console.error(chalk.red(`[FAILURE]: Bead not found: ${beadId}`));
        process.exit(1);
    }
    const previous = bead.status;
    const now = Date.now();
    upsertHallBead(sovereignToRecord(bead, nextStatus, now));
    console.log(chalk.green(`[BEAD]: ${beadId} ${previous} → ${nextStatus}`));
}

export function registerBeadCommand(program: Command): void {
    const bead = program
        .command('bead')
        .description('Inspect and transition Hall beads between OPEN/SET-PENDING/SET.');

    bead
        .command('set <id>')
        .description('Mark a bead SET, releasing it for orchestrate dispatch.')
        .action((id: string) => {
            applyBeadStatus(id, 'SET');
        });

    bead
        .command('set-pending <id>')
        .description('Mark a bead SET-PENDING while awaiting critique or review.')
        .action((id: string) => {
            applyBeadStatus(id, 'SET-PENDING');
        });

    bead
        .command('unset <id>')
        .description('Return a bead to OPEN so it can be revised before release.')
        .action((id: string) => {
            applyBeadStatus(id, 'OPEN');
        });

    bead
        .command('show <id>')
        .description('Print the current status and core fields of a bead.')
        .action((id: string) => {
            const bead = getHallBead(id);
            if (!bead) {
                console.error(chalk.red(`[FAILURE]: Bead not found: ${id}`));
                process.exit(1);
            }
            console.log(chalk.cyan(`[BEAD] ${bead.id}`));
            console.log(chalk.dim(`  status         : `) + chalk.white(bead.status));
            console.log(chalk.dim(`  repo_id        : `) + chalk.white(bead.repo_id));
            if (bead.target_path) console.log(chalk.dim(`  target_path    : `) + chalk.white(bead.target_path));
            if (bead.target_kind) console.log(chalk.dim(`  target_kind    : `) + chalk.white(bead.target_kind));
            if (bead.acceptance_criteria) console.log(chalk.dim(`  acceptance     : `) + chalk.white(bead.acceptance_criteria));
            if (bead.assigned_agent) console.log(chalk.dim(`  assigned_agent : `) + chalk.white(bead.assigned_agent));
            console.log(chalk.dim(`  updated_at     : `) + chalk.white(new Date(bead.updated_at).toISOString()));
        });
}
