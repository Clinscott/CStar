export interface InstallOptions {
    projectRoot: string;
    homeDir?: string;
}

/** @deprecated Host-global Gemini installation requires a supported host surface. */
export function installGeminiExtension(_options: InstallOptions): never {
    throw new Error(
        'direct_gemini_extension_install_retired_requires_supported_host_surface',
    );
}

/** @deprecated Codex installation is owned by the supported plugin surface. */
export function installCodexPlugin(_options: InstallOptions): never {
    throw new Error(
        'direct_codex_plugin_install_retired_use_supported_codex_plugin_surface',
    );
}
