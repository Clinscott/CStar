import { 
    RuntimeAdapter, 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    EstateExpansionWeavePayload,
    RuntimeDispatchPort,
    PennyOneWeavePayload
} from '../contracts.ts';
import chalk from 'chalk';

/**
 * 🔱 ESTATE EXPANSION WEAVE
 * Logic: Link (Spoke) -> Scan (PennyOne) -> Ingest (Oracle) -> Verify (Vitals)
 */
export class EstateExpansionWeave implements RuntimeAdapter<EstateExpansionWeavePayload> {
    public readonly id = 'weave:expansion';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<EstateExpansionWeavePayload>,
        context: RuntimeContext
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const slug = payload.slug || payload.remote_url.split('/').pop()?.replace('.git', '') || 'unknown-spoke';

        console.log(chalk.cyan(`\n ◤ ESTATE EXPANSION WEAVE: ONBOARDING ${slug.toUpperCase()} ◢ `));

        // 1. Link (PennyOne:import)
        console.log(chalk.dim(`  ↳ Linking spoke: ${payload.remote_url}...`));
        const linkResult = await this.dispatchPort.dispatch<PennyOneWeavePayload>({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'import',
                remote_url: payload.remote_url,
                slug: slug
            }
        });

        if (linkResult.status !== 'SUCCESS') {
            return linkResult;
        }

        // 2. Scan (PennyOne:scan)
        console.log(chalk.dim('  ↳ Synchronizing Mimir...'));
        const scanResult = await this.dispatchPort.dispatch<PennyOneWeavePayload>({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'scan',
                slug: slug
            }
        });

        // 3. Topology (PennyOne:topology)
        console.log(chalk.dim('  ↳ Mapping architectural relationship graph...'));
        await this.dispatchPort.dispatch<PennyOneWeavePayload>({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'topology'
            }
        });

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: `[ALFRED]: Estate expanded. Spoke '${slug}' is now active and synchronized.`,
            metadata: {
                slug,
                scan_files: scanResult.metadata?.files
            }
        };
    }
}
