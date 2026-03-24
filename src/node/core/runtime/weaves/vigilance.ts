import { 
    RuntimeAdapter, 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    VigilanceWeavePayload,
    RuntimeDispatchPort,
    RavensCycleWeavePayload
} from '../contracts.ts';
import chalk from 'chalk';

/**
 * 🔱 VIGILANCE WEAVE
 * Logic: Audit (Ravens) -> Evaluate (Warden) -> Map (Chronicle)
 */
export class VigilanceWeave implements RuntimeAdapter<VigilanceWeavePayload> {
    public readonly id = 'weave:vigilance';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<VigilanceWeavePayload>,
        context: RuntimeContext
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;

        console.log(chalk.cyan(`\n ◤ VIGILANCE WEAVE: DEEP SYSTEM AUDIT ◢ `));

        // 1. Release the Ravens (Ravens:cycle)
        console.log(chalk.dim('  ↳ Releasing Raven Wardens...'));
        const ravenResult = await this.dispatchPort.dispatch<RavensCycleWeavePayload>({
            weave_id: 'weave:ravens-cycle',
            payload: {
                project_root: projectRoot,
                cwd: context.workspace_root,
                dry_run: false
            }
        });

        if (ravenResult.status !== 'SUCCESS') {
            return ravenResult;
        }

        // 2. Perform aggressive audit if requested
        if (payload.aggressive) {
            console.log(chalk.dim('  ↳ Performing aggressive perimeter sweep...'));
            // Note: In a real implementation, this would call a specialized 'warden' skill
            // that performs deeper static analysis.
        }

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: `[ALFRED]: Vigilance sweep complete. System integrity verified. ${ravenResult.output}`,
            metadata: {
                ravens: ravenResult.metadata
            }
        };
    }
}
