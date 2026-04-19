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

import { useState } from 'react';
import type { Publisher, WorkbookPart } from '../types';
import PublisherList from './PublisherList';
import PublisherForm from './PublisherForm';
import { SpecialEventsManager } from './SpecialEventsManager';
import { LocalNeedsQueue } from './LocalNeedsQueue';
import { WorkbookTable } from './WorkbookTable';
import { PartEditModal } from './PartEditModal';
import { api } from '../services/api';
import { workbookService } from '../services/workbookService';
import { workbookManagementService } from '../services/workbookManagementService';
import { publisherMutationService } from '../services/publisherMutationService';
import TerritoryManager from './TerritoryManager';
import { WorkbookImportModal } from './WorkbookImportModal';
import { FloatingPanelShell } from './ui/FloatingPanelShell';

export type AgentModalType = 'publishers' | 'workbook' | 'events' | 'local_needs' | 'territories' | 'workbook_import' | null;

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

    // Workbook CRUD state
    const [editingPart, setEditingPart] = useState<WorkbookPart | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    if (!modal) return null;

    const handleClose = () => {
        setEditingPublisher(null);
        setShowPublisherForm(false);
        setEditingPart(null);
        setIsEditModalOpen(false);
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
                await publisherMutationService.savePublisherWithPropagation(publisher, editingPublisher);
            } else {
                await publisherMutationService.savePublisherWithPropagation(publisher);
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

    // ===== Workbook Handlers =====
    const handleEditPart = (part: WorkbookPart) => {
        setEditingPart(part);
        setIsEditModalOpen(true);
    };

    const handleSaveEditPart = async (id: string, updates: Partial<WorkbookPart>, applyToWeek?: boolean) => {
        try {
            if (updates.status === 'PENDENTE') {
                updates.resolvedPublisherName = '';
            }

            const updatedPart = await workbookManagementService.updatePart(id, updates);

            if (applyToWeek && updates.status && updatedPart.weekId) {
                const clearPublisher = updates.status === 'PENDENTE';
                await workbookService.updateWeekStatus(updatedPart.weekId, updates.status, clearPublisher);
            }

            if (onDataChange) onDataChange();
            setIsEditModalOpen(false);
            setEditingPart(null);
        } catch (error) {
            console.error('Erro ao salvar parte:', error);
            alert('Erro ao salvar alterações: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    };

    const handlePublisherSelect = async (partId: string, _newId: string, newName: string) => {
        try {
            await workbookManagementService.updatePart(partId, {
                resolvedPublisherName: newName,
                status: 'DESIGNADA'
            });
            if (onDataChange) onDataChange();
        } catch (error) {
            console.error('Erro ao designar publicador:', error);
            alert('Não foi possível designar o publicador.');
        }
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
            case 'territories': return '🗺️ Territórios';
            case 'workbook_import': return '📥 Importar Apostila do JW.org';
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
                    <>
                        <WorkbookTable
                            filteredParts={currentParts}
                            publishers={publishers}
                            historyRecords={[]}
                            currentPage={0}
                            onPublisherSelect={handlePublisherSelect}
                            onEditPart={handleEditPart}
                        />
                        {isEditModalOpen && editingPart && (
                            <PartEditModal
                                isOpen={isEditModalOpen}
                                onClose={() => {
                                    setIsEditModalOpen(false);
                                    setEditingPart(null);
                                }}
                                part={editingPart}
                                onSave={handleSaveEditPart}
                            />
                        )}
                    </>
                );
            }

            case 'events':
                return (
                    <SpecialEventsManager
                        availableWeeks={availableWeeks}
                        workbookParts={Object.values(weekParts).flat()}
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

            case 'territories':
                return <TerritoryManager />;

            case 'workbook_import':
                return (
                    <WorkbookImportModal
                        onClose={handleClose}
                        onDataChange={onDataChange}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <FloatingPanelShell
            id={`agent-modal-${modal}`}
            isOpen={Boolean(modal)}
            onClose={handleClose}
            resetKey={`${modal}-${focusWeekId || ''}`}
            title={getTitle()}
            subtitle="Painel operacional do agente"
            accent="#7C3AED"
            width="min(900px, calc(100vw - 48px))"
            maxWidth="calc(100vw - 48px)"
            maxHeight="min(82vh, 860px)"
        >
            <div style={{ padding: '24px' }}>
                {renderContent()}
            </div>
        </FloatingPanelShell>
    );
}
