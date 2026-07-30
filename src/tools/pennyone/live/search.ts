const RETIRED_DIRECT_SEARCH =
    'legacy_pennyone_direct_search_retired_use_cstar_hall_search';

/** @deprecated Use the bounded `cstar_hall_search` kernel surface. */
export async function searchMatrix(
    _query: string,
    _targetPath: string = '.',
): Promise<never> {
    throw new Error(RETIRED_DIRECT_SEARCH);
}
