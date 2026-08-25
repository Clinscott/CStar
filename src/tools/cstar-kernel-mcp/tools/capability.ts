import { CODE_ROOT } from '../contracts/runtime.js';
import { textResponse } from '../contracts/responses.js';
import { buildCapabilityManifestPayload, buildCapabilityInfoPayload } from '../../../node/core/commands/capability_discovery.js';
import {
    walkSpokeSkills,
    walkSpokeJournal,
    type SpokeSkillManifest,
} from '../../../node/core/spokes/spoke_capability_walker.js';

export interface SpokeCapabilityRecord {
    id: string;
    bare_id: string;
    source: 'spoke';
    source_spoke: string;
    tier: string;
    risk: string;
    entry_surface: 'host-only';
    execution_mode: 'agent-native';
    owner_runtime: 'host-agent';
    authority_path: string;
    active_in_runtime: false;
    validation: string;
    validation_reason?: string;
    shadows_hub_id: boolean;
    authority_verification: string;
    authority_failure_code?: string;
    mount_token: string;
    name: string;
    description: string;
}

export function adaptSpokeManifestToCapability(s: SpokeSkillManifest): SpokeCapabilityRecord {
    return {
        id: s.id,
        bare_id: s.bare_id,
        source: 'spoke',
        source_spoke: s.spoke_slug,
        tier: s.tier,
        risk: s.risk,
        entry_surface: 'host-only',
        execution_mode: 'agent-native',
        owner_runtime: 'host-agent',
        authority_path: s.authority_path,
        active_in_runtime: false,
        validation: s.validation,
        validation_reason: s.validation_reason,
        shadows_hub_id: s.shadows_hub_id,
        authority_verification: s.authority_verification,
        authority_failure_code: s.authority_failure_code,
        mount_token: s.mount_token,
        name: s.name,
        description: s.description,
    };
}

const LOGIC_PROTOCOL_RE = /^#{1,6}.*LOGIC PROTOCOL.*$/im;

function extractLogicProtocolAnchor(content: string): string | null {
    const m = LOGIC_PROTOCOL_RE.exec(content);
    return m === null ? null : m[0].trim();
}

export async function handleManifest({ scope = 'hub', spoke }: { scope?: 'hub' | 'spoke' | 'all'; spoke?: string }) {
    try {
        const projectRoot = CODE_ROOT;
        const hubPayload = scope === 'hub' || scope === 'all'
            ? buildCapabilityManifestPayload(projectRoot)
            : null;
        const spokeManifests = scope === 'spoke' || scope === 'all'
            ? walkSpokeSkills(spoke)
            : [];

        const hubEntries = (hubPayload?.capabilities ?? []).map((c) => ({
            ...c,
            source: 'hub' as const,
        }));
        const spokeEntries = spokeManifests.map(adaptSpokeManifestToCapability);
        const capabilities = [...hubEntries, ...spokeEntries].sort((a, b) =>
            String(a.id).localeCompare(String(b.id))
        );

        return textResponse({ scope, spoke: spoke ?? null, capabilities });
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
export async function handleSkillInfo({ id, spoke }: { id: string; spoke?: string }) {
    try {
        const projectRoot = CODE_ROOT;

        if (id.includes(':')) {
            // Spoke skill: namespaced as <slug>:<bare_id>.
            const sep = id.indexOf(':');
            const parsedSlug = id.slice(0, sep);
            const bareId = id.slice(sep + 1);
            const slug = spoke ?? parsedSlug;

            const candidates = walkSpokeSkills(slug, { includeQuarantined: true });
            const found = candidates.find((s) => s.bare_id === bareId);
            if (found === undefined) {
                return textResponse({ error: `spoke skill not found: ${id}` }, true);
            }
            return textResponse({
                capability: adaptSpokeManifestToCapability(found),
                documentation: {
                    kind: 'markdown',
                    path: found.authority_path,
                    readable: true,
                    content: found.documentation,
                },
                invocation: {
                    agent_hint: 'any-host-agent',
                    working_dir: null,
                    working_dir_source: 'registered_spoke_root_redacted',
                    command: null,
                    logic_protocol_anchor: extractLogicProtocolAnchor(found.documentation),
                },
            });
        }

        // Hub skill: delegate to the existing capability discovery path.
        const payload = buildCapabilityInfoPayload(projectRoot, id);
        return textResponse(payload);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

export async function handleSpokeJournal({ spoke }: { spoke: string }) {
    try {
        const report = walkSpokeJournal(spoke);
        return textResponse(report);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
