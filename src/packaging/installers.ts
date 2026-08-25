export interface InstallOptions {
    projectRoot: string;
    homeDir?: string;
}

export interface CodexPluginInstallResult {
    pluginPath: string;
    marketplacePath: string;
    changed: boolean;
}

/**
 * Legacy CStar host installation is archived. The compatibility exports remain
 * only so stale callers fail closed before resolving paths or mutating a host.
 */
export function installGeminiExtension(_options: InstallOptions): never {
    throw new Error(
        'direct_gemini_extension_install_retired_requires_supported_host_surface',
    );
}

/**
 * Legacy CStar Codex plugin staging is archived. Organism-owned integration,
 * when separately authorized, must use an Organism-native host surface.
 */
export function installCodexPlugin(_options: InstallOptions): never {
    throw new Error(
        'legacy_cstar_codex_plugin_install_retired_use_organism_host_integration',
    );
}
