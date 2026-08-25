import path from 'node:path';
import type { HallBeadStatus, HallBeadTargetKind } from '../../../types/hall.js';
import { database } from '../../pennyone/intel/database.js';
import { mcpMutation, textResponse } from '../contracts/responses.js';
import { resolveProspectiveRelativePathInside } from '../contracts/runtime.js';
import {
    compactBead,
    generateBeadId,
    requireString,
    resolveSpokeAnchor,
    resolveSpokeRelativePath,
} from './shared.js';
import { boundedBeadText, safeBeadChecker, safeBeadMetadata } from './bead.js';

export interface SpokeBeadImportArgs {
    spoke: string;
    bead_id?: string;
    intent: string;
    acceptance_criteria: string;
    lore_path: string;
    design_doc_path?: string;
    wireframe_ref?: string;
    threat_model_summary?: string;
    contract_refs?: string[];
    checker_shell?: string;
    target_paths?: string[];
    target_kind?: HallBeadTargetKind;
    target_ref?: string;
    augury_block?: string;
    assigned_agent?: string;
    status?: HallBeadStatus;
    metadata?: Record<string, unknown>;
}


export async function handleSpokeBeadImport(args: SpokeBeadImportArgs) {
    try {
        const slug = requireString(args.spoke, 'spoke');
        const intent = boundedBeadText(requireString(args.intent, 'intent'), 'intent')!;
        const acceptance = boundedBeadText(
            requireString(args.acceptance_criteria, 'acceptance_criteria'),
            'acceptance_criteria',
        )!;
        const lorePath = boundedBeadText(requireString(args.lore_path, 'lore_path'), 'lore_path', 1024)!;
        const callerMetadata = safeBeadMetadata(args.metadata);

        const anchor = resolveSpokeAnchor(slug);
        if (!anchor.spoke) {
            throw new Error(`Spoke '${slug}' did not resolve to a Hall record.`);
        }

        const resolvedLore = resolveSpokeRelativePath(anchor.spoke, lorePath, 'lore_path');
        const resolvedDesignDoc = args.design_doc_path
            ? resolveSpokeRelativePath(anchor.spoke, args.design_doc_path, 'design_doc_path')
            : undefined;

        if ((args.target_paths?.length ?? 0) > 20) throw new Error('target_paths_too_many');
        const targetPaths = (args.target_paths || [])
            .map((candidate) => boundedBeadText(candidate, 'target_path', 1024))
            .filter((candidate): candidate is string => Boolean(candidate))
            .map((candidate) => path.relative(
                anchor.spoke!.root_path,
                resolveProspectiveRelativePathInside(anchor.spoke!.root_path, candidate),
            ));
        const primaryTargetPath = targetPaths[0];
        const extraTargetPaths = targetPaths.slice(1);
        const targetKind = args.target_kind || (primaryTargetPath ? 'FILE' : 'SPOKE');
        const beadId = args.bead_id?.trim() || generateBeadId(intent);
        if (beadId.length > 240 || !/^[A-Za-z0-9._:-]+$/.test(beadId)) throw new Error('bead_id_invalid');
        const now = Date.now();

        if ((args.contract_refs?.length ?? 0) > 50) throw new Error('contract_refs_too_many');
        const contractRefs = [...new Set([
            ...(args.contract_refs || []).map((entry) => boundedBeadText(entry, 'contract_ref', 1024)!),
            `lore:${path.relative(anchor.spoke.root_path, resolvedLore)}`,
        ])];

        const spokeMetadata: Record<string, unknown> = {
            ...(anchor.metadata || {}),
            lore_path: path.relative(anchor.spoke.root_path, resolvedLore),
            lore_absolute_path: resolvedLore,
        };
        if (resolvedDesignDoc) {
            spokeMetadata.design_doc_path = path.relative(anchor.spoke.root_path, resolvedDesignDoc);
            spokeMetadata.design_doc_absolute_path = resolvedDesignDoc;
        }
        if (args.wireframe_ref) {
            spokeMetadata.wireframe_ref = boundedBeadText(args.wireframe_ref, 'wireframe_ref', 1024);
        }
        if (args.threat_model_summary) {
            spokeMetadata.threat_model_summary = boundedBeadText(
                args.threat_model_summary,
                'threat_model_summary',
            );
        }
        if (args.augury_block) {
            spokeMetadata.reported_augury_block = boundedBeadText(args.augury_block, 'augury_block');
            spokeMetadata.reported_augury_block_authoritative = false;
        }
        if (extraTargetPaths.length > 0) {
            spokeMetadata.extra_target_paths = extraTargetPaths;
        }

        database.upsertHallBead({
            bead_id: beadId,
            repo_id: anchor.repoId,
            target_kind: targetKind,
            target_ref: boundedBeadText(args.target_ref, 'target_ref', 1024)
                || primaryTargetPath
                || `spoke://${anchor.spoke.slug}`,
            target_path: primaryTargetPath,
            rationale: intent,
            contract_refs: contractRefs,
            baseline_scores: {},
            acceptance_criteria: acceptance,
            checker_shell: safeBeadChecker(args.checker_shell),
            status: args.status || 'OPEN',
            assigned_agent: boundedBeadText(args.assigned_agent, 'assigned_agent', 120),
            source_kind: 'MCP',
            metadata: {
                ...callerMetadata,
                ...spokeMetadata,
                source: 'cstar-kernel-mcp:spoke_bead_import',
            },
            created_at: now,
            updated_at: now,
        });

        return textResponse({
            status: 'created',
            action: 'spoke_bead_import',
            mutation: mcpMutation('spoke_bead_import', beadId, 'Spoke bead import was validated and persisted through the MCP write surface.'),
            spoke: anchor.spoke.slug,
            repo_id: anchor.repoId,
            bead: compactBead(database.getHallBead(beadId)),
        });
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
