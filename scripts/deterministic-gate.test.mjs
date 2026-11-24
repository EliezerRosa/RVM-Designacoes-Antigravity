import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateChanges, parseUnifiedDiff, stripSqlComments } from "./deterministic-gate.mjs";

function makeMap(obj) {
  return new Map(Object.entries(obj));
}

describe("deterministic-gate (Fase 0 / Opção Z)", () => {
  it("2a: bloqueia token Supabase PAT inclusive em arquivo .md", () => {
    const fakePat = "sbp_" + "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"; // gate-pattern-literal
    const res = evaluateChanges({
      addedByFile: makeMap({
        "_ESTADO-ATUAL.md": [{ lineNumber: 12, text: `Token: ${fakePat}` }],
      }),
      changedFiles: ["_ESTADO-ATUAL.md"],
      readFileAtTarget: () => "mesmo",
    });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.stage === "2a" && e.ruleId === "SUPABASE_PAT"));
  });

  it("2a: bloqueia telefone celular BR e CPF em documentos públicos .md (achado A2)", () => {
    const fakePhone = ["27", "9", "9876", "-", "5432"].join(""); // gate-pattern-literal
    const fakeCpf = ["123", "456", "789"].join(".") + "-01"; // gate-pattern-literal
    const res = evaluateChanges({
      addedByFile: makeMap({
        "memories/session/nota.md": [
          { lineNumber: 5, text: `Contato: ${fakePhone}` },
          { lineNumber: 6, text: `Doc: ${fakeCpf}` },
        ],
      }),
      changedFiles: ["memories/session/nota.md"],
      readFileAtTarget: () => "",
    });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.ruleId === "PII_BR_PHONE"));
    assert.ok(res.errors.some((e) => e.ruleId === "PII_BR_CPF"));
  });

  it("2a: respeita marcador gate-pattern-literal e ignora docs-local/", () => {
    const fakePhone = ["27", "9", "9876", "-", "5432"].join(""); // gate-pattern-literal
    const res = evaluateChanges({
      addedByFile: makeMap({
        "docs-local/nota.md": [{ lineNumber: 1, text: fakePhone }],
        "scripts/regex.mjs": [{ lineNumber: 2, text: `const re = /sbp_12345678901234567890/; // gate-pattern-literal` }],
      }),
      changedFiles: ["docs-local/nota.md", "scripts/regex.mjs"],
      readFileAtTarget: () => "",
    });
    assert.equal(res.ok, true);
  });

  it("2b: bloqueia novo `any` e `@ts-ignore` em src/, mas ignora comentários comuns e arquivos de teste", () => {
    const resFail = evaluateChanges({
      addedByFile: makeMap({
        "src/services/fooService.ts": [
          { lineNumber: 10, text: "// texto explicando que nao devemos usar : any aqui" },
          { lineNumber: 11, text: "/* bloco citando as any */" },
          { lineNumber: 12, text: "export function bad(x: any) { return x; }" }, // gate-pattern-literal
          { lineNumber: 13, text: "// @ts-ignore" }, // gate-pattern-literal
        ],
      }),
      changedFiles: ["src/services/fooService.ts"],
      readFileAtTarget: () => "",
    });
    assert.equal(resFail.ok, false);
    assert.equal(resFail.errors.filter((e) => e.stage === "2b").length, 2);

    const resOk = evaluateChanges({
      addedByFile: makeMap({
        "src/services/fooService.test.ts": [
          { lineNumber: 1, text: "const mock = {} as any;" }, // gate-pattern-literal
        ],
        "src/services/clean.ts": [
          { lineNumber: 1, text: "// evitar : any em codigo novo" },
          { lineNumber: 2, text: "export const ok: string = 'limpo';" },
        ],
      }),
      changedFiles: ["src/services/fooService.test.ts", "src/services/clean.ts"],
      readFileAtTarget: () => "",
    });
    assert.equal(resOk.ok, true);
  });

  it("2c: exige teste correspondente ao serviço do motor alterado (não aceita teste irrelevante)", () => {
    const resMissing = evaluateChanges({
      addedByFile: makeMap({
        "src/services/eligibilityService.ts": [{ lineNumber: 50, text: "const x = 1;" }],
        "src/components/Other.test.tsx": [{ lineNumber: 1, text: "import { Other } from './Other';" }],
      }),
      changedFiles: ["src/services/eligibilityService.ts", "src/components/Other.test.tsx"],
      readFileAtTarget: (p) => (p.endsWith("Other.test.tsx") ? "import { Other } from './Other';" : ""),
    });
    assert.equal(resMissing.ok, false);
    assert.ok(resMissing.errors.some((e) => e.ruleId === "ENGINE_COEVOLUTION_TEST"));

    const resMatched = evaluateChanges({
      addedByFile: makeMap({
        "src/services/eligibilityService.ts": [{ lineNumber: 50, text: "const x = 1;" }],
        "src/services/eligibilityService.test.ts": [{ lineNumber: 10, text: "it('checks', () => {});" }],
      }),
      changedFiles: ["src/services/eligibilityService.ts", "src/services/eligibilityService.test.ts"],
      readFileAtTarget: () => "",
    });
    assert.equal(resMatched.ok, true);
    assert.ok(resMatched.warnings.some((w) => w.ruleId === "ENGINE_VERSION_REMINDER"));
  });

  it("2c: permite bypass auditado em refactor puro do motor com GATE_BYPASS_REASON >= 8 chars", () => {
    const res = evaluateChanges({
      addedByFile: makeMap({
        "src/services/generationService.ts": [{ lineNumber: 5, text: "const renamed = true;" }],
      }),
      changedFiles: ["src/services/generationService.ts"],
      readFileAtTarget: () => "",
      bypassReason: "Refactor puro de tipagem sem mudar logica",
    });
    assert.equal(res.ok, true);
    assert.equal(res.bypassesUsed.length, 1);
  });

  it("2d: ignora DROP comentado em SQL e bloqueia DROP real sem '-- Rollback:'", () => {
    const commentedSql = "-- Rollback:\n-- DROP FUNCTION IF EXISTS public.foo();\nCREATE OR REPLACE VIEW public.v AS SELECT 1;";
    assert.equal(stripSqlComments(commentedSql).includes("DROP"), false);

    const resCommented = evaluateChanges({
      addedByFile: makeMap({}),
      changedFiles: ["supabase/migrations/20261124000001_safe.sql"],
      readFileAtTarget: () => commentedSql,
    });
    assert.equal(resCommented.ok, true);

    const resUnsafe = evaluateChanges({
      addedByFile: makeMap({}),
      changedFiles: ["supabase/migrations/20261124000002_unsafe.sql"],
      readFileAtTarget: () => "DROP TABLE public.foo;",
    });
    assert.equal(resUnsafe.ok, false);
    assert.ok(resUnsafe.errors.some((e) => e.ruleId === "SQL_DESTRUCTIVE_NO_ROLLBACK"));

    const resSafeWithRollback = evaluateChanges({
      addedByFile: makeMap({}),
      changedFiles: ["supabase/migrations/20261124000003_with_rb.sql"],
      readFileAtTarget: () => "-- Rollback: CREATE TABLE public.foo (id int);\nDROP TABLE public.foo;",
    });
    assert.equal(resSafeWithRollback.ok, true);
  });

  it("2e: exige paridade SHA-256 exata entre _ESTADO-ATUAL.md e memories/repo/_ESTADO-ATUAL.md", () => {
    const resDiff = evaluateChanges({
      addedByFile: makeMap({}),
      changedFiles: ["_ESTADO-ATUAL.md"],
      readFileAtTarget: (p) => (p === "_ESTADO-ATUAL.md" ? "v2" : "v1"),
    });
    assert.equal(resDiff.ok, false);
    assert.ok(resDiff.errors.some((e) => e.ruleId === "STATE_PARITY_MISMATCH"));

    const resSame = evaluateChanges({
      addedByFile: makeMap({}),
      changedFiles: ["_ESTADO-ATUAL.md", "memories/repo/_ESTADO-ATUAL.md"],
      readFileAtTarget: () => "conteudo identico",
    });
    assert.equal(resSame.ok, true);
  });

  it("parseUnifiedDiff extrai corretamente números de linha adicionados", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -10,0 +11,2 @@",
      "+const a = 1;",
      "+const b = 2;",
    ].join("\n");
    const map = parseUnifiedDiff(diff);
    assert.deepEqual(map.get("src/a.ts"), [
      { lineNumber: 11, text: "const a = 1;" },
      { lineNumber: 12, text: "const b = 2;" },
    ]);
  });
});
