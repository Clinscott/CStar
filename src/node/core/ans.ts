export const RETIRED_ANS_ERROR = 'legacy_ans_runtime_retired_use_cstar_kernel';

function retired(): never {
    throw new Error(RETIRED_ANS_ERROR);
}

/**
 * Import-compatible tombstone for the former autonomic runtime.
 *
 * Health, lifecycle, and projection work now use explicit cstar-kernel tools.
 * No compatibility method may wake a process, seed Hall, or mutate state.
 */
export class ANS {
    static async wake(): Promise<never> {
        return retired();
    }

    static async sleep(): Promise<never> {
        return retired();
    }

    static async ensurePennyOne(): Promise<never> {
        return retired();
    }

    static async stopPennyOne(): Promise<never> {
        return retired();
    }
}
