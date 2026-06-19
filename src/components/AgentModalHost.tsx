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
import { unifiedActionService } from '../services/unifiedActionService';
import { publisherMutationService } from '../services/publisherMutationService';
import { findPublisherImpediments, type ImpedimentEntry } from '../services/publisherImpedimentService';
import { PublisherImpedimentModal } from './PublisherImpedimentModal';
import TerritoryManager from './TerritoryManager';
import { WorkbookImportModal } from './WorkbookImportModal';
import { FloatingPanelShell } from './ui/FloatingPanelShell';
import { getTodayWeekIdLocal } from '../utils/dateUtils';
import { ProfileLinksPanel } from './admin/ProfileLinksPanel';
import { ManualReplacementModal } from './admin/ManualReplacementModal';

export type AgentModalType = 'publishers' | 'workbook' | 'events' | 'local_needs' | 'territories' | 'workbook_import' | 'profile_links' | 'manual_replacement' | null;

interface Props {
    modal: AgentModalType;
    onClose: () => void;
    publishers: Publisher[];
    weekParts: Record<string, WorkbookPart[]>;
    weekOrder: string[];
    focusWeekId?: string;
    onDataChange?: () => void;
    modalParams?: any;
}

export default function AgentModalHost({ modal, onClose, publishers, weekParts, weekOrder, focusWeekId, onDataChange, modalParams }: Props) {
    // Publisher CRUD state
    const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null);
    const [showPublisherForm, setShowPublisherForm] = useState(false);
    const [pendingImpediments, setPendingImpediments] = useState<{
        publisher: Publisher;
        impediments: ImpedimentEntry[];
        proceedSave: () => Promise<void>;
    } | null>(null);

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
        if (editingPublisher) {
            const allParts = Object.values(weekParts).flat();
            const todayWeekId = getTodayWeekIdLocal();
            const impediments = findPublisherImpediments(editingPublisher, publisher, allParts, publishers, todayWeekId);
            if (impediments.length > 0) {
                setPendingImpediments({
                    publisher,
                    impediments,
                    proceedSave: async () => {
                        setPendingImpediments(null);
                        await doSavePublisher(publisher);
                    },
                });
                return;
            }
        }
        await doSavePublisher(publisher);
    };

    const doSavePublisher = async (publisher: Publisher) => {
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
            const result = await unifiedActionService.executeDesignation(partId, newName, 'MANUAL');
            if (!result.success) {
                alert(`Erro ao designar: ${result.error}`);
                return;
            }
            if (result.warnings?.length) {
                console.warn('[AgentModalHost] Avisos:', result.warnings);
                alert(`Designação realizada com avisos:\n${result.warnings.join('\n')}`);
            }
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
            case 'profile_links': return '🔗 Vínculos Pendentes';
            case 'manual_replacement': return '🔄 Substituição Manual';
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
                        publishers={publishers}
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

            case 'profile_links':
                return (
                    <ProfileLinksPanel />
                );

            case 'manual_replacement': {
                if (!modalParams) return null;
                const { partId, newId, newName, oldName, part } = modalParams;

                const handleConfirmReplacement = async (options: { notifyOld: boolean; notifyNew: boolean; notifyPartner: boolean }) => {
                    try {
                        // 1. Executar no banco
                        await unifiedActionService.executeDesignation(partId, newName, 'MANUAL');

                        // 2. Acionar Z-API Notifications
                        if (options.notifyOld || options.notifyNew || options.notifyPartner) {
                            // Dinamicamente importar e disparar, mesma lógica do WorkbookManager
                            const { zapiOrchestrator } = await import('../services/zapiOrchestrator');
                            const { generateS89PngBase64, generateWhatsAppMessage } = await import('../services/s89Generator');
                            const { communicationService } = await import('../services/communicationService');

                            const oldPub = publishers.find(p => p.name === oldName || p.id === part.resolvedPublisherId);
                            const newPub = publishers.find(p => p.id === newId || p.name === newName);
                            
                            const isAjudante = part.funcao === 'Ajudante';
                            const allParts = Object.values(weekParts).flat();
                            const partnerPart = allParts.find(p => 
                                p.weekId === part.weekId && 
                                p.tipoParte === part.tipoParte && 
                                p.id !== part.id &&
                                (isAjudante ? p.funcao === 'Titular' : p.funcao === 'Ajudante')
                            );
                            const partnerPubName = partnerPart?.resolvedPublisherName || partnerPart?.rawPublisherName;
                            const partnerPub = publishers.find(p => p.name === partnerPubName);

                            if (options.notifyOld && oldPub?.phone) {
                                await zapiOrchestrator.dispatchManualReplacementAlert(oldPub.phone, oldPub.name, part.tituloParte || part.tipoParte, part.date || part.weekId);
                            }
                            if (options.notifyNew && newPub?.phone) {
                                const pdfBase64 = await generateS89PngBase64({ ...part, resolvedPublisherName: newPub.name }, partnerPubName, undefined, true);
                                if (pdfBase64) {
                                    const confirmUrl = await communicationService.buildConfirmationUrl(partId);
                                    const msg = generateWhatsAppMessage({ ...part, resolvedPublisherName: newPub.name }, newPub.gender, partnerPubName, partnerPub?.phone, isAjudante, 'Irmão', '', confirmUrl, true);
                                    await zapiOrchestrator.sendS89Direct(partId, newPub.phone, msg, pdfBase64);
                                }
                            }
                            if (options.notifyPartner && partnerPub?.phone && newPub) {
                                await zapiOrchestrator.dispatchPartnerReplacementAlert(partnerPub.phone, partnerPub.name, part.tituloParte || part.tipoParte, part.date || part.weekId, newPub.name, newPub.phone, isAjudante);
                            }
                        }

                        if (onDataChange) onDataChange();
                        handleClose();
                    } catch (e) {
                        alert('Erro ao processar substituição: ' + (e instanceof Error ? e.message : String(e)));
                    }
                };

                // Requer import de ManualReplacementModal: import { ManualReplacementModal } from './admin/ManualReplacementModal';
                return (
                    <ManualReplacementModal
                        isOpen={true}
                        part={part}
                        oldPublisherName={oldName}
                        newPublisherName={newName}
                        onConfirm={handleConfirmReplacement}
                        onCancel={handleClose}
                    />
                );
            }

            default:
                return null;
        }
    };

    return (
        <>
        {pendingImpediments && (
            <PublisherImpedimentModal
                publisherName={pendingImpediments.publisher.name}
                impediments={pendingImpediments.impediments}
                onConfirmAndCancel={async () => {
                    for (const { part } of pendingImpediments.impediments) {
                        try {
                            await workbookManagementService.updatePart(part.id, { resolvedPublisherName: '', status: 'PENDENTE' });
                        } catch { /* melhor esforço */ }
                    }
                    await pendingImpediments.proceedSave();
                }}
                onSaveOnly={() => { pendingImpediments.proceedSave(); }}
                onCancel={() => { setPendingImpediments(null); }}
            />
        )}
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
        </>
    );
}
