import fs from 'fs';

const data = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'));
let totalErrors = 0;
let totalWarnings = 0;

data.forEach(file => {
    if (file.errorCount > 0 || file.warningCount > 0) {
        console.log(`\nFile: ${file.filePath}`);
        file.messages.forEach(msg => {
            console.log(`  Line ${msg.line}: [${msg.severity === 2 ? 'ERROR' : 'WARN'}] ${msg.message} (${msg.ruleId})`);
        });
        totalErrors += file.errorCount;
        totalWarnings += file.warningCount;
    }
});

console.log(`\nTotal Errors: ${totalErrors}`);
console.log(`Total Warnings: ${totalWarnings}`);
