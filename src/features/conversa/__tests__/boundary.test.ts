import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function findFiles(dir: string, ext: string[]): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        results = results.concat(findFiles(fullPath, ext));
      }
    } else {
      if (ext.some((e) => file.endsWith(e))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

test('Boundary Isolation: No external files import from src/features/conversa', () => {
  const srcDir = path.resolve(process.cwd(), 'src');
  const allFiles = findFiles(srcDir, ['.ts', '.tsx', '.js', '.jsx']);

  const externalFiles = allFiles.filter((f) => !f.includes(path.join('src', 'features', 'conversa')));

  const leaks: string[] = [];
  for (const file of externalFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (/from\s+['"][^'"]*features\/conversa/i.test(content)) {
      leaks.push(file);
    }
  }

  assert.equal(
    leaks.length,
    0,
    `Architectural leakage: files outside conversa imported from conversa:\n${leaks.join('\n')}`,
  );
});

test('Boundary Isolation: Conversa does not import legacy ChatAgent or TemporalChat', () => {
  const conversaDir = path.resolve(process.cwd(), 'src', 'features', 'conversa');
  const conversaFiles = findFiles(conversaDir, ['.ts', '.tsx']);

  const forbiddenImports: string[] = [];
  for (const file of conversaFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (/from\s+['"][^'"]*(ChatAgent|TemporalChat|VoiceChatAgent|agentCore|chatDiagnostic)/i.test(content)) {
      forbiddenImports.push(file);
    }
  }

  assert.equal(
    forbiddenImports.length,
    0,
    `Conversa UI imported legacy agent files:\n${forbiddenImports.join('\n')}`,
  );
});

