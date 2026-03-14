/**
 * Validates syntax of all .js files in the project (excluding node_modules).
 * Use before build to ensure code is eligible for build.
 * Exit code: 0 if all pass, 1 if any fail.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');

function getJsFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item === 'node_modules') continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      getJsFiles(full, files);
    } else if (item.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const files = getJsFiles(root).sort();
let failed = 0;

console.log('Checking syntax of', files.length, 'JavaScript files...\n');

for (const file of files) {
  const relative = path.relative(root, file);
  try {
    execSync('node', ['-c', file], {
      stdio: 'pipe',
      cwd: root,
    });
    console.log('  \u2713', relative);
  } catch (e) {
    console.error('  \u2717', relative);
    failed++;
  }
}

console.log('');
if (failed > 0) {
  console.error('FAILED:', failed, 'file(s) have syntax errors.');
  process.exit(1);
}
console.log('All files passed syntax check. Code is eligible for build.');
