const fs = require('fs');
const path = require('path');
const archiver = require('/home/morderith/.nvm/versions/node/v25.8.1/lib/node_modules/@google/gemini-cli/node_modules/archiver');

async function zipDirectory(source, out) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive
      .directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

const skills = ['sprt-verifier', 'research-experimenter', 'oracle-search', 'chant-planner'];
const baseDir = '/home/morderith/Corvus/CStar/.agents/skills/gemini-skills';

(async () => {
  for (const skill of skills) {
    const source = path.join(baseDir, skill);
    const output = path.join(baseDir, `${skill}.skill`);
    console.log(`Packaging ${skill}...`);
    await zipDirectory(source, output);
    console.log(`Created ${output}`);
  }
})();
