import { selectCouncilExpert } from '../../../src/core/council_experts.js';
import chalk from 'chalk';

interface TestCase {
    name: string;
    intent_category?: string;
    intent: string;
    expected_expert: string;
}

const testCases: TestCase[] = [
    {
        name: 'Systems Repair',
        intent_category: 'repair',
        intent: 'Fix a memory leak in the dispatcher and optimize resource cleanup.',
        expected_expert: 'torvalds'
    },
    {
        name: 'AI System Design',
        intent: 'Implement a new context-window management strategy for the Karpathy loop.',
        expected_expert: 'karpathy'
    },
    {
        name: 'Security Hardening',
        intent_category: 'harden',
        intent: 'Audit all API endpoints for missing auth tokens and weak trust boundaries.',
        expected_expert: 'hamilton'
    },
    {
        name: 'Observability & Logs',
        intent_category: 'observe',
        intent: 'Enhance telemetry signal by adding unique trace IDs to all Hall of Records queries.',
        expected_expert: 'shannon'
    },
    {
        name: 'Performance & Bare Metal',
        intent: 'Rewrite the hot-path buffer allocation to use fixed-point math and zero-allocation structs.',
        expected_expert: 'carmack'
    },
    {
        name: 'Distributed Coordination',
        intent_category: 'orchestrate',
        intent: 'Scale the drone swarm using a non-blocking lease manager for concurrent tasks.',
        expected_expert: 'dean'
    },
    {
        name: 'Narrative & Fantasy',
        intent: 'Integrate a high-fantasy thematic layer into the project documentation and cinematic summaries.',
        expected_expert: 'sakaguchi'
    },
    {
        name: 'UI & Aesthetics',
        intent: 'Design a neon-accented, maximalist interface for the Vitals HUD using Liquid Glass patterns.',
        expected_expert: 'nomura'
    },
    {
        name: 'Interconnected Network Graphs',
        intent: 'Map the project as a rhythmic, soulslike environmental network of interconnected modules.',
        expected_expert: 'miyazaki'
    },
    {
        name: 'Agentic Simulation',
        intent: 'Upgrade the Muninn ravens to use deep agent memory and procedurally generated history.',
        expected_expert: 'adams'
    },
    {
        name: 'Reactive Software Toys',
        intent: 'Transform the TUI into a reactive software toy with open-ended systemic decision loops.',
        expected_expert: 'wright'
    },
    {
        name: 'Technical Heavy Lifting',
        intent: 'Port the CStar kernel to a new cross-platform engine and resolve all legacy technical debt.',
        expected_expert: 'heineman'
    },
    {
        name: 'Framework Democratization',
        intent: 'Scale the CStar framework to support massive high-fidelity environments and democratized access.',
        expected_expert: 'sweeney'
    },
    {
        name: 'Universal Interaction Polish',
        intent: 'Refine the fundamental grammar of movement and add deep interaction polish to the CLI.',
        expected_expert: 'miyamoto'
    },
    {
        name: 'Meta-Systemic Networks',
        intent: 'Implement a social strand network where AI agents maintain persistent meta-connections.',
        expected_expert: 'kojima'
    },
    {
        name: 'Macro-Strategic Choices',
        intent: 'Build a civilization-scale strategic decision loop for project mission control.',
        expected_expert: 'meier'
    }
];

async function runTests() {
    console.log(chalk.bold('◤ COUNCIL OF EXPERTS: SELECTION TEST SUITE ◢'));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let passedCount = 0;

    for (const test of testCases) {
        const result = selectCouncilExpert({
            intent_category: test.intent_category,
            intent: test.intent
        });

        const passed = result.id === test.expected_expert;
        if (passed) {
            passedCount++;
            console.log(`${chalk.green('✔')} [${test.name.padEnd(30)}] -> ${chalk.bold(result.label.padEnd(10))} | ${result.selection_reason}`);
        } else {
            console.log(`${chalk.red('✘')} [${test.name.padEnd(30)}] -> ${chalk.red(result.label.padEnd(10))} | (Expected: ${test.expected_expert})`);
        }
    }

    const successRate = (passedCount / testCases.length) * 100;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`TOTAL PASSED: ${passedCount}/${testCases.length} (${successRate.toFixed(2)}%)`);
    
    if (successRate === 100) {
        console.log(chalk.green.bold('STATUS: SOVEREIGN ALIGNMENT ACHIEVED'));
    } else {
        console.log(chalk.yellow.bold('STATUS: CALIBRATION REQUIRED'));
    }
}

runTests();
