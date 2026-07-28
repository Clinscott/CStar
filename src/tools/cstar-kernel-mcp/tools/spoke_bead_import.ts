import path from 'node:path';
import { normalizeHallPath, type HallBeadStatus, type HallBeadTargetKind } from '../../../types/hall.js';
import { database } from '../../pennyone/intel/database.js';
import { mcpMutation, textResponse } from '../contracts/responses.js';
import {
    compactBead,
    generateBeadId,
    requireString,
    resolveSpokeAnchor,
    resolveSpokeRelativePath,
} from './shared.js';
import { assertNewBeadAllowed } from './bead_lifecycle.js';

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
        const intent = requireString(args.intent, 'intent');
        const acceptance = requireString(args.acceptance_criteria, 'acceptance_criteria');
        const lorePath = requireString(args.lore_path, 'lore_path');

        const anchor = resolveSpokeAnchor(slug);
        if (!anchor.spoke) {
            throw new Error(`Spoke '${slug}' did not resolve to a Hall record.`);
        }

        const resolvedLore = resolveSpokeRelativePath(anchor.spoke, lorePath, 'lore_path');
        const resolvedDesignDoc = args.design_doc_path
            ? resolveSpokeRelativePath(anchor.spoke, args.design_doc_path, 'design_doc_path')
            : undefined;
        const relativeLorePath = normalizeHallPath(path.relative(anchor.spoke.root_path, resolvedLore));
        const relativeDesignDocPath = resolvedDesignDoc
            ? normalizeHallPath(path.relative(anchor.spoke.root_path, resolvedDesignDoc))
            : undefined;

        const targetPaths = (args.target_paths || []).filter((p) => p.trim().length > 0);
        const primaryTargetPath = targetPaths[0];
        const extraTargetPaths = targetPaths.slice(1);
        const targetKind = args.target_kind || (primaryTargetPath ? 'FILE' : 'SPOKE');
        const beadId = args.bead_id?.trim() || generateBeadId(intent);
        const initialStatus = args.status || 'OPEN';
        assertNewBeadAllowed(
            'spoke bead import',
            beadId,
            initialStatus,
            Boolean(database.getHallBead(beadId)),
        );
        const now = Date.now();

        const contractRefs = [
            ...(args.contract_refs || []),
            `lore:${relativeLorePath}`,
        ];

        const spokeMetadata: Record<string, unknown> = {
            ...(anchor.metadata || {}),
            lore_path: relativeLorePath,
            lore_absolute_path: resolvedLore,
        };
        if (resolvedDesignDoc && relativeDesignDocPath) {
            spokeMetadata.design_doc_path = relativeDesignDocPath;
            spokeMetadata.design_doc_absolute_path = resolvedDesignDoc;
        }
        if (args.wireframe_ref) {
            spokeMetadata.wireframe_ref = args.wireframe_ref;
        }
        if (args.threat_model_summary) {
            spokeMetadata.threat_model_summary = args.threat_model_summary.slice(0, 4000);
        }
        if (args.augury_block) {
            spokeMetadata.augury_block = args.augury_block.slice(0, 4000);
        }
        if (extraTargetPaths.length > 0) {
            spokeMetadata.extra_target_paths = extraTargetPaths;
        }

        database.upsertHallBead({
            bead_id: beadId,
            repo_id: anchor.repoId,
            target_kind: targetKind,
            target_ref: args.target_ref || primaryTargetPath || `spoke://${anchor.spoke.slug}`,
            target_path: primaryTargetPath,
            rationale: intent,
            contract_refs: contractRefs,
            baseline_scores: {},
            acceptance_criteria: acceptance,
            checker_shell: args.checker_shell,
            status: initialStatus,
            assigned_agent: args.assigned_agent,
            source_kind: 'MCP',
            metadata: {
                source: 'cstar-kernel-mcp:spoke_bead_import',
                ...spokeMetadata,
                ...(args.metadata || {}),
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
