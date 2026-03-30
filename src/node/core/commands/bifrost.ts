import { Command } from 'commander';
import chalk from 'chalk';

import { requestHostText, type HostTextResult } from '../../../core/host_intelligence.js';
import { resolveHostProvider, type HostProvider } from '../../../core/host_session.js';

export interface BifrostGuide {
    summary: string;
    primary_servers: string[];
    recommended_path: string;
}

export interface BifrostDependencies {
    hostTextInvoker?: (request: {
        prompt: string;
        systemPrompt?: string;
        projectRoot: string;
        source: string;
        env?: NodeJS.ProcessEnv;
        provider?: HostProvider | null;
    }) => Promise<HostTextResult>;
    projectRoot?: () => string;
}

function buildStaticGuide(): BifrostGuide {
    return {
        summary: 'Corvus Star exposes PennyOne and corvus-control as the primary MCP bridge surfaces.',
        primary_servers: ['pennyone', 'corvus-control'],
        recommended_path: 'Prefer MCP tools for Hall, runtime control, and system vitals before manual CLI replication.',
    };
}

function buildBifrostPrompt(provider: HostProvider): string {
    return [
        'You are explaining the current Corvus Star Bifrost bridge for an external host agent.',
        'Return strict JSON only.',
        JSON.stringify({
            provider,
            response_schema: {
                summary: 'string',
                primary_servers: ['string'],
                recommended_path: 'string',
            },
        }, null, 2),
    ].join('\n\n');
}

function parseBifrostGuide(raw: string): BifrostGuide {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        throw new Error('Bifrost host response did not return JSON.');
    }

    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const primaryServers = Array.isArray(parsed.primary_servers)
        ? parsed.primary_servers.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];
    const recommendedPath = typeof parsed.recommended_path === 'string' ? parsed.recommended_path.trim() : '';

    if (!summary || !recommendedPath || primaryServers.length === 0) {
        throw new Error('Bifrost host response omitted required guide fields.');
    }

    return {
        summary,
        primary_servers: primaryServers,
        recommended_path: recommendedPath,
    };
}

export function renderBifrostGuide(guide: BifrostGuide): string {
    const servers = guide.primary_servers.map((server) => `- ${server}`).join('\n');
    return [
        guide.summary,
        '',
        'Primary servers:',
        servers,
        '',
        `Recommended path: ${guide.recommended_path}`,
    ].join('\n');
}

async function resolveBifrostGuide(
    env: NodeJS.ProcessEnv,
    dependencies: BifrostDependencies = {},
): Promise<{ guide: BifrostGuide; provider: HostProvider | null; delegated: boolean }> {
    const provider = resolveHostProvider(env);
    if (!provider) {
        return {
            guide: buildStaticGuide(),
            provider: null,
            delegated: false,
        };
    }

    const hostTextInvoker = dependencies.hostTextInvoker ?? requestHostText;
    const projectRoot = dependencies.projectRoot?.() ?? process.cwd();
    try {
        const result = await hostTextInvoker({
            prompt: buildBifrostPrompt(provider),
            systemPrompt: 'Return strict JSON only.',
            projectRoot,
            source: 'cli:bifrost',
            env,
            provider,
        });
        return {
            guide: parseBifrostGuide(result.text),
            provider,
            delegated: true,
        };
    } catch {
        return {
            guide: buildStaticGuide(),
            provider,
            delegated: false,
        };
    }
}

/**
 * [🔱] BIFROST COMMAND SPOKE (v2.0)
 * Purpose: Explain the Bifrost Bridge (MCP Servers) through host-supervised bridge guidance.
 */
export function registerBifrostCommand(program: Command, dependencies: BifrostDependencies = {}): void {
    program
        .command('bifrost')
        .description('Explain the Model Context Protocol (MCP) / Bifrost Bridge integration')
        .action(async () => {
            const { guide, provider, delegated } = await resolveBifrostGuide(process.env, dependencies);

            console.log(chalk.cyan('\n ◤ THE BIFROST BRIDGE ◢ '));
            if (delegated && provider) {
                console.log(chalk.dim(`  ↳ Host-supervised bridge guidance via ${provider}.`));
            } else {
                console.log(chalk.dim('  ↳ Static bridge guidance (host session inactive or unavailable).'));
            }
            console.log(chalk.white(` ${guide.summary}`));
            console.log(chalk.magenta('\n Primary MCP servers:'));
            for (const server of guide.primary_servers) {
                console.log(chalk.yellow(`  ◈ ${server}`));
            }
            console.log(chalk.cyan(`\n [MANDATE]: ${guide.recommended_path}\n`));
        });
}

export {
    buildStaticGuide,
    parseBifrostGuide,
    resolveBifrostGuide,
};
