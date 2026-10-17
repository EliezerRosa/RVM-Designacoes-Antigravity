// scripts/jev-check.mjs
// Verificador de conformidade via Jev (Decisions API - OpenRouter).
// Uso: node scripts/jev-check.mjs <caminho-do-diff> [caminho-das-regras]
// Saída: JSON com as decisões. Exit 0 = aprovado, 1 = reprovado, 2 = erro (uso, HTTP ou resposta incompleta).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile(join(projectRoot, '.env.local'));

const [diffPath, rulesPath = join(projectRoot, 'memories/regras-intencao.md')] = process.argv.slice(2);
if (!diffPath) { console.error('Uso: node scripts/jev-check.mjs <diff> [regras]'); process.exit(2); }
if (!process.env.OPENROUTER_API_KEY) {
  console.error('ERRO: OPENROUTER_API_KEY ausente em .env.local');
  process.exit(2);
}

const diff = readFileSync(diffPath, 'utf-8');
const regras = existsSync(rulesPath) ? readFileSync(rulesPath, 'utf-8') : '(sem regras registradas)';

const res = await fetch('https://openrouter.ai/api/alpha/decisions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://rvm-designacoes-antigravity.vercel.app',
    'X-Title': 'RVM Designacoes Curator',
  },
  body: JSON.stringify({
    model: 'typesafe/jev-1.14',
    state: { regras, diff },
    questions: {
      conforme: {
        type: 'noul',
        instructions: 'O diff proposto está em conformidade com TODAS as regras de intenção?',
        criteria: { true: 'Cumpre todas as regras.', false: 'Viola pelo menos uma regra.' },
      },
      violacao: {
        type: 'choice',
        instructions: 'Qual regra é violada, se houver?',
        criteria: {
          nenhuma: 'Sem violação.',
          segredos: 'Toca arquivos .env* ou expõe segredos.',
          estilo: 'Viola convenções de código do projeto.',
          dominio: 'Contraria regras de negócio/domínio.',
        },
      },
      risco: {
        type: 'score',
        instructions: 'Risco de aplicar este diff no estado atual.',
        criteria: ['Baixo', 'Médio', 'Alto'],
      },
    },
  }),
});

if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  console.error(await res.text());
  process.exit(2);
}
const json = await res.json();
console.log(JSON.stringify(json.answers ?? json, null, 2));

// Gate v2 (calibrado 2026-10-16 com diffs rotulados; bruto em .tmp/jev/results-*.json).
// Observado: p.nenhuma ok >= 0.93 / bad <= 0.02; risco ok <= 0.02 / bad >= 1.57.
const a = json.answers ?? {};
const conforme = a?.conforme?.noul;                  // informativo, não decide
const violacao = a?.violacao?.choice;
const pNenhuma = a?.violacao?.probabilities?.nenhuma; // absoluto: prob. de não violar
const risco = a?.risco?.score;
const pRiscoBaixo = a?.risco?.probabilities?.['0'];

const LIMIAR_NENHUMA = 0.90; // reprovar bom = retrabalho; aprovar ruim = erro caro
const LIMIAR_RISCO = 1.0;    // 0=Baixo, 1=Médio, 2=Alto: exige risco abaixo de Médio

if (typeof pNenhuma !== 'number' || typeof risco !== 'number') {
  console.error('AVISO: campos ausentes na resposta; revisar manualmente.');
  console.error(`conforme=${conforme} violacao=${violacao} pNenhuma=${pNenhuma} risco=${risco}`);
  process.exit(2);
}
const aprovado = pNenhuma >= LIMIAR_NENHUMA && risco < LIMIAR_RISCO;
console.error(`noul=${conforme} violacao=${violacao} (p=${pNenhuma}) risco=${risco} (pBaixo=${pRiscoBaixo})`);
console.error(aprovado ? 'RESULTADO: APROVADO' : 'RESULTADO: REPROVADO');
process.exit(aprovado ? 0 : 1);
