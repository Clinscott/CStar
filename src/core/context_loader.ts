export const RETIRED_CASCADING_CONTEXT_LOADER_ERROR =
    'legacy_cascading_context_loader_retired_use_host_instruction_surface';

export function loadCascadingContext(projectRoot: string): never {
    void projectRoot;
    throw new Error(RETIRED_CASCADING_CONTEXT_LOADER_ERROR);
}
