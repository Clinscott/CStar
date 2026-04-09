import fs from 'node:fs';
import path from 'node:path';
import {
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
    EngraveWeavePayload
} from '../contracts.ts';
import { saveHallEpisodicMemory, upsertHallBead, getHallBead } from '../../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.js';
import chalk from 'chalk';

/**
 * [Ω] ENGRAVE WEAVE
 * Purpose: Convert ephemeral .agents/memory/session_*.json files into structured Engram nodes.
 * Mandate: Fail-Fast, Fail-Verbose, and Atomically Persistent.
 */
export class EngraveWeave implements RuntimeAdapter<EngraveWeavePayload> {
    public readonly id = 'weave:engrave';

    public async execute(
        invocation: WeaveInvocation<EngraveWeavePayload>,
        context: RuntimeContext
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const memoryDir = path.join(projectRoot, '.agents', 'memory');
        const archiveDir = path.join(memoryDir, 'archive');

        // [🔱] THE FAIL-FAST CHECK: Environment
        if (!fs.existsSync(memoryDir)) {
             return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `[FAIL-FAST]: Memory directory not found at ${memoryDir}. Execution halted to prevent silent ghosting of engrams.`
            };
        }

        if (!fs.existsSync(archiveDir)) {
            try {
                fs.mkdirSync(archiveDir, { recursive: true });
            } catch (err: any) {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: `[FAIL-VERBOSE]: Failed to create archive directory at ${archiveDir}. Error: ${err.message}`
                };
            }
        }

        const sessionFiles = payload.session_file_path
            ? [payload.session_file_path]
            : fs.readdirSync(memoryDir)
                .filter(f => f.startsWith('session_') && f.endsWith('.json'))
                .map(f => path.join(memoryDir, f));

        if (sessionFiles.length === 0) {
            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: '[ENGRAVE]: No ephemeral session files found to engrave. The Hall remains current.',
                metadata: { files_processed: 0 }
            };
        }

        const repoId = buildHallRepositoryId(normalizeHallPath(projectRoot));
        let processedCount = 0;
        let eventCount = 0;
        let failureCount = 0;
        const errors: string[] = [];

        for (const filePath of sessionFiles) {
            try {
                const fileName = path.basename(filePath);
                const rawContent = fs.readFileSync(filePath, 'utf-8');

                // [🔱] THE FAIL-FAST PARSE
                let sessionData: any[];
                try {
                    sessionData = JSON.parse(rawContent);
                } catch (err: any) {
                    throw new Error(`[FAIL-VERBOSE] MALFORMED_JSON: ${err.message} at ${filePath}. Check for trailing commas or unclosed brackets.`);
                }

                if (!Array.isArray(sessionData)) {
                    throw new Error(`[FAIL-VERBOSE] INVALID_SCHEMA: Session file ${fileName} must be a JSON array, found ${typeof sessionData}.`);
                }

                // Process each event in the session
                for (const event of sessionData) {
                    if (event.cmd === 'forge_result' && event.result?.status === 'success') {
                        const now = Date.now();
                        const beadId = event.bead_id || `session:${fileName}:${event.ts || now}`;
                        const memoryId = `engram:${beadId}:${now}`;

                        // [🔱] THE FOREIGN KEY ANCHOR: Ensure parent bead exists
                        const existingBead = getHallBead(beadId);
                        if (!existingBead) {
                            upsertHallBead({
                                bead_id: beadId,
                                repo_id: repoId,
                                target_kind: 'RESTORED',
                                target_ref: event.cmd,
                                target_path: event.target || null,
                                rationale: event.task || 'Restored from ephemeral session file.',
                                status: 'COMPLETED',
                                source_kind: 'ENGRAVE',
                                created_at: (event.ts ? event.ts * 1000 : now),
                                updated_at: now
                            } as any);
                        }

                        saveHallEpisodicMemory({
                            memory_id: memoryId,
                            bead_id: beadId,
                            repo_id: repoId,
                            tactical_summary: event.task || event.result.message || 'Restored session engram.',
                            files_touched: event.target ? [event.target] : [],
                            successes: [event.result.message || 'Success'],
                            metadata: {
                                source: 'engrave',
                                session_file: fileName,
                                original_ts: event.ts,
                                event_kind: event.cmd,
                                ...event.metadata
                            },
                            created_at: now,
                            updated_at: now
                        });
                        eventCount++;
                    }
                }

                // [🔱] ATOMIC ARCHIVE
                const archivePath = path.join(archiveDir, fileName);
                try {
                    fs.renameSync(filePath, archivePath);
                } catch (err: any) {
                    throw new Error(`[FAIL-VERBOSE] ARCHIVE_FAILURE: Failed to move ${fileName} to archive. Error: ${err.message}`);
                }
                processedCount++;

            } catch (err: any) {
                failureCount++;
                errors.push(err.message);
                console.error(chalk.red(`[ENGRAVE] Critical Failure: ${err.message}`));
            }
        }

        if (failureCount > 0) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: `[ENGRAVE]: Processed ${processedCount} files, but ${failureCount} failed. ${eventCount} engrams saved.`,
                error: `[FAIL-VERBOSE]: The following critical errors occurred during engraving:\n${errors.join('\n')}`,
                metadata: {
                    files_processed: processedCount,
                    engrams_saved: eventCount,
                    files_failed: failureCount,
                    errors
                }
            };
        }

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: `[ENGRAVE]: Successfully engraved ${eventCount} engrams from ${processedCount} session files into the Hall.`,
            metadata: {
                files_processed: processedCount,
                engrams_saved: eventCount,
                files_failed: 0
            }
        };
    }
}
