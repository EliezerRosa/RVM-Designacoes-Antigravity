/**
 * EngineRulesPanel — Admin UI para visualizar e ajustar a configuração
 * runtime do motor de rotação (CURRENT_SCORING_CONFIG).
 *
 * Persistência: setting `engine_config` (já carregado no boot por
 * useAuthenticatedAppData → updateRotationConfig).
 *
 * Auditoria: cada save grava em audit_log via auditService.
 *
 * Princípio (IDD): motor é oráculo determinístico; admin pode ajustar
 * pesos, mas a estrutura da fórmula permanece imutável.
 */

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { auditService } from '../../services/auditService';
import { ELIGIBILITY_RULES_VERSION } from '../../services/eligibilityService';
import { getRotationConfig } from '../../services/unifiedRotationService';
import { engineConfigService } from '../../services/engineConfigService';
import { COOLDOWN_WEEKS, COOLDOWN_WEEKS_HELPER } from '../../services/cooldownService';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '../../types';

// Shape canônico unificado: ver `EngineConfig` em `types.ts`.
// Persistência centralizada via `engineConfigService.updateEngineConfig`.
type ConfigKV = EngineConfig;

const KEY_DESCRIPTIONS: Record<string, string> = {
    // — Decidem a ordenação —
    HEAVY_ROLE_RADIUS: 'Raio (±semanas) da Proximidade MAIN — 1ª chave da ordenação e janela do gate de não-repetição da mesma parte. Passado + futuro.',
    MAX_LOOKBACK_WEEKS: 'Janela histórica máxima (semanas): cap do frescor nesta parte (3ª chave) e janela do total de participações (5ª chave).',
    PRESIDENCY_CYCLE_WINDOW_WEEKS: 'Fila cíclica de presidência: faixa = nº de presidências em ±N semanas; quem presidiu menos vem antes. Ninguém preside pela k+1ª vez enquanto houver elegível com k.',
    STUDENT_PART_GUARANTEE_WEEKS: 'Garantia de parte de estudante: ancião/SM sem nenhuma parte de estudante (titular ou ajudante) em ±N semanas vai à faixa 0 (antes das irmãs) em leitura/demonstração/discurso de estudante.',
    STUDENT_GUARANTEE_MAX_PER_WEEK: 'Teto semanal da garantia acima: no máximo N titulares ancião/SM em partes de estudante por semana (equilíbrio com o ensino).',
    ROLE_ALTERNATION_WINDOW_WEEKS: 'Gate relaxável — janela (semanas) de alternância Titular↔Ajudante em partes FSM. Escape: publicador "Só Ajudante". 0 desliga.',
    PAIR_REPETITION_WINDOW_WEEKS: 'Gate relaxável — janela (semanas) para não repetir o par titular+ajudante. Bypass: cônjuge e pai/filho. 0 desliga.',
    ENABLE_SECTION_ROTATION_GATE: 'Gate relaxável — rotação intra-seção (Tesouros: Discurso↔Joias; Vida Cristã: Parte VC↔Dirigente EBC). 1 liga, 0 desliga.',
    // — Apenas exibição (score legado) —
    BASE_SCORE: 'Exibição: base do score legado. Não altera quem é designado.',
    TIME_POWER: 'Exibição: expoente do bônus de tempo. Transformação monótona — não altera a ordem.',
    TIME_FACTOR: 'Exibição: fator do bônus de tempo. Não altera a ordem.',
    RECENT_PARTICIPATION_PENALTY: 'Exibição: penalidade por participação no score legado. A chave real é a contagem em ±12 semanas.',
    HEAVY_ROLE_BASE: 'Exibição: escala da penalidade de proximidade no score legado. A chave real é proximityCost.',
};

const DECISIVE_KEYS: Array<keyof EngineConfig> = [
    'HEAVY_ROLE_RADIUS', 'MAX_LOOKBACK_WEEKS', 'PRESIDENCY_CYCLE_WINDOW_WEEKS', 'STUDENT_PART_GUARANTEE_WEEKS',
    'STUDENT_GUARANTEE_MAX_PER_WEEK', 'ROLE_ALTERNATION_WINDOW_WEEKS', 'PAIR_REPETITION_WINDOW_WEEKS', 'ENABLE_SECTION_ROTATION_GATE',
];
const DISPLAY_ONLY_KEYS = (Object.keys(DEFAULT_ENGINE_CONFIG) as Array<keyof EngineConfig>).filter(k => !DECISIVE_KEYS.includes(k));

export function EngineRulesPanel() {
    const initial = useMemo<ConfigKV>(() => ({ ...DEFAULT_ENGINE_CONFIG, ...getRotationConfig() }), []);
    const [config, setConfig] = useState<ConfigKV>(initial);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.getSetting<Partial<ConfigKV> | null>('engine_config', null)
            .then(stored => {
                if (cancelled || !stored) return;
                setConfig(prev => ({ ...prev, ...stored }));
            })
            .catch(() => { /* ignore */ });
        return () => { cancelled = true; };
    }, []);

    const isDirty = useMemo(() => {
        const live = getRotationConfig();
        for (const k of Object.keys(config) as Array<keyof EngineConfig>) {
            if (live[k] !== config[k]) return true;
        }
        return false;
    }, [config]);

    const handleChange = (key: keyof EngineConfig, value: string) => {
        const num = Number(value);
        if (Number.isNaN(num)) return;
        setConfig(prev => ({ ...prev, [key]: num }));
        setFeedback(null);
    };

    const handleSave = async () => {
        setSaving(true);
        setFeedback(null);
        try {
            const before = getRotationConfig();
            const { mergedConfig } = await engineConfigService.updateEngineConfig(config);
            await auditService.logAction({
                table_name: 'settings',
                operation: 'MANUAL_OVERRIDE',
                record_id: 'engine_config',
                old_data: before,
                new_data: mergedConfig,
                description: 'Admin ajustou regras do motor via EngineRulesPanel',
            });
            setFeedback({ kind: 'ok', msg: 'Configuração salva e aplicada.' });
        } catch (e) {
            console.error('[EngineRulesPanel] save failed', e);
            setFeedback({ kind: 'err', msg: `Erro ao salvar: ${e instanceof Error ? e.message : String(e)}` });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!confirm('Restaurar valores padrão e descartar configuração persistida?')) return;
        setSaving(true);
        setFeedback(null);
        try {
            const before = getRotationConfig();
            const { mergedConfig } = await engineConfigService.updateEngineConfig({ ...DEFAULT_ENGINE_CONFIG });
            setConfig({ ...DEFAULT_ENGINE_CONFIG });
            await auditService.logAction({
                table_name: 'settings',
                operation: 'MANUAL_OVERRIDE',
                record_id: 'engine_config',
                old_data: before,
                new_data: mergedConfig,
                description: 'Admin restaurou regras do motor para padrão',
            });
            setFeedback({ kind: 'ok', msg: 'Restaurado para padrão.' });
        } catch (e) {
            setFeedback({ kind: 'err', msg: `Erro ao restaurar: ${e instanceof Error ? e.message : String(e)}` });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 16, padding: 12, background: '#f0f4f8', borderRadius: 8, fontSize: 13 }}>
                <div><strong>Versão das regras:</strong> <code>{ELIGIBILITY_RULES_VERSION}</code></div>
                <div><strong>Ordenação real</strong> (dentro de cada faixa): proximidade MAIN › carga ±12 sem › frescor nesta parte › mais esquecido › menos partes no ano › nome. O número “score” é legado e não decide.</div>
                <div><strong>Cooldown visual:</strong> {COOLDOWN_WEEKS} semanas (titular) / {COOLDOWN_WEEKS_HELPER} (ajudante) — só indicador; não bloqueia.</div>
            </div>

            {[{ title: 'Decidem quem é designado', keys: DECISIVE_KEYS }, { title: 'Apenas exibição (score legado)', keys: DISPLAY_ONLY_KEYS }].map(group => (
            <div key={group.title} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#334155', margin: '8px 0' }}>{group.title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                        <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Chave</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Valor</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Padrão</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Descrição</th>
                    </tr>
                </thead>
                <tbody>
                    {group.keys.map(key => {
                        const def = DEFAULT_ENGINE_CONFIG[key];
                        const cur = config[key] ?? def;
                        const changed = cur !== def;
                        return (
                            <tr key={key} style={{ background: changed ? '#fef9c3' : 'transparent' }}>
                                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', fontFamily: 'monospace', fontSize: 12 }}>{key}</td>
                                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                                    <input
                                        type="number"
                                        step="any"
                                        value={typeof cur === 'boolean' ? (cur ? 1 : 0) : cur}
                                        onChange={e => handleChange(key, e.target.value)}
                                        style={{ width: 100, padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }}
                                        disabled={saving}
                                    />
                                </td>
                                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{String(def)}</td>
                                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#475569' }}>{KEY_DESCRIPTIONS[key as string]}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            </div>
            ))}

            <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    style={{ padding: '8px 16px', background: isDirty ? '#2563eb' : '#94a3b8', color: 'white', border: 'none', borderRadius: 6, cursor: isDirty && !saving ? 'pointer' : 'not-allowed' }}
                >
                    {saving ? 'Salvando…' : 'Salvar e aplicar'}
                </button>
                <button
                    type="button"
                    onClick={handleReset}
                    disabled={saving}
                    style={{ padding: '8px 16px', background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                    Restaurar padrão
                </button>
                {feedback && (
                    <span style={{ marginLeft: 12, color: feedback.kind === 'ok' ? '#15803d' : '#dc2626', fontSize: 13 }}>
                        {feedback.msg}
                    </span>
                )}
            </div>

            <div style={{ marginTop: 16, padding: 12, background: '#fef3c7', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                ⚠️ Mudanças aplicam imediatamente em toda a sessão. Outros usuários precisam recarregar para receber a nova configuração (carregada no boot via <code>engine_config</code>).
            </div>
        </div>
    );
}
