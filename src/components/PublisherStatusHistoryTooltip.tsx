/**
 * PublisherStatusHistoryTooltip.tsx
 *
 * Componente que exibe a informação de autoria do último status de participação,
 * privilégios ou seções do publicador, com popover/tooltip detalhado exibindo:
 *  - Quem fez a última mudança na área ativa
 *  - Histórico cronológico completo de mudanças
 *  - Alertas de "Status Invisíveis a Nível de Código Duro"
 */

import React, { useState, useRef, useEffect } from 'react';
import type { Publisher } from '../types';
import {
    type ProfileHistoryRecord,
    type FormSectionType,
    type LastChangeInfo,
    formatHistoryDate,
    getFriendlyFieldName,
    getInvisibleHardcodedStatuses,
    sanitizeHistoryRecord,
} from '../services/publisherHistoryService';

interface PublisherStatusHistoryTooltipProps {
    publisher: Publisher;
    activeSection: FormSectionType;
    lastChange: LastChangeInfo | null;
    historyList: ProfileHistoryRecord[];
}

export const PublisherStatusHistoryTooltip: React.FC<PublisherStatusHistoryTooltipProps> = ({
    publisher,
    activeSection,
    lastChange,
    historyList,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fecha ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    onMouseEnter={() => setIsOpen(true)}
                    title="Clique para ver o histórico detalhado de alterações deste publicador"
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

            {/* Floating Tooltip / Popover com Histórico */}
            {isOpen && (
                <div
                    onMouseLeave={() => setIsOpen(false)}
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        zIndex: 9999,
                        marginTop: '6px',
                        width: '320px',
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        border: '1px solid #E2E8F0',
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
                                📋 Histórico de Alterações
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                                {publisher.name} ({publisher.condition})
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                fontSize: '14px',
                                padding: '2px',
                            }}
                        >
                            ✕
                        </button>
                    </div>

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
                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 700, color: '#1E293B' }}>
                                        👤 {lastChange.author}
                                    </span>
                                    <span style={{ fontSize: '10px', color: '#64748B' }}>
                                        {formatHistoryDate(lastChange.date, true)}
                                    </span>
                                </div>
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
                            <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                                {sanitizedHistoryList.slice(0, 6).map((rec, i) => (
                                    <div
                                        key={rec.id || i}
                                        style={{
                                            borderLeft: '2px solid #6366F1',
                                            paddingLeft: '8px',
                                            paddingTop: '2px',
                                            paddingBottom: '2px',
                                            fontSize: '11px',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontWeight: 600, color: '#334155' }}>
                                                {rec.author_label}
                                            </span>
                                            <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                                                {formatHistoryDate(rec.changed_at)}
                                            </span>
                                        </div>
                                        <div style={{ color: '#64748B', fontSize: '10px', marginTop: '1px' }}>
                                            {rec.changed_fields?.map(getFriendlyFieldName).join(', ') || 'Modificação no perfil'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9', fontSize: '10px', color: '#94A3B8', textAlign: 'center' }}>
                        💡 O registro de autoria é gerado automaticamente pelo sistema.
                    </div>
                </div>
            )}
        </div>
    );
};
