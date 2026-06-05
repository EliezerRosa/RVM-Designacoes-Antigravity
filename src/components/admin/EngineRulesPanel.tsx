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
    BASE_SCORE: 'Pontuação base de qualquer candidato elegível.',
    TIME_POWER: 'Expoente do bônus de tempo: weeks^POWER (curva exponencial).',
    TIME_FACTOR: 'Multiplicador do bônus de tempo: × FACTOR.',
    RECENT_PARTICIPATION_PENALTY: 'Penalidade por cada participação na janela ±12 semanas.',
    COOLDOWN_PENALTY: 'Legado — não usado no score (mantido para UI). Penalidade visual de cooldown.',
    ELDER_BONUS: 'Bônus pequeno para anciãos em partes ambíguas.',
    SISTER_DEMO_PRIORITY: 'Bônus de prioridade para irmãs em demonstrações.',
    FSM_TITULAR_PROMOTION_BONUS: 'Bônus de progressão pedagógica: ajudante → titular.',
    MAX_LOOKBACK_WEEKS: 'Janela histórica máxima (semanas) para weeksSinceLast e contagens.',
    HEAVY_ROLE_BASE: 'Escala de exibição da Proximidade MAIN (chave primária da ordenação). Aplicada em gradiente sobre QUALQUER parte designável adjacente: 1 semana≈75%, 4 semanas=0%.',
    HEAVY_ROLE_RADIUS: 'Raio em semanas (±) da janela de Proximidade MAIN (passado + futuro).',
    ROLE_ALTERNATION_WINDOW_WEEKS: 'Motor — janela (semanas) para forçar alternância Titular↔Ajudante em partes FSM (leitura/demonstração/discurso estudante). Bidirecional. Escape: publicador "Só Ajudante". 0 desliga.',
    PAIR_REPETITION_WINDOW_WEEKS: 'Motor — janela (semanas) para vetar repetição do par titular+ajudante em demonstrações. Bypass: cônjuge e pai/filho podem repetir. 0 desliga.',
};

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
                <div><strong>Versão das regras de elegibilidade:</strong> <code>{ELIGIBILITY_RULES_VERSION}</code></div>
                <div><strong>Cooldown TITULAR:</strong> {COOLDOWN_WEEKS} semanas — <strong>AJUDANTE:</strong> {COOLDOWN_WEEKS_HELPER} semanas (constantes do código)</div>
            </div>

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
                    {(Object.keys(DEFAULT_ENGINE_CONFIG) as Array<keyof EngineConfig>).map(key => {
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
                                        value={cur}
                                        onChange={e => handleChange(key, e.target.value)}
                                        style={{ width: 100, padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }}
                                        disabled={saving}
                                    />
                                </td>
                                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{def}</td>
                                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#475569' }}>{KEY_DESCRIPTIONS[key as string]}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

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
