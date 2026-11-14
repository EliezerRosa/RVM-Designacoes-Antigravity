import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ghpages from 'gh-pages';

const REPO_OWNER = 'EliezerRosa';
const REPO_NAME = 'conversa-rvm';
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;
const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');

try {
  if (!fs.existsSync(path.join(distDir, 'conversa.html'))) {
    console.log('[Deploy Conversa] Executando npm run build...');
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  }

  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conversa-rvm-pages-'));

  try {
    fs.mkdirSync(path.join(stageDir, 'assets'), { recursive: true });
    for (const file of fs.readdirSync(path.join(distDir, 'assets'))) {
      fs.copyFileSync(
        path.join(distDir, 'assets', file),
        path.join(stageDir, 'assets', file)
      );
    }

    for (const staticFile of ['vite.svg', 'pdf.worker.min.mjs']) {
      const src = path.join(distDir, staticFile);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(stageDir, staticFile));
      }
    }

    const conversaHtml = fs.readFileSync(path.join(distDir, 'conversa.html'), 'utf8');
    fs.writeFileSync(path.join(stageDir, 'index.html'), conversaHtml, 'utf8');
    fs.writeFileSync(path.join(stageDir, 'conversa.html'), conversaHtml, 'utf8');
    fs.writeFileSync(path.join(stageDir, '404.html'), conversaHtml, 'utf8');
    fs.writeFileSync(path.join(stageDir, '.nojekyll'), '', 'utf8');

    console.log(`[Deploy Conversa] Publicando artefato em ${REPO_URL} (branch main)...`);
    await new Promise((resolve, reject) => {
      ghpages.publish(
        stageDir,
        {
          repo: REPO_URL,
          branch: 'main',
          dotfiles: true,
          message: 'deploy(conversa): atualiza GitHub Pages Conversa RVM',
        },
        (err) => (err ? reject(err) : resolve(undefined))
      );
    });

    console.log(
      `[Deploy Conversa] Publicado com sucesso em: https://eliezerrosa.github.io/${REPO_NAME}/`
    );
  } finally {
    try {
      fs.rmSync(stageDir, { recursive: true, force: true });
    } catch {
      // Ignore transient Windows file lock on temp dir
    }
  }
} catch (err) {
  console.log('[Deploy Conversa] ERRO:', err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
}
