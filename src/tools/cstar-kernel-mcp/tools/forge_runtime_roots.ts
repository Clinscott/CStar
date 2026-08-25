import { registry } from '../../pennyone/pathRegistry.js';
import { CODE_ROOT, KERNEL_ROOT_BINDING_MODE } from '../contracts/runtime.js';

export interface ForgeRuntimeRoots {
    readonly controlRoot: string;
    readonly codeRoot: string;
}

/** Keep Hall/state ownership separate from source and worker material. */
export function resolveForgeRuntimeRoots(): ForgeRuntimeRoots {
    const controlRoot = registry.getRoot();
    const syntheticLibraryTest = KERNEL_ROOT_BINDING_MODE === 'library_default'
        && Boolean(process.env.NODE_TEST_CONTEXT)
        && process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS !== undefined;
    return Object.freeze({
        controlRoot,
        codeRoot: syntheticLibraryTest ? controlRoot : CODE_ROOT,
    });
}
