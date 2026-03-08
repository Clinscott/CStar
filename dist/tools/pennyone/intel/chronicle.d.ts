/**
 * Chronicle Indexer
 * Purpose: Transform historical records (Dev Journal, Memory) into searchable lore.
 * Mandate: The Wisdom of Mimir
 */
export declare class ChronicleIndexer {
    private files;
    constructor();
    /**
     * Parse and index all registered chronicles.
     */
    index(): Promise<void>;
    /**
     * Split a chronicle into semantic chunks and index them.
     */
    private processFile;
}
