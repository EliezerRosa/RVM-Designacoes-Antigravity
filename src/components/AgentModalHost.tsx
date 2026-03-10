/**
 * AgentModalHost - Orquestrador de modais CRUD acionados pelo Agente
 * 
 * Renderiza componentes existentes (PublisherList, SpecialEventsManager, etc.)
 * dentro de um overlay modal, sem modificar nenhum deles.
 * 
 * Princípios:
 * - Zero dependências novas
 * - Desacoplado dos componentes que renderiza
 * - Extensível: adicionar novo modal = adicionar 1 case no switch
 */

import { useState, useCallback } from 'react';
import type { Publisher, WorkbookPart } from '../types';
import PublisherList from './PublisherList';
import PublisherForm from './PublisherForm';
import { SpecialEventsManager } from './SpecialEventsManager';
import { LocalNeedsQueue } from './LocalNeedsQueue';
import { WorkbookTable } from './WorkbookTable';
import { api } from '../services/api';

export type AgentModalType = 'publishers' | 'workbook' | 'events' | 'local_needs' | null;

interface Props {
    modal: AgentModalType;
    onClose: () => void;
    publishers: Publisher[];
    weekParts: Record<string, WorkbookPart[]>;
    weekOrder: string[];
    focusWeekId?: string;
    onDataChange?: () => void;
}

export default function AgentModalHost({ modal, onClose, publishers, weekParts, weekOrder, focusWeekId, onDataChange }: Props) {
    // Publisher CRUD state
    const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null);
    const [showPublisherForm, setShowPublisherForm] = useState(false);

    if (!modal) return null;

    const handleClose = () => {
        setEditingPublisher(null);
        setShowPublisherForm(false);
        onClose();
    };

    // ===== Publisher Handlers =====
    const handleEditPublisher = (publisher: Publisher) => {
        setEditingPublisher(publisher);
        setShowPublisherForm(true);
    };

    const handleDeletePublisher = async (publisher: Publisher) => {
        if (confirm(`Remover ${publisher.name}?`)) {
            try {
                await api.deletePublisher(publisher.id);
                if (onDataChange) onDataChange();
            } catch (err) {
                console.error('Erro ao remover publicador:', err);
            }
        }
    };

    const handleSavePublisher = async (publisher: Publisher) => {
        try {
            if (editingPublisher) {
                await api.updatePublisher(publisher);
            } else {
                await api.createPublisher(publisher);
            }
            setShowPublisherForm(false);
            setEditingPublisher(null);
            if (onDataChange) onDataChange();
        } catch (err) {
            console.error('Erro ao salvar publicador:', err);
        }
    };

    const handleCancelPublisherForm = () => {
        setShowPublisherForm(false);
        setEditingPublisher(null);
    };

    // ===== Available weeks for SpecialEvents / LocalNeeds =====
    const availableWeeks = weekOrder.map(wId => ({
        weekId: wId,
        display: wId
    }));

    // ===== Modal title =====
    const getTitle = () => {
        switch (modal) {
            case 'publishers': return '👥 Publicadores';
            case 'workbook': return '📖 Apostila — Semana em Foco';
            case 'events': return '🎉 Eventos Especiais';
            case 'local_needs': return '📋 Necessidades Locais';
            default: return '';
        }
    };

    // ===== Modal content =====
    const renderContent = () => {
        switch (modal) {
            case 'publishers':
                if (showPublisherForm) {
                    return (
                        <PublisherForm
                            publisher={editingPublisher}
                            publishers={publishers}
                            onSave={handleSavePublisher}
                            onCancel={handleCancelPublisherForm}
                        />
                    );
                }
                return (
                    <div>
                        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                {publishers.length} publicadores cadastrados
                            </span>
                            <button
                                onClick={() => { setEditingPublisher(null); setShowPublisherForm(true); }}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: 'var(--primary-500)',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.9rem'
                                }}
                            >
                                ➕ Novo Publicador
                            </button>
                        </div>
                        <PublisherList
                            publishers={publishers}
                            onEdit={handleEditPublisher}
                            onDelete={handleDeletePublisher}
                        />
                    </div>
                );

            case 'workbook': {
                const currentParts = weekParts[focusWeekId || ''] || [];
                if (currentParts.length === 0) {
                    return (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            <p style={{ fontSize: '1.1rem' }}>Nenhuma parte encontrada para a semana {focusWeekId || 'selecionada'}.</p>
                            <p style={{ fontSize: '0.9rem' }}>Faça upload da apostila na aba Apostila primeiro.</p>
                        </div>
                    );
                }
                return (
                    <WorkbookTable
                        filteredParts={currentParts}
                        publishers={publishers}
                        historyRecords={[]}
                        currentPage={0}
                        onPublisherSelect={() => { }}
                        onEditPart={() => { }}
                    />
                );
            }

            case 'events':
                return (
                    <SpecialEventsManager
                        availableWeeks={availableWeeks}
                        onClose={handleClose}
                        onEventApplied={() => { if (onDataChange) onDataChange(); }}
                    />
                );

            case 'local_needs':
                return (
                    <LocalNeedsQueue
                        publishers={publishers.map(p => ({ id: p.id, name: p.name, condition: p.condition }))}
                        availableWeeks={availableWeeks}
                        onClose={handleClose}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '20px'
            }}
            onClick={handleClose}
        >
            <div
                style={{
                    background: 'var(--bg-primary, #fff)',
                    borderRadius: '16px',
                    width: '95%',
                    maxWidth: '900px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    overflow: 'hidden'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 24px',
                    borderBottom: '1px solid var(--border-color, #e5e7eb)',
                    background: 'var(--bg-secondary, #f9fafb)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary, #111)' }}>
                        {getTitle()}
                    </h2>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            color: 'var(--text-muted, #6b7280)',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            lineHeight: 1
                        }}
                        title="Fechar"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '24px'
                }}>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
