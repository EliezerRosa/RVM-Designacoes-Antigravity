/**
 * PublisherStatusHistoryTooltip.tsx
 *
 * Componente que exibe a informação de autoria do último status de participação,
 * privilégios ou seções do publicador, com popover/tooltip detalhado exibindo:
 *  - Quem fez a última mudança na área ativa
 *  - Histórico cronológico completo de mudanças
 *  - Alertas de "Status Invisíveis a Nível de Código Duro"
 *  - Recurso para CORRIGIR O AUTOR da mudança diretamente na interface
 *
 * NOTA DE ERGONOMIA:
 *  - Abre EXCLUSIVAMENTE via clique no botão (sem popups acidentais ao passar o mouse).
 *  - Fecha via clique fora ou botão "✕".
 */

import React, { useState, useRef, useEffect } from 'react';
import type { Publisher } from '../types';
import {
    type ProfileHistoryRecord,
    type FormSectionType,
    type LastChangeInfo,
    formatHistoryDate,
    formatAuthorShort,
    getFriendlyFieldName,
    getInvisibleHardcodedStatuses,
    sanitizeHistoryRecord,
    updateProfileHistoryAuthor,
} from '../services/publisherHistoryService';

export interface AuthorOption {
    label: string;
    value: string;
}

interface PublisherStatusHistoryTooltipProps {
    publisher: Publisher;
    activeSection: FormSectionType;
    lastChange: LastChangeInfo | null;
    historyList: ProfileHistoryRecord[];
    canEditAuthor?: boolean;
    token?: string | null;
    authorOptions?: AuthorOption[];
    onAuthorUpdated?: (publisherId: string, historyId: number | null, newAuthor: string) => void;
}

export const PublisherStatusHistoryTooltip: React.FC<PublisherStatusHistoryTooltipProps> = ({
    publisher,
    activeSection,
    lastChange,
    historyList,
    canEditAuthor = false,
    token = null,
    authorOptions = [],
    onAuthorUpdated,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // ── Estado de Edição de Autor ──────────────────────────────────────────
    // targetId pode ser 'lastChange' ou o ID numérico do registro no histórico
    const [editingTargetKey, setEditingTargetKey] = useState<string | null>(null);
    const [editingHistId, setEditingHistId] = useState<number | null>(null);
    const [selectedRoleValue, setSelectedRoleValue] = useState<string>('CCA');
    const [customAuthorText, setCustomAuthorText] = useState<string>('');
    const [savingAuthor, setSavingAuthor] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

    // Fecha ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setEditingTargetKey(null);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const invisibleStatuses = getInvisibleHardcodedStatuses(publisher, activeSection);
    const sanitizedHistoryList = (historyList || [])
        .map(sanitizeHistoryRecord)
        .filter(r => r.changed_fields && r.changed_fields.length > 0);
    const hasHistory = !!lastChange || sanitizedHistoryList.length > 0;

    // Opções de autor padrão caso authorOptions não seja fornecido
    const defaultAuthorOptions: AuthorOption[] = authorOptions.length > 0 ? authorOptions : [
        { label: '👑 CCA: Israel Vieira (Coordenador)', value: 'CCA: Israel Vieira' },
        { label: '📋 SEC: Marcos Rogério (Secretário)', value: 'SEC: Marcos Rogério' },
        { label: '📖 SRVM: Edmardo Queiroz (Superintendente RVM)', value: 'SRVM: Edmardo Queiroz' },
        { label: '🤝 Comissão de Serviço', value: 'Comissão de Serviço' },
        { label: '🏛️ Legado (Sem identificação de log)', value: 'legado' },
        { label: '⚙️ Admin (Ajuste Técnico)', value: 'Admin' },
    ];

    const startEditing = (targetKey: string, histId: number | null, currentAuthor: string) => {
        setEditingTargetKey(targetKey);
        setEditingHistId(histId);

        // Tenta achar match prévio nas opções
        const matched = defaultAuthorOptions.find(opt =>
            opt.value === currentAuthor || opt.label.includes(currentAuthor)
        );
        if (matched) {
            setSelectedRoleValue(matched.value);
            setCustomAuthorText('');
        } else {
            setSelectedRoleValue('custom');
            setCustomAuthorText(currentAuthor || '');
        }
    };

    const handleSaveAuthor = async () => {
        let finalAuthor = selectedRoleValue === 'custom'
            ? customAuthorText.trim()
            : selectedRoleValue;

        if (!finalAuthor) {
            alert('Por favor, informe ou selecione o autor.');
            return;
        }

        setSavingAuthor(true);
        try {
            const res = await updateProfileHistoryAuthor(editingHistId, finalAuthor, publisher.id, token);
            if (!res.success) {
                throw new Error(res.error || 'Falha ao atualizar autor no banco de dados');
            }

            setFeedbackMessage(`✓ Autor corrigido para: ${formatAuthorShort(finalAuthor)}`);
            setTimeout(() => setFeedbackMessage(null), 3500);

            if (onAuthorUpdated) {
                onAuthorUpdated(publisher.id, editingHistId, finalAuthor);
            }
            setEditingTargetKey(null);
        } catch (err: any) {
            console.error('[PublisherStatusHistoryTooltip] Erro:', err);
            alert('Erro ao salvar autor: ' + (err.message || String(err)));
        } finally {
            setSavingAuthor(false);
        }
    };

    return (
        <div
            ref={containerRef}
            style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}
        >
            {/* Badges de Status Invisíveis (Código Duro) */}
            {invisibleStatuses.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '2px' }}>
                    {invisibleStatuses.map(st => (
                        <span
                            key={st.id}
                            title={st.tooltip}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: st.badgeBg,
                                color: st.badgeColor,
                                border: `1px solid ${st.badgeColor}33`,
                                cursor: 'help',
                            }}
                        >
                            <span>{st.icon}</span>
                            <span>{st.label}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* Badge Principal "De Cara na Tela": Último que alterou */}
            {/* NOTA DE ERGONOMIA: Aciona EXCLUSIVAMENTE sob clique */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    title="Clique para ver o histórico e detalhes de quem realizou alterações"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: lastChange?.isSectionSpecific
                            ? '#EEF2FF'
                            : hasHistory
                            ? '#F1F5F9'
                            : '#F8FAFC',
                        border: `1px solid ${
                            lastChange?.isSectionSpecific
                                ? '#C7D2FE'
                                : hasHistory
                                ? '#CBD5E1'
                                : '#E2E8F0'
                        }`,
                        color: lastChange?.isSectionSpecific
                            ? '#3730A3'
                            : hasHistory
                            ? '#475569'
                            : '#94A3B8',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        outline: 'none',
                        maxWidth: '220px',
                        textAlign: 'left',
                    }}
                >
                    <span style={{ fontSize: '11px', flexShrink: 0 }}>
                        {lastChange?.isSectionSpecific ? '✏️' : '🕒'}
                    </span>
                    {lastChange ? (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <strong style={{ fontWeight: 600 }}>{lastChange.author}</strong>
                            <span style={{ color: '#64748B', fontSize: '10px', marginLeft: '4px' }}>
                                ({lastChange.dateFormatted})
                            </span>
                        </span>
                    ) : (
                        <span style={{ fontStyle: 'italic', fontSize: '10px' }}>Sem alterações registradas</span>
                    )}
                </button>
            </div>

            {/* Floating Popover / Modal com Histórico e Edição de Autor */}
            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        zIndex: 9999,
                        marginTop: '6px',
                        width: '340px',
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        border: '1px solid #CBD5E1',
                        padding: '14px',
                        fontSize: '12px',
                        color: '#1E293B',
                        animation: 'fadeIn 0.15s ease-out',
                    }}
                >
                    {/* Header do Tooltip */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px', marginBottom: '10px' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>
                                📋 Histórico & Autoria
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                                {publisher.name} ({publisher.condition})
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setIsOpen(false);
                                setEditingTargetKey(null);
                            }}
                            title="Fechar histórico"
                            style={{
                                background: '#F1F5F9',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#64748B',
                                cursor: 'pointer',
                                fontSize: '13px',
                                padding: '3px 7px',
                                fontWeight: 700,
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Feedback Toast */}
                    {feedbackMessage && (
                        <div style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', fontWeight: 600, marginBottom: '10px' }}>
                            {feedbackMessage}
                        </div>
                    )}

                    {/* Status de Código Duro (Invisíveis) */}
                    {invisibleStatuses.length > 0 && (
                        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '8px', marginBottom: '10px' }}>
                            <div style={{ fontWeight: 700, fontSize: '11px', color: '#92400E', marginBottom: '4px' }}>
                                ⚠️ Regras de Código Duro / Status Invisíveis:
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: '#78350F' }}>
                                {invisibleStatuses.map(st => (
                                    <li key={st.id} style={{ marginBottom: '2px' }}>
                                        <strong>{st.label}:</strong> {st.tooltip}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Seção 1: Última Alteração nesta Área */}
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '4px' }}>
                            {lastChange?.isSectionSpecific
                                ? `Última Mudança (${lastChange.areaLabel}):`
                                : `Aba Atual (${activeSection === 'status' ? 'Status' : activeSection === 'privileges' ? 'Privilégios' : 'Por Seção'}):`}
                        </div>

                        {lastChange?.isSectionSpecific ? (
                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontWeight: 700, color: '#1E293B' }}>
                                            👤 {lastChange.author}
                                        </span>
                                        {canEditAuthor && editingTargetKey !== 'lastChange' && (
                                            <button
                                                type="button"
                                                onClick={() => startEditing('lastChange', lastChange.record?.id ?? null, lastChange.author)}
                                                title="Corrigir quem realmente realizou esta alteração"
                                                style={{
                                                    background: '#EEF2FF',
                                                    border: '1px solid #C7D2FE',
                                                    borderRadius: '4px',
                                                    padding: '2px 6px',
                                                    fontSize: '10px',
                                                    fontWeight: 600,
                                                    color: '#4F46E5',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                ✏️ Corrigir Autor
                                            </button>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '10px', color: '#64748B' }}>
                                        {formatHistoryDate(lastChange.date, true)}
                                    </span>
                                </div>

                                {/* Form Inline de Edição de Autor para LastChange */}
                                {editingTargetKey === 'lastChange' && (
                                    <div style={{ marginTop: '8px', padding: '8px', background: '#FFFFFF', border: '1px solid #C7D2FE', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#3730A3', marginBottom: '6px' }}>
                                            ✏️ Corrigir autor desta alteração:
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <select
                                                value={selectedRoleValue}
                                                onChange={e => setSelectedRoleValue(e.target.value)}
                                                style={{
                                                    background: '#F8FAFC',
                                                    border: '1px solid #CBD5E1',
                                                    borderRadius: '6px',
                                                    padding: '4px 8px',
                                                    fontSize: '11px',
                                                    color: '#1E293B',
                                                    outline: 'none',
                                                }}
                                            >
                                                {defaultAuthorOptions.map(opt => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                                <option value="custom">✍️ Digitar outro autor...</option>
                                            </select>

                                            {selectedRoleValue === 'custom' && (
                                                <input
                                                    type="text"
                                                    placeholder="Ex: CCA: Israel Vieira..."
                                                    value={customAuthorText}
                                                    onChange={e => setCustomAuthorText(e.target.value)}
                                                    style={{
                                                        background: '#FFFFFF',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '6px',
                                                        padding: '4px 8px',
                                                        fontSize: '11px',
                                                        color: '#1E293B',
                                                        outline: 'none',
                                                    }}
                                                />
                                            )}

                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingTargetKey(null)}
                                                    disabled={savingAuthor}
                                                    style={{
                                                        background: '#F1F5F9',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '4px',
                                                        padding: '3px 8px',
                                                        fontSize: '10px',
                                                        color: '#475569',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleSaveAuthor}
                                                    disabled={savingAuthor}
                                                    style={{
                                                        background: '#4F46E5',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        padding: '3px 10px',
                                                        fontSize: '10px',
                                                        fontWeight: 600,
                                                        color: 'white',
                                                        cursor: savingAuthor ? 'wait' : 'pointer',
                                                    }}
                                                >
                                                    {savingAuthor ? '⏳ Salvando...' : '💾 Salvar Autor'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {lastChange.fields && lastChange.fields.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '6px' }}>
                                        {lastChange.fields.map((f, i) => (
                                            <span
                                                key={i}
                                                style={{
                                                    fontSize: '10px',
                                                    background: '#E0E7FF',
                                                    color: '#3730A3',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {getFriendlyFieldName(f)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '8px', padding: '8px', color: '#64748B', fontSize: '11px' }}>
                                <div>Nenhuma alteração de {activeSection === 'status' ? 'status de participação' : activeSection === 'privileges' ? 'privilégios' : 'seções'} registrada.</div>
                                {lastChange && (
                                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #E2E8F0', fontSize: '10px', color: '#475569' }}>
                                        <span>Última alteração geral: <strong>{lastChange.author}</strong> ({lastChange.dateFormatted})</span>
                                        {lastChange.fields && lastChange.fields.length > 0 && (
                                            <div style={{ color: '#64748B', marginTop: '2px' }}>
                                                {lastChange.fields.map(getFriendlyFieldName).join(', ')}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Seção 2: Linha do Tempo de Alterações Anteriores */}
                    {sanitizedHistoryList.length > 0 && (
                        <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '6px' }}>
                                Histórico Recente ({sanitizedHistoryList.length}):
                            </div>
                            <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                                {sanitizedHistoryList.slice(0, 6).map((rec, i) => {
                                    const recKey = `rec_${rec.id || i}`;
                                    const isEditingRec = editingTargetKey === recKey;

                                    return (
                                        <div
                                            key={rec.id || i}
                                            style={{
                                                borderLeft: '2px solid #6366F1',
                                                paddingLeft: '8px',
                                                paddingTop: '2px',
                                                paddingBottom: '4px',
                                                fontSize: '11px',
                                                background: isEditingRec ? '#F8FAFC' : 'transparent',
                                                borderRadius: '0 6px 6px 0',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontWeight: 600, color: '#334155' }}>
                                                        {formatAuthorShort(rec.author_label)}
                                                    </span>
                                                    {canEditAuthor && !isEditingRec && (
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditing(recKey, rec.id, rec.author_label)}
                                                            title="Corrigir autor deste registro histórico"
                                                            style={{
                                                                background: 'transparent',
                                                                border: 'none',
                                                                padding: '0 2px',
                                                                fontSize: '10px',
                                                                color: '#6366F1',
                                                                cursor: 'pointer',
                                                                textDecoration: 'underline',
                                                            }}
                                                        >
                                                            corrigir
                                                        </button>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                                                    {formatHistoryDate(rec.changed_at)}
                                                </span>
                                            </div>

                                            {/* Form Inline de Edição de Autor para Registro do Histórico */}
                                            {isEditingRec && (
                                                <div style={{ marginTop: '6px', padding: '6px', background: '#FFFFFF', border: '1px solid #C7D2FE', borderRadius: '6px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                        <select
                                                            value={selectedRoleValue}
                                                            onChange={e => setSelectedRoleValue(e.target.value)}
                                                            style={{
                                                                background: '#F8FAFC',
                                                                border: '1px solid #CBD5E1',
                                                                borderRadius: '4px',
                                                                padding: '3px 6px',
                                                                fontSize: '10px',
                                                                color: '#1E293B',
                                                            }}
                                                        >
                                                            {defaultAuthorOptions.map(opt => (
                                                                <option key={opt.value} value={opt.value}>
                                                                    {opt.label}
                                                                </option>
                                                            ))}
                                                            <option value="custom">✍️ Digitar outro autor...</option>
                                                        </select>

                                                        {selectedRoleValue === 'custom' && (
                                                            <input
                                                                type="text"
                                                                placeholder="Ex: CCA: Israel Vieira..."
                                                                value={customAuthorText}
                                                                onChange={e => setCustomAuthorText(e.target.value)}
                                                                style={{
                                                                    background: '#FFFFFF',
                                                                    border: '1px solid #CBD5E1',
                                                                    borderRadius: '4px',
                                                                    padding: '3px 6px',
                                                                    fontSize: '10px',
                                                                    color: '#1E293B',
                                                                }}
                                                            />
                                                        )}

                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingTargetKey(null)}
                                                                disabled={savingAuthor}
                                                                style={{
                                                                    background: '#F1F5F9',
                                                                    border: '1px solid #CBD5E1',
                                                                    borderRadius: '3px',
                                                                    padding: '2px 6px',
                                                                    fontSize: '9px',
                                                                    color: '#475569',
                                                                    cursor: 'pointer',
                                                                }}
                                                            >
                                                                Cancelar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={handleSaveAuthor}
                                                                disabled={savingAuthor}
                                                                style={{
                                                                    background: '#4F46E5',
                                                                    border: 'none',
                                                                    borderRadius: '3px',
                                                                    padding: '2px 8px',
                                                                    fontSize: '9px',
                                                                    fontWeight: 600,
                                                                    color: 'white',
                                                                    cursor: savingAuthor ? 'wait' : 'pointer',
                                                                }}
                                                            >
                                                                {savingAuthor ? '...' : 'Salvar'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ color: '#64748B', fontSize: '10px', marginTop: '1px' }}>
                                                {rec.changed_fields?.map(getFriendlyFieldName).join(', ') || 'Modificação no perfil'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9', fontSize: '10px', color: '#94A3B8', textAlign: 'center' }}>
                        💡 Você pode corrigir a autoria histórica clicando em <strong>Corrigir</strong>.
                    </div>
                </div>
            )}
        </div>
    );
};
