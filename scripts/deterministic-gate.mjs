#!/usr/bin/env node
/**
 * RVM Designações — Gate Determinístico (Fase 0 / Opção Z FinOps)
 *
 * Custo de API: US$ 0,00 (100% determinístico, local + CI server-side).
 *
 * Camadas verificadas:
 *   2a — Segredos & PII (LGPD) em TODAS as linhas adicionadas (+), INCLUSIVE .md/docs (sem bypass env)
 *   2b — Catraca de linhas novas TypeScript em src/ e api/ (bloqueia novos `any`, `@ts-ignore`, `@ts-nocheck`)
 *   2c — Co-evolução do motor (exige teste correspondente ao serviço alterado; aviso para versão de regras)
 *   2d — Segurança SQL em supabase/migrations/*.sql (remove comentários antes do match; exige -- Rollback:)
 *        + aviso auditável de alteração em *.intent.md / memories/regras-intencao.md
 *   2e — Paridade SHA-256 obrigatória entre _ESTADO-ATUAL.md e memories/repo/_ESTADO-ATUAL.md
 *
 * Uso CLI:
 *   node scripts/deterministic-gate.mjs --staged              (padrão — usado no pre-commit)
 *   node scripts/deterministic-gate.mjs --worktree            (inspeciona staged + unstaged + untracked)
 *   node scripts/deterministic-gate.mjs --range <base>..<head> (usado no GitHub Actions CI)
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE_SERVICES = [
  "src/services/eligibilityService.ts",
  "src/services/unifiedRotationService.ts",
  "src/services/rankedEligibleService.ts",
  "src/services/generationService.ts",
];

const INTENT_FILES_PATTERN = /(?:^|\/)(?:[^/]+\.intent\.md|memories\/regras-intencao\.md)$/;

const DOC_PII_EXTS = new Set([".md", ".txt", ".html", ".htm", ".csv"]);

// Padrões de segredos de alta precisão (marcados com gate-pattern-literal para o próprio arquivo)
const SECRET_RULES = [
  { id: "SUPABASE_PAT", label: "Token Supabase PAT (sbp_...)", regex: /\bsbp_[A-Za-z0-9_]{20,}\b/ }, // gate-pattern-literal
  { id: "GITHUB_TOKEN", label: "Token GitHub (ghp_/gho_/github_pat_)", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ }, // gate-pattern-literal
  { id: "OPENROUTER_KEY", label: "Chave OpenRouter (sk-or-v1-...)", regex: /\bsk-or-v1-[A-Za-z0-9]{20,}\b/ }, // gate-pattern-literal
  { id: "ANTHROPIC_KEY", label: "Chave Anthropic (sk-ant-...)", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ }, // gate-pattern-literal
  { id: "GOOGLE_API_KEY", label: "Chave Google API (AIza...)", regex: /\bAIza[0-9A-Za-z\-_]{30,}\b/ }, // gate-pattern-literal
  { id: "PRIVATE_KEY", label: "Chave Privada PEM", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ }, // gate-pattern-literal
  { id: "JWT_LITERAL", label: "Token JWT literal longo", regex: /\beyJhbGciOi[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/ }, // gate-pattern-literal
  {
    id: "ENV_SECRET_LITERAL",
    label: "Variável de segredo com valor literal",
    regex: /\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|VERCEL_TOKEN|FAL_KEY|OPENROUTER_API_KEY|ZAPI_INSTANCE_TOKEN|ZAPI_CLIENT_TOKEN|CRON_SECRET)\s*[:=]\s*["']?(?!<|YOUR_|SEU_|COLE_|\$\{)[A-Za-z0-9_\-\.]{16,}["']?/, // gate-pattern-literal
  },
];

// Padrões PII (LGPD — proteção de publicadores em documentos públicos)
const PII_RULES = [
  {
    id: "PII_BR_PHONE",
    label: "Telefone celular BR em documento público",
    regex: /(?<!\d)(?:\+?55\s?)?\(?[1-9]\d\)?\s?9\s?\d{4}[-\s]?\d{4}(?!\d)/, // gate-pattern-literal
  },
  {
    id: "PII_BR_CPF",
    label: "CPF formatado em documento público",
    regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, // gate-pattern-literal
  },
  {
    id: "PII_PERSONAL_EMAIL",
    label: "E-mail pessoal em documento público",
    regex: /\b[A-Za-z0-9._%+-]+@(?:gmail|hotmail|outlook|yahoo)\.[a-z]{2,}\b/i, // gate-pattern-literal
  },
];

const TS_RATCHET_RULES = [
  { id: "TS_ANY", label: "Novo uso de `any` explícito", regex: /(?::\s*any\b|\bas\s+any\b|<any>|Array<\s*any\s*>|Record<[^,>]+,\s*any\s*>)/ }, // gate-pattern-literal
  { id: "TS_IGNORE", label: "Novo `@ts-ignore` ou `@ts-nocheck`", regex: /@ts-(?:ignore|nocheck)\b/ }, // gate-pattern-literal
];

/**
 * Remove comentários SQL (-- linha e /* bloco *\/) preservando quebras de linha.
 */
export function stripSqlComments(sql) {
  let out = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      out += ch;
      if (ch === "'" && next === "'") {
        out += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }

    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        if (sql[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === "'") inSingle = true;
    if (ch === '"') inDouble = true;
    out += ch;
    i++;
  }
  return out;
}

/**
 * Analisa um diff unificado (`git diff -U0`) e retorna entradas por arquivo com linhas adicionadas (+).
 */
export function parseUnifiedDiff(diffText) {
  const files = new Map();
  let currentFile = null;
  let currentNewLine = 0;

  for (const rawLine of diffText.split(/\r?\n/)) {
    if (rawLine.startsWith("+++ b/")) {
      currentFile = rawLine.slice(6).replace(/\\/g, "/");
      if (!files.has(currentFile)) files.set(currentFile, []);
      continue;
    }
    if (rawLine.startsWith("+++ /dev/null")) {
      currentFile = null;
      continue;
    }
    const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      currentNewLine = Number.parseInt(hunk[1], 10);
      continue;
    }
    if (!currentFile) continue;

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      files.get(currentFile).push({
        lineNumber: currentNewLine,
        text: rawLine.slice(1),
      });
      currentNewLine++;
    } else if (!rawLine.startsWith("-") && !rawLine.startsWith("\\")) {
      currentNewLine++;
    }
  }
  return files;
}

/**
 * Remove comentários JS/TS (// e /* ... *\/) preservando literais simples e rastreando bloco entre linhas.
 */
function stripTsLineComments(linesWithNum) {
  const cleaned = [];
  let inBlockComment = false;

  for (const item of linesWithNum) {
    const src = item.text;
    let code = "";
    let i = 0;
    let quote = null;

    while (i < src.length) {
      const ch = src[i];
      const next = src[i + 1];

      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i += 2;
        } else {
          i++;
        }
        continue;
      }

      if (quote) {
        code += ch;
        if (ch === "\\" && i + 1 < src.length) {
          code += src[i + 1];
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        i++;
        continue;
      }

      if (ch === "/" && next === "/") {
        // Verifica @ts-ignore / @ts-nocheck antes de descartar o comentário
        const commentRest = src.slice(i);
        if (/@ts-(?:ignore|nocheck)\b/.test(commentRest)) {
          code += " " + commentRest;
        }
        break;
      }
      if (ch === "/" && next === "*") {
        const endIdx = src.indexOf("*/", i + 2);
        const snippet = endIdx === -1 ? src.slice(i) : src.slice(i, endIdx + 2);
        if (/@ts-(?:ignore|nocheck)\b/.test(snippet)) {
          code += " " + snippet;
        }
        if (endIdx === -1) {
          inBlockComment = true;
          break;
        }
        i = endIdx + 2;
        continue;
      }

      if (ch === "'" || ch === '"' || ch === "`") {
        quote = ch;
      }
      code += ch;
      i++;
    }

    cleaned.push({ lineNumber: item.lineNumber, text: code, raw: src });
  }
  return cleaned;
}

function isTestFile(filePath) {
  return /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(filePath);
}

function isPublicDocFile(filePath) {
  if (filePath.startsWith("docs-local/")) return false;
  const ext = path.extname(filePath).toLowerCase();
  return DOC_PII_EXTS.has(ext);
}

function isTsSourceFile(filePath) {
  return (filePath.startsWith("src/") || filePath.startsWith("api/")) &&
    /\.[cm]?tsx?$/.test(filePath) &&
    !isTestFile(filePath);
}

/**
 * Núcleo puro de avaliação — recebe diff parseado, lista de arquivos e um leitor de conteúdo de arquivo.
 * Facilita 100% de cobertura por testes unitários sem depender de git real.
 */
export function evaluateChanges({
  addedByFile,
  changedFiles,
  readFileAtTarget,
  bypassReason = "",
}) {
  const errors = [];
  const warnings = [];
  const notices = [];
  const bypassesUsed = [];

  // --- ETAPA 2a: Segredos (TODOS os arquivos) + PII (docs públicos) — SEM BYPASS ENV ---
  for (const [filePath, lines] of addedByFile.entries()) {
    const checkPii = isPublicDocFile(filePath) && !isTestFile(filePath);

    for (const { lineNumber, text } of lines) {
      if (text.includes("gate-pattern-literal")) continue;

      for (const rule of SECRET_RULES) {
        if (rule.regex.test(text)) {
          errors.push({
            stage: "2a",
            ruleId: rule.id,
            file: filePath,
            line: lineNumber,
            message: `${rule.label} detectado em ${filePath}:${lineNumber}`,
          });
        }
      }

      if (checkPii && !text.includes("gate-allow-pii")) {
        for (const rule of PII_RULES) {
          if (rule.regex.test(text)) {
            errors.push({
              stage: "2a",
              ruleId: rule.id,
              file: filePath,
              line: lineNumber,
              message: `${rule.label} em ${filePath}:${lineNumber} (regra LGPD 2026-11-07)`,
            });
          }
        }
      }
    }
  }

  // --- ETAPA 2b: Catraca de linhas novas TS em src/ e api/ ---
  for (const [filePath, lines] of addedByFile.entries()) {
    if (!isTsSourceFile(filePath)) continue;
    const cleaned = stripTsLineComments(lines);

    for (const { lineNumber, text, raw } of cleaned) {
      if (raw.includes("gate-pattern-literal")) continue;
      for (const rule of TS_RATCHET_RULES) {
        if (rule.regex.test(text)) {
          errors.push({
            stage: "2b",
            ruleId: rule.id,
            file: filePath,
            line: lineNumber,
            message: `${rule.label} em ${filePath}:${lineNumber}`,
          });
        }
      }
    }
  }

  // --- ETAPA 2c: Co-evolução do Motor (teste correspondente + aviso de versão) ---
  const touchedEngine = changedFiles.filter((f) => ENGINE_SERVICES.includes(f));
  if (touchedEngine.length > 0) {
    const changedTestFiles = changedFiles.filter((f) => isTestFile(f));
    const missingTests = [];

    for (const svc of touchedEngine) {
      const baseName = path.basename(svc, path.extname(svc)); // ex.: eligibilityService
      const hasMatchingTest = changedTestFiles.some((tf) => {
        if (tf.includes(baseName)) return true;
        const content = readFileAtTarget(tf) || "";
        return content.includes(baseName);
      });
      if (!hasMatchingTest) {
        missingTests.push(svc);
      }
    }

    if (missingTests.length > 0) {
      if (bypassReason.trim().length >= 8) {
        bypassesUsed.push({
          stage: "2c",
          files: missingTests,
          reason: bypassReason.trim(),
        });
        warnings.push({
          stage: "2c",
          ruleId: "ENGINE_TEST_BYPASSED",
          message: `Co-evolução de teste contornada via GATE_BYPASS_REASON para: ${missingTests.join(", ")}`,
        });
      } else {
        errors.push({
          stage: "2c",
          ruleId: "ENGINE_COEVOLUTION_TEST",
          message:
            `Alteração no motor (${missingTests.join(", ")}) sem teste correspondente no mesmo commit. ` +
            `Adicione/atualize o *.test.ts correspondente ou informe GATE_BYPASS_REASON (>= 8 chars) se for refactor puro.`,
        });
      }
    }

    // Aviso não-bloqueante para versão de regras (só bloqueia se motor-invariants.intent.md também mudou)
    const intentChanged = changedFiles.includes(".agents/workflows/motor-invariants.intent.md");
    const eligLines = addedByFile.get("src/services/eligibilityService.ts") || [];
    const bumpedVersion = eligLines.some((l) => /ELIGIBILITY_RULES_VERSION\s*=/.test(l.text));

    if (intentChanged && !bumpedVersion) {
      errors.push({
        stage: "2c",
        ruleId: "ENGINE_VERSION_BUMP_REQUIRED",
        message:
          `motor-invariants.intent.md e o motor foram alterados juntos sem atualizar ELIGIBILITY_RULES_VERSION em src/services/eligibilityService.ts.`,
      });
    } else if (!bumpedVersion) {
      warnings.push({
        stage: "2c",
        ruleId: "ENGINE_VERSION_REMINDER",
        message: `Motor alterado (${touchedEngine.join(", ")}). Se houve mudança de regra semântica, confira ELIGIBILITY_RULES_VERSION e RULES_TEXT_VERSION.`,
      });
    }
  }

  // --- ETAPA 2d: Segurança SQL (migrations) + Registro de *.intent.md ---
  const sqlMigrations = changedFiles.filter(
    (f) => f.startsWith("supabase/migrations/") && f.endsWith(".sql")
  );
  const destructiveSqlRegex =
    /\b(?:DROP\s+(?:TABLE|VIEW|COLUMN|FUNCTION|SCHEMA|DATABASE)|TRUNCATE\s+TABLE?|DELETE\s+FROM\s+[A-Za-z0-9_."]+(?:\s*;|\s*$))/i;

  for (const mig of sqlMigrations) {
    const content = readFileAtTarget(mig);
    if (content == null) continue;
    const stripped = stripSqlComments(content);
    if (destructiveSqlRegex.test(stripped)) {
      const hasRollback = /(?:--\s*Rollback:|ROLLBACK_SQL)/i.test(content);
      if (!hasRollback) {
        errors.push({
          stage: "2d",
          ruleId: "SQL_DESTRUCTIVE_NO_ROLLBACK",
          file: mig,
          message: `Migration destrutiva (${mig}) sem documentação de rollback ('-- Rollback:' ou 'ROLLBACK_SQL').`,
        });
      } else {
        notices.push(`[2d] Migration destrutiva em ${mig} possui seção de rollback documentada.`);
      }
    }
  }

  const changedIntents = changedFiles.filter((f) => INTENT_FILES_PATTERN.test(f));
  if (changedIntents.length > 0) {
    notices.push(
      `[2d][INTENT-CHANGE] Especificação canônica alterada: ${changedIntents.join(", ")} — registrar revisão do Responsável Epistêmico.`
    );
  }

  // --- ETAPA 2e: Paridade SHA-256 de _ESTADO-ATUAL.md <-> memories/repo/_ESTADO-ATUAL.md ---
  const rootState = "_ESTADO-ATUAL.md";
  const repoState = "memories/repo/_ESTADO-ATUAL.md";
  if (changedFiles.includes(rootState) || changedFiles.includes(repoState)) {
    const c1 = readFileAtTarget(rootState);
    const c2 = readFileAtTarget(repoState);
    if (c1 == null || c2 == null) {
      errors.push({
        stage: "2e",
        ruleId: "STATE_PARITY_MISSING",
        message: `Um dos arquivos canônicos de estado (${rootState} / ${repoState}) está ausente.`,
      });
    } else {
      const norm = (s) => s.replace(/\r\n/g, "\n");
      const h1 = createHash("sha256").update(norm(c1), "utf8").digest("hex");
      const h2 = createHash("sha256").update(norm(c2), "utf8").digest("hex");
      if (h1 !== h2) {
        errors.push({
          stage: "2e",
          ruleId: "STATE_PARITY_MISMATCH",
          message:
            `Paridade quebrada entre ${rootState} (${h1.slice(0, 10)}) e ${repoState} (${h2.slice(0, 10)}). Espelhe ambos antes do commit.`,
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    notices,
    bypassesUsed,
  };
}

function runGit(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitFileReader(repoRoot, mode, rangeHead) {
  return (relPath) => {
    try {
      if (mode === "staged") {
        return runGit(repoRoot, ["show", `:${relPath}`]);
      }
      if (mode === "range" && rangeHead) {
        return runGit(repoRoot, ["show", `${rangeHead}:${relPath}`]);
      }
      const abs = path.join(repoRoot, relPath);
      return existsSync(abs) ? readFileSync(abs, "utf8") : null;
    } catch {
      const abs = path.join(repoRoot, relPath);
      return existsSync(abs) ? readFileSync(abs, "utf8") : null;
    }
  };
}

export function runDeterministicGate({
  repoRoot = process.cwd(),
  mode = "staged",
  range = "",
  bypassReason = process.env.GATE_BYPASS_REASON || "",
} = {}) {
  let diffText = "";
  let changedFiles = [];
  let rangeHead = "";

  if (mode === "staged") {
    diffText = runGit(repoRoot, ["diff", "--cached", "--unified=0", "--no-color"]);
    const names = runGit(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
    changedFiles = names.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } else if (mode === "range") {
    if (!range) throw new Error("--range requer <base>..<head>");
    const parts = range.split("..");
    rangeHead = parts[parts.length - 1] || "HEAD";
    diffText = runGit(repoRoot, ["diff", "--unified=0", "--no-color", range]);
    const names = runGit(repoRoot, ["diff", "--name-only", "--diff-filter=ACMR", range]);
    changedFiles = names.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } else {
    // worktree: staged + unstaged + untracked
    const d1 = runGit(repoRoot, ["diff", "--cached", "--unified=0", "--no-color"]);
    const d2 = runGit(repoRoot, ["diff", "--unified=0", "--no-color"]);
    diffText = `${d1}\n${d2}`;
    const n1 = runGit(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
    const n2 = runGit(repoRoot, ["diff", "--name-only", "--diff-filter=ACMR"]);
    const untracked = runGit(repoRoot, ["ls-files", "--others", "--exclude-standard"]);
    const set = new Set(
      [...n1.split(/\r?\n/), ...n2.split(/\r?\n/), ...untracked.split(/\r?\n/)]
        .map((s) => s.trim())
        .filter(Boolean)
    );
    changedFiles = [...set];
  }

  const addedByFile = parseUnifiedDiff(diffText);

  // Em modo worktree, incluir linhas de arquivos untracked para o scan 2a/2b
  if (mode === "worktree") {
    const untracked = runGit(repoRoot, ["ls-files", "--others", "--exclude-standard"])
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const u of untracked) {
      const abs = path.join(repoRoot, u);
      if (!existsSync(abs)) continue;
      try {
        const content = readFileSync(abs, "utf8");
        if (content.includes("\u0000")) continue; // binário
        addedByFile.set(
          u.replace(/\\/g, "/"),
          content.split(/\r?\n/).map((text, idx) => ({ lineNumber: idx + 1, text }))
        );
      } catch {
        // ignora arquivos ilegíveis
      }
    }
  }

  const result = evaluateChanges({
    addedByFile,
    changedFiles,
    readFileAtTarget: gitFileReader(repoRoot, mode, rangeHead),
    bypassReason,
  });

  if (result.bypassesUsed.length > 0) {
    try {
      const tmpDir = path.join(repoRoot, ".tmp");
      mkdirSync(tmpDir, { recursive: true });
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        mode,
        bypasses: result.bypassesUsed,
      });
      appendFileSync(path.join(tmpDir, "gate-bypass.log"), entry + "\n", "utf8");
    } catch {
      // falha de log não derruba o gate
    }
  }

  return { ...result, changedFilesCount: changedFiles.length };
}

function main() {
  const argv = process.argv.slice(2);
  let mode = "staged";
  let range = "";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--staged") mode = "staged";
    else if (argv[i] === "--worktree") mode = "worktree";
    else if (argv[i] === "--range" && argv[i + 1]) {
      mode = "range";
      range = argv[i + 1];
      i++;
    }
  }

  const t0 = Date.now();
  const res = runDeterministicGate({ mode, range });
  const elapsed = Date.now() - t0;

  if (res.notices.length > 0) {
    for (const n of res.notices) console.log(n);
  }
  if (res.warnings.length > 0) {
    for (const w of res.warnings) console.warn(`[GATE-WARN][${w.stage}/${w.ruleId}] ${w.message}`);
  }
  if (!res.ok) {
    console.error(`\n❌ [GATE-BLOCK] ${res.errors.length} violação(ões) determinística(s) encontrada(s) (${elapsed}ms):`);
    for (const e of res.errors) {
      console.error(`  - [${e.stage}/${e.ruleId}] ${e.message}`);
    }
    process.exit(1);
  }

  console.log(`✅ [GATE-OK] Verificação determinística aprovada (${res.changedFilesCount} arquivo(s), ${elapsed}ms, custo $0).`);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main();
}
