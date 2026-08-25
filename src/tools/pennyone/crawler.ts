export const PENNYONE_CRAWLER_RETIRED_ERROR =
    'legacy_pennyone_crawler_retired_use_cstar_hall_search';

/** Retired before Git, filesystem discovery, or path disclosure. */
export async function crawlRepository(_targetPath: string): Promise<string[]> {
    void _targetPath;
    throw new Error(PENNYONE_CRAWLER_RETIRED_ERROR);
}
