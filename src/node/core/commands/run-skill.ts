import { Command } from 'commander';
import chalk from 'chalk';
import { buildTerminalSkillBlockError } from './dispatcher.js';
import { RuntimeDispatcher } from '../runtime/dispatcher.js';
import { SkillBead } from '../skills/types.js';
import { registry } from '../../../tools/pennyone/pathRegistry.js';
import { loadRegistryEntries, requiresTerminalExecution, resolveEntrySurface } from '../runtime/entry_surface.js';

function parseSkillParams(rawParams?: string): Record<string, unknown> {
    if (!rawParams) {
        return {};
    }
    const parsed = JSON.parse(rawParams) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : { value: parsed };
}

/**
 * [🔱] THE SKILL RUN COMMAND
 * Purpose: Authoritative CLI entrypoint for invoking Woven Skills.
 */
export function registerRunSkillCommand(program: Command) {
    program
        .command('run-skill <id>')
        .description('Directly invoke a Woven Skill by ID')
        .option('-t, --target <path>', 'Target path for the skill')
        .option('-i, --intent <string>', 'Intent override for the execution')
        .option('-p, --params <json>', 'JSON parameters for the skill')
        .action(async (id: string, _options: { target?: string, intent?: string, params?: string }) => {
            const projectRoot = registry.getRoot();
            const normalizedId = id.trim().toLowerCase();
            const registryEntry = loadRegistryEntries(projectRoot)[normalizedId];
            if (registryEntry) {
                const surface = resolveEntrySurface(registryEntry, normalizedId);
                if (surface === 'cli' && requiresTerminalExecution(registryEntry)) {
                    const dispatcher = RuntimeDispatcher.getInstance();
                    const bead: SkillBead = {
                        id: `CLI-RUN-${Date.now()}`,
                        skill_id: normalizedId,
                        target_path: _options.target || '.',
                        intent: _options.intent || `Direct CLI invocation of terminal-required skill ${normalizedId}`,
                        params: {
                            ...parseSkillParams(_options.params),
                            terminal_required: true,
                            source: 'cli',
                        },
                        status: 'PENDING',
                        priority: 1
                    };
                    const result = await dispatcher.dispatch(bead);
                    if (result.status === 'FAILURE') {
                        console.error(chalk.red(result.error ?? `Terminal-required skill '${normalizedId}' failed.`));
                    } else {
                        console.log(result.output);
                    }
                    return;
                }
                console.error(chalk.red(buildTerminalSkillBlockError(normalizedId, surface)));
                return;
            }

            console.error(chalk.red(
                `Capability '${normalizedId}' is not registered as a terminal-required capability. Terminal dispatch is forbidden for skills.`,
            ));
        });
}
