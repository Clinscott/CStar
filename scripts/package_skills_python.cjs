const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function zipSkill(skillName, sourceDir, outputZip) {
    console.log(`Zipping ${skillName}...`);
    // Create an empty zip file first if needed or just stream into it.
    // Since streamzip appends or creates, we need to be careful.
    // Actually, streamzip from stdin creates a single member.
    // This is not ideal for multiple files.
    
    // Let's try another approach. If 'zip' is missing, can we use 'python3 -m zipfile'?
    try {
        execSync(`python3 -m zipfile -c ${outputZip} ${sourceDir}`);
        console.log(`Created ${outputZip}`);
        return true;
    } catch (e) {
        console.error(`Python zip failed: ${e.message}`);
        return false;
    }
}

const skills = ['sprt-verifier', 'research-experimenter', 'oracle-search', 'chant-planner'];
const baseDir = '/home/morderith/Corvus/CStar/.agents/skills/gemini-skills';

for (const skill of skills) {
    const source = path.join(baseDir, skill);
    const output = path.join(baseDir, `${skill}.skill`);
    zipSkill(skill, source, output);
}
