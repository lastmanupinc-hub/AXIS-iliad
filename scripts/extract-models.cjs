const fs = require('fs');
const path = require('path');

const dirs = [
  'apps/api/src',
  'packages/context-engine/src',
  'packages/generator-core/src',
  'packages/repo-parser/src',
  'packages/snapshots/src'
];

// STEP 1: Count exactly as the freshness script does (raw regex, no filtering)
let rawTotal = 0;
const countPattern = /\b(interface|type)\s+[A-Z]\w+/g;

function countInDir(dir) {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) return;
  for (const entry of fs.readdirSync(absDir)) {
    const full = path.join(absDir, entry);
    if (fs.statSync(full).isDirectory()) {
      countInDir(path.join(dir, entry));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      const content = fs.readFileSync(full, 'utf-8');
      const matches = content.match(countPattern);
      if (matches) {
        rawTotal += matches.length;
        // Show which matches were found in this file
        const relPath = path.relative(process.cwd(), full).replace(/\\/g, '/');
        const regex2 = /\b(interface|type)\s+([A-Z]\w+)/g;
        let m;
        while ((m = regex2.exec(content)) !== null) {
          const lineNum = content.substring(0, m.index).split('\n').length;
          const line = content.split('\n')[lineNum - 1].trim();
          console.log(`${relPath}:${lineNum}|${m[1]}|${m[2]}|${line.substring(0, 100)}`);
        }
      }
    }
  }
}

for (const d of dirs) countInDir(d);
console.log('\nRAW TOTAL (script method): ' + rawTotal);
