export interface HostSupervisionOutcome<TDecision> {
    requested: boolean;
    requestDispatched: boolean;
    decision?: TDecision;
    error?: string;
}

export async function runExplicitHostSupervision<TDecision>(input: {
    enabled: unknown;
    provider: string | null;
    label: string;
    invoke: () => Promise<string>;
    parse: (raw: string) => TDecision | null;
}): Promise<HostSupervisionOutcome<TDecision>> {
    if (input.enabled !== true) {
        return { requested: false, requestDispatched: false };
    }

    if (!input.provider) {
        return {
            requested: true,
            requestDispatched: false,
            error: `host_supervision_provider_unavailable: ${input.label} requires an explicitly active provider`,
        };
    }

    try {
        const raw = await input.invoke();
        const decision = input.parse(raw);
        if (!decision) {
            return {
                requested: true,
                requestDispatched: true,
                error: `host_supervision_invalid_response: ${input.label} returned no valid decision`,
            };
        }
        return { requested: true, requestDispatched: true, decision };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            requested: true,
            requestDispatched: true,
            error: `host_supervision_failed: ${input.label}: ${message}`,
        };
    }
}
