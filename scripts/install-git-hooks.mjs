#!/usr/bin/env node
/**
 * Instala o shim componível do Gate Determinístico (Fase 0 / Opção Z) em .git/hooks/pre-commit.
 * - Preserva qualquer outro bloco/hook já existente (componível com `idd init` e hooks futuros).
 * - Garante terminações LF (evita erro de CRLF no Git Bash no Windows).
 * - Nunca sobrescreve `core.hooksPath`.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const START_MARKER = "# >>> rvm-deterministic-gate >>>";
const END_MARKER = "# <<< rvm-deterministic-gate <<<";

const BLOCK = [
  START_MARKER,
  'if [ -f "scripts/deterministic-gate.mjs" ]; then',
  "  node scripts/deterministic-gate.mjs --staged || exit 1",
  "fi",
  END_MARKER,
].join("\n");

const repoRoot = process.cwd();
const hooksDir = path.join(repoRoot, ".git", "hooks");
const hookPath = path.join(hooksDir, "pre-commit");

if (!existsSync(path.join(repoRoot, ".git"))) {
  console.error("Erro: diretório .git não encontrado na raiz atual.");
  process.exit(1);
}

mkdirSync(hooksDir, { recursive: true });

let content = "";
if (existsSync(hookPath)) {
  content = readFileSync(hookPath, "utf8").replace(/\r\n/g, "\n");
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    content =
      content.slice(0, startIdx).trimEnd() +
      "\n" +
      BLOCK +
      "\n" +
      content.slice(endIdx + END_MARKER.length).trimStart();
  } else {
    content = content.trimEnd() + "\n\n" + BLOCK + "\n";
  }
} else {
  content = `#!/bin/sh\n${BLOCK}\n`;
}

if (!content.startsWith("#!")) {
  content = `#!/bin/sh\n${content}`;
}

writeFileSync(hookPath, content.replace(/\r\n/g, "\n"), "utf8");
try {
  chmodSync(hookPath, 0o755);
} catch {
  // Windows NTFS ignora chmod POSIX
}

console.log(`✅ Hook pre-commit instalado com sucesso (LF, componível): ${hookPath}`);
