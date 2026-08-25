export const RETIRED_CHRONICLE_INDEXER_ERROR =
    'legacy_chronicle_indexer_retired_use_cstar_hall_surfaces';

export class ChronicleIndexer {
    public async index(): Promise<never> {
        throw new Error(RETIRED_CHRONICLE_INDEXER_ERROR);
    }
}
