const MEMORY_CITATION_OPEN = '<oai-mem-citation>';
const MEMORY_CITATION_CLOSE = '</oai-mem-citation>';
const MEMORY_CITATION_ENTRY = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+:[1-9]\d*-[1-9]\d*\|note=\[[^\]\r\n]{1,240}\]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function wellFormedMemoryCitation(block: string): boolean {
    const normalized = block.replace(/\r\n/g, '\n');
    if (normalized.includes('\r')) return false;
    const lines = normalized.split('\n');
    if (lines[0] !== MEMORY_CITATION_OPEN || lines.at(-1) !== MEMORY_CITATION_CLOSE) {
        return false;
    }
    const citationEnd = lines.indexOf('</citation_entries>');
    const rolloutStart = lines.indexOf('<rollout_ids>');
    const rolloutEnd = lines.indexOf('</rollout_ids>');
    if (citationEnd <= 2 || citationEnd !== lines.lastIndexOf('</citation_entries>')
        || rolloutStart !== citationEnd + 1 || rolloutEnd < rolloutStart + 1
        || rolloutEnd !== lines.lastIndexOf('</rollout_ids>') || rolloutEnd !== lines.length - 2) {
        return false;
    }
    const entries = lines.slice(2, citationEnd);
    const rolloutIds = lines.slice(rolloutStart + 1, rolloutEnd);
    return entries.every((entry) => MEMORY_CITATION_ENTRY.test(entry))
        && rolloutIds.every((id) => UUID.test(id));
}

export function taskCompleteMessageMatchesFinalAnswer(
    finalAnswer: string,
    lastAgentMessage: string,
): boolean {
    if (finalAnswer === lastAgentMessage) return true;
    const blockStart = finalAnswer.lastIndexOf(MEMORY_CITATION_OPEN);
    if (blockStart < 0 || finalAnswer.indexOf(MEMORY_CITATION_OPEN) !== blockStart) return false;
    const block = finalAnswer.slice(blockStart);
    if (!wellFormedMemoryCitation(block)
        || finalAnswer.indexOf(MEMORY_CITATION_CLOSE) !== finalAnswer.lastIndexOf(MEMORY_CITATION_CLOSE)
        || finalAnswer.lastIndexOf(MEMORY_CITATION_CLOSE) !== finalAnswer.length - MEMORY_CITATION_CLOSE.length) {
        return false;
    }
    const prefix = finalAnswer.slice(0, blockStart);
    const candidates = [prefix];
    if (prefix.endsWith('\r\n')) candidates.push(prefix.slice(0, -2));
    else if (prefix.endsWith('\n')) candidates.push(prefix.slice(0, -1));
    return candidates.some((candidate) => candidate.trim().length > 0 && candidate === lastAgentMessage);
}
