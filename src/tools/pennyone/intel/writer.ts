import type { FileData } from '../types.js';

const RETIRED_REPORT_WRITER =
    'legacy_pennyone_report_writer_retired_use_cstar_kernel';

/** @deprecated Report persistence requires a typed CStar request and receipt. */
export async function writeReport(
    _file: FileData,
    _targetRepo: string,
    _code: string,
    _intentData?: { intent: string; interaction: string },
): Promise<never> {
    throw new Error(RETIRED_REPORT_WRITER);
}
