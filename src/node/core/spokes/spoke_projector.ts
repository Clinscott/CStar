/**
 * Retired spoke projection compatibility surface.
 *
 * Historical projection walked arbitrary repositories, read Git contributor
 * and remote data plus private Hermes profile trees, then wrote generated
 * files into the spoke. CStar no longer grants that authority implicitly.
 */

export const SPOKE_PROJECTION_VERSION = 'retired';
export const SPOKE_PROFILE_DIR = '.cstar';
export const SPOKE_PROFILE_MD = 'SPOKE_PROFILE.md';
export const SPOKE_PROFILE_JSON = 'spoke_profile.json';
export const SPOKE_PROJECTION_RETIRED = 'spoke_projection_requires_verified_operator_attestation';

export interface SpokeCapabilityEntry {
    kind: 'skill' | 'workflow' | 'script' | 'make_target' | 'just_recipe';
    bare_id: string;
    namespaced_id: string;
    source_path: string;
    description?: string;
}

export interface SpokeProjection {
    version: 'retired';
    slug: string;
    projected_at: null;
    capabilities: SpokeCapabilityEntry[];
    status: 'retired';
}

export interface ProjectSpokeOptions {
    slug: string;
    rootPath: string;
}

export interface ProjectSpokeResult {
    projection: SpokeProjection;
    metadataPatch: Record<string, never>;
}

/** Always fails before filesystem, Git, Hall, Hermes, or write activity. */
export function projectSpoke(_options: ProjectSpokeOptions): never {
    throw new Error(SPOKE_PROJECTION_RETIRED);
}
