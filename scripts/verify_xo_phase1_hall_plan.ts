import { getHallPlanningSession, listHallSkillProposals } from '../src/tools/pennyone/intel/session_manager.ts';
import { getHallBeads } from '../src/tools/pennyone/intel/bead_controller.ts';

const xoRoot = '/home/morderith/Corvus/XO';
const sessionId = 'chant-session:xo-phase1-runtime';

const session = getHallPlanningSession(sessionId);
const proposals = listHallSkillProposals(xoRoot, { skill_id: 'chant', statuses: ['PROPOSED'] })
    .filter((proposal) => proposal.proposal_id.startsWith(`proposal:${sessionId}:`))
    .map((proposal) => ({
        proposal_id: proposal.proposal_id,
        bead_id: proposal.bead_id,
        status: proposal.status,
    }));

const beads = getHallBeads('repo:/home/morderith/Corvus/XO')
    .filter((bead) => String(bead.id).startsWith('xo-phase1-'))
    .map((bead) => ({
        bead_id: bead.id,
        status: bead.status,
        target_path: bead.target_path,
    }));

console.log(JSON.stringify({
    session: session ? {
        session_id: session.session_id,
        repo_id: session.repo_id,
        status: session.status,
        current_bead_id: session.current_bead_id,
    } : null,
    proposal_count: proposals.length,
    proposals,
    bead_count: beads.length,
    beads,
}, null, 2));
