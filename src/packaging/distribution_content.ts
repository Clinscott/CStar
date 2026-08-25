import fs from 'node:fs';
import path from 'node:path';

import type { CapabilityExport } from './distributions.js';
import { CSTAR_KERNEL_TOOL_CATALOG } from '../tools/cstar-kernel-mcp/contracts/tool_catalog.js';

interface PackageMetadata {
    name?: string;
    version?: string;
    codexPluginVersion?: string;
    description?: string;
    homepage?: string;
    repository?: string | { url?: string };
    license?: string;
    author?: string | {
        name?: string;
        email?: string;
        url?: string;
    };
    keywords?: string[];
}

interface McpServerConfig {
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
    note?: string;
}

function loadPackageMetadata(projectRoot: string): PackageMetadata {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')) as PackageMetadata;
}

function getRepositoryUrl(repository: PackageMetadata['repository']): string {
    if (typeof repository === 'string') {
        return repository;
    }
    return repository?.url ?? '';
}

function getAuthor(metadata: PackageMetadata): { name: string; email?: string; url?: string } {
    if (typeof metadata.author === 'string') {
        return {
            name: metadata.author,
        };
    }

    return {
        name: metadata.author?.name ?? 'Corvus Star',
        email: metadata.author?.email,
        url: metadata.author?.url,
    };
}

function formatCapabilityLine(entry: CapabilityExport): string {
    const fallbackSuffix = entry.allowKernelFallback ? 'kernel fallback allowed' : 'kernel fallback forbidden';
    return `- \`${entry.id}\` (${entry.tier}, ${entry.hostSupportStatus}, ${entry.ownershipModel}, ${fallbackSuffix})`;
}

export function buildGeminiManifestContent(projectRoot: string): string {
    const metadata = loadPackageMetadata(projectRoot);

    return `${JSON.stringify({
        name: 'corvus-star',
        version: metadata.version ?? '0.0.0',
        description: 'Corvus Star host-native extension with Hall discovery, Augury routing, and kernel-backed CStar control.',
        contextFileName: 'GEMINI.md',
        mcpServers: buildGeminiMcpServers(),
    }, null, 2)}\n`;
}

function buildAuguryDisplaySection(): string[] {
    return [
        '## Corvus Star Augury [\u03a9]',
        '- Augury is a read-only typed route explanation, not permission, ownership, a vote, or a generic trace ritual.',
        '- Use `cstar_augury` only when route or material scope is ambiguous; reuse fresh mission state otherwise.',
        '- Council experts are advisory critique lenses. They cannot authorize work or turn synthetic evidence into proof.',
        '- TokenPath is quarantined. It cannot advise, steer, emit confidence, or accept observation writes until independently promoted.',
        '- Omit numeric confidence unless an independently validated scorer supplies a nonzero denominator, exclusions, class coverage, formula, row evidence, and provenance.',
        '- Foundational CStar work uses `Scope: brain:CStar`; use `Scope: spoke:<name>` only when a spoke is explicit.',
        '- Do not echo a full Augury block unless the operator asks for the route packet.',
        '',
    ];
}

export function buildGeminiContextContent(projectRoot: string, capabilities: CapabilityExport[]): string {
    const metadata = loadPackageMetadata(projectRoot);
    const commands = [
        '`./cstar <command>`',
        '`node bin/cstar.js <command>`',
        '`./cstar hall "<query>"`',
    ];
    const topCapabilities = capabilities.slice(0, 12).map(formatCapabilityLine);

    return [
        '# Corvus Star',
        '',
        `> Host-native Gemini CLI extension for the authoritative CStar runtime.`,
        '',
        '## Identity',
        `- Package: \`${metadata.name ?? 'corvusstar'}\` v${metadata.version ?? '0.0.0'}`,
        '- Persona: read only `cstar_status.persona`; apply O.D.I.N. as build-run-repair and A.L.F.R.E.D. as secure-harden guidance without changing authority or operator gates.',
        `- Repository: \`${getRepositoryUrl(metadata.repository) || 'local workspace'}\``,
        '',
        '## Authority Order',
        '- Apply platform safety and the current operator grant first, then the applicable global and nearest-repository `AGENTS.md`, repository runbooks, and current CStar lifecycle state.',
        '- Registries declare capabilities and observed runtime is evidence. Neither can grant authority or weaken a gate.',
        '- Prefer `cstar-kernel` MCP surfaces before shell launchers or broad local scans.',
        '- Use `cstar_bead` for bead lifecycle when it is available.',
        '',
        '## Launcher Contract',
        '- Use `cstar-kernel` MCP tools first for CStar control-plane work.',
        ...commands.map((command) => `- ${command}`),
        '',
        '## Host Behavior',
        '- Read the applicable global and nearest-repository `AGENTS.md` before making structural claims.',
        '- Use `cstar_doctor` when health is unknown, `cstar_handoff` when resuming, `cstar_augury` when route or scope is ambiguous, and at most one broad `cstar_hall_search` before narrowing.',
        '- Use `./cstar hall "<query>"` only when MCP cannot provide the needed primitive and terminal use is explicitly allowed.',
        '- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.',
        '- Use `cstar_goal_resume` only for an explicit root-user continuation signal when the host lacks a blocked-to-active transition; it records continuity and does not mutate host state or grant new authority.',
        '- If the MCP surface is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.',
        '- CoS coordinates estate sequencing and bounded Green/Yellow execution. Forge builds implementation; Researcher gathers evidence through authorized lanes.',
        '- Start or resume one host goal for every non-trivial mission, keep one plan step in progress, and close the goal only after CStar lifecycle state and validation agree.',
        '- Before the first CStar mutation or provider attempt of each local day, follow `docs/operations/cstar-goal-driven-daily-bootstrap.md` for Codex-host and explicitly selected legacy-adapter freshness; updates do not authorize a restart.',
        '- PMTs are project-scoped information repositories only. MM is inactive and has no active routing, synthesis, ownership, relay, review, or execution role.',
        '- Preserve operator gates for acceptance, dispatch, commit, push, merge, deletion, restarts, and publish actions.',
        '- Keep reasoning, planning, critique, and recovery in the host session when the registry marks a capability host-executable.',
        '- Keep deterministic local primitives in the kernel; do not fork Gemini-specific capability definitions.',
        '- Treat `native-session` and `exec-bridge` capabilities as host-routed, and treat `supported` capabilities as kernel-backed launch surfaces.',
        '- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.',
        '- Public host fronts marked with kernel fallback forbidden must fail closed when no host session is active; they must not degrade into legacy kernel cognition.',
        '- Persona is non-authoritative process guidance. Read only `cstar_status.persona`; O.D.I.N. means build-run-repair and A.L.F.R.E.D. means secure-harden. Omit it when unavailable.',
        '',
        ...buildAuguryDisplaySection(),
        ...buildKernelMcpToolsSection(),
        `## Exported Gemini Capabilities (${capabilities.length})`,
        ...(topCapabilities.length > 0 ? topCapabilities : ['- None exported.']),
        '',
        '## Notes',
        '- This extension is generated from the registry-backed distribution builder.',
        '- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.',
        '- The `cstar-kernel` MCP server is wired up by `mcpServers` in `gemini-extension.json` — invoke kernel tools directly through MCP, not via shell, whenever the needed primitive exists.',
        '',
    ].join('\n');
}

export function buildCodexPluginManifestContent(projectRoot: string): string {
    const metadata = loadPackageMetadata(projectRoot);
    const author = getAuthor(metadata);
    const repositoryUrl = getRepositoryUrl(metadata.repository);

    return `${JSON.stringify({
        name: 'corvus-star',
        version: metadata.codexPluginVersion ?? metadata.version ?? '0.0.0',
        description: 'Host-native Corvus Star Augury, Hall, and CStar runtime integration.',
        author,
        homepage: metadata.homepage ?? repositoryUrl,
        repository: repositoryUrl,
        license: metadata.license ?? 'UNLICENSED',
        keywords: ['corvus', 'cstar', ...(metadata.keywords ?? [])],
        skills: './skills/',
        interface: {
            displayName: 'Corvus Star',
            shortDescription: 'Corvus Star Augury and Hall integration for Codex.',
            longDescription: 'Routes Codex through CStar with bounded Hall discovery, advisory Augury explanations, and explicit host/kernel authority boundaries.',
            developerName: author.name,
            category: 'Developer Tools',
            capabilities: ['Interactive', 'Write'],
            websiteURL: metadata.homepage ?? repositoryUrl,
            privacyPolicyURL: metadata.homepage ?? repositoryUrl,
            termsOfServiceURL: metadata.homepage ?? repositoryUrl,
            defaultPrompt: [
                'Apply the current operator grant and Corvus authority order before CStar lifecycle state.',
                'Use CStar kernel tools for bounded control-plane work and narrow Hall discovery.',
                'Do not emit numeric Augury confidence without independently validated scoring evidence.',
            ],
            brandColor: '#0F6E5B',
        },
    }, null, 2)}\n`;
}

export function buildCodexPluginSkillContent(capabilities: CapabilityExport[]): string {
    const topCapabilities = capabilities.slice(0, 12).map(formatCapabilityLine);

    return [
        '---',
        'name: corvus-star',
        'description: "Use when operating inside the Corvus Star estate so Codex follows the CStar authority order, Hall discovery path, and launcher contract."',
        'metadata:',
        '  priority: 5',
        '  pathPatterns:',
        "    - 'CStar/**'",
        "    - 'AGENTS.md'",
        "    - 'BIDE_INTEGRATION_GUIDE.md'",
        "    - '.agents/skill_registry.json'",
        '  bashPatterns:',
        "    - '\\\\bcstar\\\\s+(hall|augury|trace|one-mind|status|manifest|evolve|orchestrate)\\\\b'",
        "    - '\\\\bnode\\\\s+bin/cstar\\\\.js\\\\s+'",
        '  promptSignals:',
        '    phrases:',
        '      - "CStar"',
        '      - "Corvus"',
        '      - "Hall of Records"',
        '      - "bead"',
        '      - "Mimir"',
        '      - "Mimir\'s Well"',
        '      - "Gungnir"',
        '      - "Augury"',
        '      - "Council of Experts"',
        '---',
        '',
        '# Corvus Star Plugin',
        '',
        '## When to Use',
        '- Use when the workspace is the Corvus estate or a Corvus spoke.',
        '- Use when Codex should route discovery and execution through CStar instead of ad hoc scripts.',
        '- Authoritative integration contract: `docs/integrations/codex_mcp_contract.md`.',
        '',
        '## Required Behavior',
        '- Read only the specific CStar authority files needed for the task. Start with the applicable global and nearest-repository `AGENTS.md`, then use the registry only for declared capabilities.',
        '- CStar is canonical for Corvus planning, proposals, execution state, validation, and completion; do not use direct Hall/SQLite writes when kernel primitives exist.',
        '- Prefer `cstar-kernel` MCP tools first for CStar control-plane work: `cstar_doctor`, `cstar_handoff`, `cstar_augury`, `cstar_hall_search`, `cstar_verify_plan`, `cstar_bead`, `cstar_goal_resume`, and `cstar_record_result` where exposed.',
        '- Use `cstar_hall_search` before broad local scans, and quote only the relevant Hall hits back into context.',
        '- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.',
        '- If MCP is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.',
        '- Use `./cstar <command>` from the CStar root or `node bin/cstar.js <command>` only when MCP cannot provide the needed primitive or the capability is explicitly terminal-required.',
        '- Use `cstar_handoff` when resuming active planning/runtime state, then carry forward only the lead bead, gate, next action, target paths, and checker commands.',
        '- Use `cstar_handoff` when resuming, `cstar_doctor` when kernel health is unknown, and `cstar_augury` only when route or material scope is ambiguous.',
        '- Use direct Codex thread tools for read/list/send when exposed; session JSONL fallback is read-only degraded mode, not an execution or assignment surface.',
        '- CoS owns estate sequencing, bounded Green/Yellow execution, evidence packaging, lifecycle updates, and closeout.',
        '- Start or resume one host goal for every non-trivial mission, keep one plan step in progress, and close the goal only after CStar lifecycle state and validation agree.',
        '- Before the first CStar mutation or provider attempt of each local day, follow `docs/operations/cstar-goal-driven-daily-bootstrap.md` for Codex-host and explicitly selected legacy-adapter freshness; updates do not authorize a restart.',
        '- Forge builds implementation; Researcher gathers evidence; CorvusEye evaluates and red-teams.',
        '- PMTs are project-scoped information repositories only. Query only the mapped PMT for bounded context and send a compact state update after meaningful work.',
        '- MM is inactive and has no active routing, synthesis, ownership, relay, review, or execution role.',
        '- Preserve operator gates for acceptance, dispatch, implementation bypass, commit, push, merge, post, deletion, restarts, deploys, and secret/config mutation.',
        '- Keep high-volume collectors outside beads; collectors write receipts or artifacts, then bounded proposals/results enter CStar.',
        '- Current Forge uses `cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> cstar_forge_swarm_plan ->` direct host-native leaf workers `-> cstar_forge_swarm_update ->` a separate read-only aggregator `-> cstar_forge_swarm_complete -> DELIVERED_UNVERIFIED ->` independent `cstar_record_result`.',
        '- The requested model and reasoning are immutable packet inputs. Record requested and actual identity separately, and use `unreported` unless the host supplies distinct actual-identity attestation.',
        '- Flat dispatch permits one parent and one to three useful direct leaf workers with disjoint write ownership and no descendants. The aggregator is a separate direct sibling, reads only terminal receipts and bound hashes, performs no implementation, and cannot repair missing evidence.',
        '- Historical Codex-host state-only handoffs, their consumer receipts, AutoBot, Hermes, and MiniMax are retired or tombstoned compatibility facts only. They are never the current, default, target, recovery, replacement, or fallback route.',
        '- Keep host-specific packaging separate from kernel logic.',
        '- Treat `native-session` and `exec-bridge` capabilities as host-routed work, and `supported` capabilities as kernel-backed launch surfaces.',
        '- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.',
        '- Public host fronts marked with forbidden kernel fallback must fail closed instead of dropping into legacy kernel cognition.',
        '- This Codex plugin is skill-only. It bundles neither MCP servers nor hooks; the independently managed host-global CStar kernel supplies tools.',
        '- Persona is non-authoritative process guidance. Read only `cstar_status.persona`; use O.D.I.N. for build-run-repair and A.L.F.R.E.D. for secure-harden, without changing scope, authority, or gates.',
        '- Do not run shell `cstar chant` for host-only planning. In Codex, perform the host-native planning and critique in-session, using Hall/Augury state commands for bounded state and evidence.',
        '',
        ...buildAuguryDisplaySection(),
        ...buildKernelMcpToolsSection(),
        '## Context Budget',
        '- Never preload Hall memory, logs, full registry dumps, or complete bead ledgers.',
        '- Use at most one broad Hall query when discovery genuinely needs it, then narrow by bead id, target path, or error text.',
        '- Summarize Hall results as current instructions only when they are OPEN/SET/PLAN_READY or explicitly match the user request. Treat logs and archived results as leads.',
        '- Keep retrieved snippets to the minimum needed to choose files, commands, verification, and next action.',
        '',
        '## Bead Workflow',
        '1. Resume a known bead with `cstar_handoff`; use bounded Hall discovery only when its identity is unknown.',
        '2. If an OPEN or SET bead matches, anchor work to that bead and inspect only its target paths plus directly adjacent files.',
        '3. If no bead matches and the task is structural, create or propose the bounded bead through `cstar_bead` before implementation.',
        '4. Use Augury only for ambiguous route or material scope; do not make it a per-edit ritual.',
        '5. After edits, run the checker from the bead when present; otherwise run the focused CStar or spoke test that matches the touched surface.',
        '6. Record meaningful validation and closeout through CStar; a package, callback, or model claim is evidence rather than lifecycle state.',
        '',
        '## Registry-Exported Codex Capabilities',
        '- This list is generated from `.agents/skill_registry.json` and may be empty when no Codex executable capabilities are registered.',
        ...(topCapabilities.length > 0 ? topCapabilities : ['- None exported.']),
        '',
    ].join('\n');
}

/**
 * The registered kernel catalog is the single source for generated tool
 * documentation. This prevents retired or unregistered tools from surviving
 * in host packages after the runtime has removed them.
 */

function buildMcpServers(rootCwd: string | undefined): Record<string, McpServerConfig> {
    return {
        'cstar-kernel': {
            command: 'node',
            args: ['bin/cstar-kernel-mcp.js'],
            ...(rootCwd ? { cwd: rootCwd } : {}),
            env: {
                GEMINI_CLI_ACTIVE: 'true',
                CSTAR_KERNEL_DISABLE_WATCH: '1',
            },
            note: `CStar kernel MCP — ${CSTAR_KERNEL_TOOL_CATALOG.length}-tool surface. See docs/integrations/cstar-kernel-mcp.md for the full API reference.`,
        },
    };
}

function buildKernelMcpToolsSection(): string[] {
    return [
        `## Kernel MCP Tools (${CSTAR_KERNEL_TOOL_CATALOG.length})`,
        '',
        'The `cstar-kernel` MCP server is the authoritative kernel surface — invoke these tools directly via MCP rather than shelling out to `./cstar` whenever the needed primitive exists. Tool classes declare bounded effects; observed runtime remains evidence and cannot grant authority. Full API reference: `docs/integrations/cstar-kernel-mcp.md`.',
        '',
        ...CSTAR_KERNEL_TOOL_CATALOG.map(({ name, toolClass, description }) => (
            `- \`${name}\` (${toolClass}) — ${description}`
        )),
        '',
    ];
}

function buildGeminiMcpServers(): Record<string, McpServerConfig> {
    return buildMcpServers('.');
}

export function buildDistributionReadmeContent(geminiCapabilities: CapabilityExport[], codexCapabilities: CapabilityExport[]): string {
    return [
        '# Corvus Star Source and Release Surfaces',
        '',
        'This repository generates verified host source-staging artifacts from the declared registry and kernel tool catalog.',
        '',
        '## Gemini CLI',
        '- Install from the repository root so `gemini-extension.json` and `GEMINI.md` are available.',
        '- The extension exposes registry-filtered capabilities and MCP server wiring from the kernel root.',
        '- Gemini context is generated around the host-native supervisor model: host cognition, kernel primitives.',
        '- Gemini context presents Augury as an advisory route explanation, never authority or proof.',
        '- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.',
        '',
        '## Codex',
        '- The source plugin under `plugins/corvus-star/` is skill-only: manifest, README, skill, and generated lineage.',
        '- It contains no MCP server or hook. The host-global CStar kernel is managed independently.',
        '- `plugins/corvus-star/lineage.json` binds the immutable version to its tool catalog, exported capabilities, runtime mode, and per-file hashes.',
        '- Source staging only: `npm run install:codex-local` verifies and stages the plugin under `~/plugins/corvus-star`; it does not run `codex plugin add`, refresh Codex cache, restart Desktop, or prove live activation.',
        '- Marketplace reconciliation, `codex plugin add`, restart or new-task pickup, and live proof remain separately operator-gated.',
        '- Never copy plugin caches or marketplace state by hand.',
        '- Current Forge v3 host handoffs require the active Codex host to run `npm run consume:forge-host-handoff` with the exact CStar-return binding before exposing the job; this is a read-only intrinsic boundary, not a plugin hook or lifecycle mutation.',
        '- Codex skill context presents Augury as an advisory route explanation, never authority or proof.',
        '- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.',
        '',
        `## Export Summary`,
        `- Gemini executable capabilities: ${geminiCapabilities.length}`,
        `- Codex executable capabilities: ${codexCapabilities.length}`,
        '',
        '## Regeneration',
        '- `npm run build:distributions`',
        '- `npm run validate:distributions`',
        '- `npm run build:release-bundles`',
        '- `npm run build:release-archives`',
        '- `npm run release:prepare`',
        '',
        '## CI',
        '- Pull requests and pushes should fail if generated host artifacts drift from the registry-backed source.',
        '- Tagged pushes and manual runs can publish host-ready bundle artifacts from `dist/host-distributions/`.',
        '- Stage verified source, then use the supported host activation surface; never hand-edit Codex plugin caches or marketplace state.',
        '',
    ].join('\n');
}

export function buildMarketplaceContent(): string {
    return `${JSON.stringify({
        name: 'corvus-star',
        interface: {
            displayName: 'Corvus Star',
        },
        plugins: [
            {
                name: 'corvus-star',
                source: {
                    source: 'local',
                    path: './plugins/corvus-star',
                },
                policy: {
                    installation: 'AVAILABLE',
                    authentication: 'ON_INSTALL',
                },
                category: 'Developer Tools',
            },
        ],
    }, null, 2)}\n`;
}
