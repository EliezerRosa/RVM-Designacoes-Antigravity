import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import './App.css'
import type { HistoryRecord, Publisher, WorkbookPart } from './types'
import PublisherList from './components/PublisherList'
import PublisherForm from './components/PublisherForm'

import { api } from './services/api'
import PublisherDuplicateChecker from './components/PublisherDuplicateChecker'
import { ChatAgent } from './components/ChatAgent'
import { DesignationConfirmationPortal } from './components/DesignationConfirmationPortal'
import { LoginPage } from './components/LoginPage'
import { useAuth } from './context/AuthContext'
import { useAuthenticatedAppData, type AppActiveTab } from './hooks/useAuthenticatedAppData'
import { usePermissions } from './hooks/usePermissions'

// Lazy-loaded tabs (code splitting)
const WorkbookManager = lazy(() => import('./components/WorkbookManager'))
const ApprovalPanel = lazy(() => import('./components/ApprovalPanel'))
const BackupRestore = lazy(() => import('./components/BackupRestore'))
const PowerfulAgentTab = lazy(() => import('./components/PowerfulAgentTab'))
const TerritoryManager = lazy(() => import('./components/TerritoryManager'))
const CommunicationTab = lazy(() => import('./components/CommunicationTab').then(m => ({ default: m.CommunicationTab })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })))

import { publisherMutationService } from './services/publisherMutationService'
import { PublisherStatusForm } from './components/PublisherStatusForm'
import { PublisherAvailabilityPortal } from './components/PublisherAvailabilityPortal'
import { findPublisherImpediments, type ImpedimentEntry } from './services/publisherImpedimentService'
import { PublisherImpedimentModal } from './components/PublisherImpedimentModal'
import { workbookManagementService } from './services/workbookManagementService'

type ActiveTab = AppActiveTab

function getPortalParams(): { portal: string | null; partId: string | null; publisherId: string | null; token: string | null } {
  const searchParams = new URLSearchParams(window.location.search)
  const hashValue = window.location.hash || ''
  const hashQueryIndex = hashValue.indexOf('?')
  const hashParams = hashQueryIndex >= 0
    ? new URLSearchParams(hashValue.slice(hashQueryIndex + 1))
    : new URLSearchParams()

  const getFirst = (...keys: string[]) => {
    for (const key of keys) {
      const fromSearch = searchParams.get(key)
      if (fromSearch) return fromSearch

      const fromHash = hashParams.get(key)
      if (fromHash) return fromHash
    }

    return null
  }

  return {
    portal: getFirst('portal'),
    partId: getFirst('id', 'partId'),
    publisherId: getFirst('publisherId', 'publisher_id'),
    token: getFirst('token')
  }
}

function App() {
  const { isAuthenticated, isLoading: authLoading, needs2FA, signOut, profile } = useAuth();

  // PORTAL ROUTING: links públicos de confirmação de designação
  // DEVE ser verificado ANTES do auth guard — publicadores não autenticados precisam acessar
  const { portal, partId: portalPartId, publisherId: portalPublisherId, token: portalToken } = getPortalParams();

  if (portal === 'confirm') {
    if (portalPartId && portalPublisherId && portalToken) {
      return (
        <div className="app portal-mode">
          <DesignationConfirmationPortal partId={portalPartId} publisherId={portalPublisherId} token={portalToken} />
        </div>
      );
    }

    return (
      <div className="app portal-mode" style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '560px', background: '#111827', border: '1px solid #334155', borderRadius: '16px', padding: '28px', color: '#e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.45)' }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '1.35rem' }}>Link de confirmação inválido</h2>
          <p style={{ margin: '0 0 12px 0', color: '#cbd5e1', lineHeight: 1.6 }}>
            Este link está incompleto ou é de um formato antigo que não é mais aceito.
          </p>
          <p style={{ margin: 0, color: '#94a3b8', lineHeight: 1.6 }}>
            Solicite um novo link de confirmação gerado pela mensagem S-89 atualizada.
          </p>
        </div>
      </div>
    );
  }

  // PORTAL: formulário de atualização de publicadores (acesso por token, sem login)
  if (portal === 'publisher-form') {
    return (
      <div className="app portal-mode">
        <PublisherStatusForm token={portalToken ?? undefined} />
      </div>
    );
  }

  // PORTAL: disponibilidade individual do publicador (acesso por token, sem login)
  if (portal === 'availability') {
    return (
      <div className="app portal-mode">
        <PublisherAvailabilityPortal token={portalToken ?? undefined} />
      </div>
    );
  }

  // Auth guard: show login if not authenticated
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || needs2FA) {
    return <LoginPage />;
  }

  return <AuthenticatedApp onSignOut={signOut} userEmail={profile?.email || ''} />;
}

function AuthenticatedApp({ onSignOut, userEmail }: { onSignOut: () => void; userEmail: string }) {
  const { profile } = useAuth()
  const { permissions, isLoading: permissionsLoading } = usePermissions(profile)
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    // Non-admins default to 'agent' tab if they can't see 'workbook'
    return 'workbook' // will be corrected after permissions load
  })

  // UI State
  const [showPublisherForm, setShowPublisherForm] = useState(false)
  const [showDuplicateChecker, setShowDuplicateChecker] = useState(false)
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null)
  const [pendingImpediments, setPendingImpediments] = useState<{
    publisher: Publisher;
    impediments: ImpedimentEntry[];
    proceedSave: () => Promise<void>;
  } | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isChatAgentOpen, setIsChatAgentOpen] = useState(false)

  const {
    publishers,
    setPublishers,
    workbookParts,
    historyRecords,
    isLoading,
    isWorkbookLoading,
    refreshWorkbookParts,
    refreshAllData,
  } = useAuthenticatedAppData({
    onInitialTabResolved: setActiveTab,
    onCriticalError: setStatusMessage,
  })

  // Redirect to 'agent' tab if current tab is not allowed after permissions load
  useEffect(() => {
    if (!permissionsLoading && !permissions.canViewTab(activeTab)) {
      setActiveTab('agent')
    }
  }, [permissionsLoading])

  // Handle Admin Action Links (e.g., from WhatsApp notifications)
  const [initialAgentCommand, setInitialAgentCommand] = useState<string | null>(null);
  const [initialAgentWeekId, setInitialAgentWeekId] = useState<string | null>(null);

  // Persist active tab to Supabase
  const handleTabChange = async (tab: ActiveTab) => {
    setActiveTab(tab)
    try {
      await api.setSetting('activeTab', tab)
    } catch (e) {
      console.warn('Failed to save active tab preference', e)
    }
  }

  // Monitorar necessidade de WorkbookParts (S-140 / Agente)
  // Carrega apenas quando necessário para economizar recursos iniciais
  useEffect(() => {
    const needsParts = isChatAgentOpen || activeTab === 'agent' || activeTab === 'workbook';
    if (needsParts && workbookParts.length === 0 && !isWorkbookLoading) {
      refreshWorkbookParts();
    }
  }, [isChatAgentOpen, activeTab, workbookParts.length, isWorkbookLoading]);

  // Load workbook parts when ChatAgent opens OR Agent tab is active
  // (handled by the needsParts useEffect above — only when parts are empty)

  const savePublisher = async (publisher: Publisher) => {
    setIsSaving(true)
    setStatusMessage("Salvando publicador...")

    // Verificar se alterações causam impedimento em designações futuras
    if (editingPublisher) {
      try {
        const todayWeekId = new Date().toISOString().slice(0, 10);
        const impediments = findPublisherImpediments(
          editingPublisher,
          publisher,
          workbookParts,
          publishers,
          todayWeekId
        );
        if (impediments.length > 0) {
          setIsSaving(false)
          setStatusMessage(null)
          setPendingImpediments({
            publisher,
            impediments,
            proceedSave: async () => {
              setPendingImpediments(null)
              await doSavePublisher(publisher)
            },
          })
          return
        }
      } catch (err) {
        // Não bloquear o save por falha na verificação de impedimentos (dados legados etc.)
        console.warn('[savePublisher] findPublisherImpediments falhou, prosseguindo com save:', err)
      }
    }

    await doSavePublisher(publisher)
  }

  const doSavePublisher = async (publisher: Publisher) => {
    setIsSaving(true)
    setStatusMessage("Salvando publicador...")
    try {
      if (editingPublisher) {
        const result = await publisherMutationService.savePublisherWithPropagation(publisher, editingPublisher)
        setPublishers(prev => prev.map(p => p.id === publisher.id ? result.publisher : p))
        setStatusMessage(result.renamed
          ? `✅ Publicador atualizado (${result.propagatedParts} designações sincronizadas)`
          : "✅ Publicador atualizado")
      } else {
        // Create new
        publisher.id = crypto.randomUUID()
        const result = await publisherMutationService.savePublisherWithPropagation(publisher)
        setPublishers(prev => [...prev, result.publisher])
        setStatusMessage("✅ Publicador criado")
      }
      setShowPublisherForm(false)
      setEditingPublisher(null)
    } catch (error) {
      console.error("Error saving publisher:", error)
      setStatusMessage("❌ Erro ao salvar publicador")
    } finally {
      setIsSaving(false)
      setTimeout(() => setStatusMessage(null), 3000)
    }
  }

  const deletePublisher = async (publisher: Publisher) => {
    if (!confirm(`Remover ${publisher.name}?`)) return

    setIsSaving(true)
    setStatusMessage("Removendo publicador...")
    try {
      await api.deletePublisher(publisher.id)
      setPublishers(prev => prev.filter(p => p.id !== publisher.id))
      setStatusMessage("✅ Publicador removido")
    } catch (error) {
      console.error("Error deleting publisher:", error)
      setStatusMessage("❌ Erro ao remover publicador")
    } finally {
      setIsSaving(false)
      setTimeout(() => setStatusMessage(null), 3000)
    }
  }

  const editPublisher = (publisher: Publisher) => {
    setEditingPublisher(publisher)
    setShowPublisherForm(true)
  }

  // Handle Admin Action Links effect — TWO STAGES:
  // Stage 1: On mount — capture URL params, switch tab, set command (no data dependency)
  // Stage 2: Once data loads — resolve weekId from partId for correct week focus
  const pendingReplacePartIdRef = useRef<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const admin = urlParams.get('admin');
    const action = urlParams.get('action');
    const partId = urlParams.get('id') || urlParams.get('partId');

    if (admin === 'true' && action === 'replace' && partId) {
      console.log(`[App] Admin action detected: replace part ${partId}`);

      // Force switch to agent tab IMMEDIATELY (before data loads)
      setActiveTab('agent');

      // Set command with [ID: UUID] format — agent resolves on its own
      setInitialAgentCommand(`Sugerir substitutos recomendados para a parte [ID: ${partId}]`);

      // Store partId for Stage 2 (weekId resolution after data loads)
      pendingReplacePartIdRef.current = partId;

      // Force data load to ensure workbookParts are available for the agent
      refreshWorkbookParts();

      // Clean URL to prevent re-trigger on refresh
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // Stage 1: Runs once on mount

  // Stage 2: Resolve weekId once workbookParts loads
  useEffect(() => {
    const pendingPartId = pendingReplacePartIdRef.current;
    if (!pendingPartId || workbookParts.length === 0) return;

    const part = workbookParts.find(p => p.id === pendingPartId);
    if (part) {
      console.log(`[App] Stage 2: Resolved weekId=${part.weekId} for partId=${pendingPartId}`);
      setInitialAgentWeekId(part.weekId);
    } else {
      console.warn(`[App] Stage 2: Part ${pendingPartId} not found in loaded data`);
    }

    // Clear pending to avoid re-resolution
    pendingReplacePartIdRef.current = null;
  }, [workbookParts]); // Stage 2: Runs when data becomes available

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Carregando dados do servidor...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <h1>RVM Designações</h1>
          <span className="subtitle">Sistema Unificado</span>
        </div>

        {/* Status Indicator */}
        {statusMessage && (
          <div style={{ marginLeft: '20px', fontSize: '0.9em', color: isSaving ? '#fff' : '#4caf50', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isSaving && <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></div>}
            {statusMessage}
          </div>
        )}

        <nav className="main-nav">
          {permissions.canViewTab('workbook') && <button
            className={`nav-btn ${activeTab === 'workbook' ? 'active' : ''}`}
            onClick={() => handleTabChange('workbook')}
            title="Gerenciador de Apostila"
          >
            📖 Apostila
          </button>}
          {permissions.canViewTab('approvals') && <button
            className={`nav-btn ${activeTab === 'approvals' ? 'active' : ''}`}
            onClick={() => handleTabChange('approvals')}
            title="Painel de Aprovação"
          >
            ✅ Aprovações
          </button>}
          {permissions.canViewTab('publishers') && <button
            className={`nav-btn ${activeTab === 'publishers' ? 'active' : ''}`}
            onClick={() => handleTabChange('publishers')}
          >
            👥 Publicadores
          </button>}
          {permissions.canViewTab('territories') && <button
            className={`nav-btn ${activeTab === 'territories' ? 'active' : ''}`}
            onClick={() => handleTabChange('territories')}
            title="Gerenciar de Territórios"
          >
            🌍 Territórios
          </button>}
          {permissions.canViewTab('backup') && <button
            className={`nav-btn ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => handleTabChange('backup')}
            title="Backup e Restauração"
          >
            💾 Backup
          </button>}

          {permissions.canViewTab('communication') && <button
            className={`nav-btn ${activeTab === 'communication' ? 'active' : ''}`}
            onClick={() => handleTabChange('communication')}
            title="Hub de Comunicação"
            style={{ position: 'relative' }}
          >
            💬 Comunicação
          </button>}

          {permissions.canViewTab('admin') && <button
            className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => handleTabChange('admin')}
            title="Admin Dashboard (Resilience)"
            style={{ 
              background: activeTab === 'admin' ? '#10B981' : 'transparent', 
              border: activeTab === 'admin' ? 'none' : '1px solid #10B981', 
              color: activeTab === 'admin' ? 'white' : '#10B981',
            }}
          >
            📊 Admin
          </button>}
          <button
            className={`nav-btn ${activeTab === 'agent' ? 'active' : ''}`}
            onClick={() => handleTabChange('agent')}
            title="Agente Poderoso"
            style={{ background: activeTab === 'agent' ? '#4F46E5' : 'transparent', border: activeTab === 'agent' ? 'none' : '1px solid #4F46E5' }}
          >
            🤖 Agente
          </button>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto', flexShrink: 0 }}>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }} title={userEmail}>
            👤 {userEmail.split('@')[0]}
          </span>
          <button
            onClick={onSignOut}
            style={{
              background: 'transparent',
              border: '1px solid #ef4444',
              color: '#ef4444',
              borderRadius: '0.5rem',
              padding: '0.35rem 0.75rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="Sair"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="main-content">
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
            Carregando...
          </div>
        </div>}>
          {/* Workbook */}
          {activeTab === 'workbook' && (
            <WorkbookManager
              publishers={publishers}
              isActive={true}
            />
          )}

          {/* Approvals */}
          {activeTab === 'approvals' && (
            <ApprovalPanel publishers={publishers} />
          )}

          {/* Publishers */}
          {activeTab === 'publishers' && (
            <>
              <div className="publishers-page">
                <div className="page-header">
                  <h2>Publicadores</h2>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => setShowDuplicateChecker(true)}
                      style={{ background: '#f59e0b', color: '#000' }}
                    >
                      🔍 Verificar Duplicatas
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => setShowPublisherForm(true)}
                    >
                      + Novo Publicador
                    </button>
                  </div>
                </div>
                <PublisherList
                  publishers={publishers}
                  onEdit={editPublisher}
                  onDelete={deletePublisher}
                />
              </div>
              {showDuplicateChecker && (
                <PublisherDuplicateChecker
                  publishers={publishers}
                  onDelete={(id) => {
                    const pub = publishers.find(p => p.id === id);
                    if (pub) deletePublisher(pub);
                  }}
                  onClose={() => setShowDuplicateChecker(false)}
                />
              )}
            </>
          )}

          {/* Territories */}
          {activeTab === 'territories' && (
            <TerritoryManager />
          )}

          {/* Communication */}
          {activeTab === 'communication' && (
            <CommunicationTab />
          )}

          {/* Agent Tab */}
          {activeTab === 'agent' && (
            <AgentTabContent
              publishers={publishers}
              workbookParts={workbookParts}
              historyRecords={historyRecords}
              refreshWorkbookParts={refreshAllData}
              isWorkbookLoading={isWorkbookLoading}
              initialCommand={initialAgentCommand || undefined}
              initialWeekId={initialAgentWeekId || undefined}
              accessLevel={permissions.getAccessLevel()}
              showControlPanel={permissions.canSeeAgentControlPanel()}
              canSendZap={permissions.canSendZap()}
            />
          )}

          {/* Backup */}
          {activeTab === 'backup' && (
            <BackupRestore />
          )}

          {/* Admin Dashboard */}
          {activeTab === 'admin' && (
            <div className="admin-container">
              <AdminDashboard />
            </div>
          )}
        </Suspense>
      </main>

      {showPublisherForm && (
        <PublisherForm
          publisher={editingPublisher}
          publishers={publishers}
          onSave={savePublisher}
          onCancel={() => {
            setShowPublisherForm(false)
            setEditingPublisher(null)
          }}
        />
      )}

      {/* Impediment confirmation modal */}
      {pendingImpediments && (
        <PublisherImpedimentModal
          publisherName={pendingImpediments.publisher.name}
          impediments={pendingImpediments.impediments}
          onConfirmAndCancel={async () => {
            // Cancelar designações afetadas
            for (const { part } of pendingImpediments.impediments) {
              try {
                await workbookManagementService.updatePart(part.id, { resolvedPublisherName: '', status: 'PENDENTE' });
              } catch { /* melhor esforço */ }
            }
            await pendingImpediments.proceedSave();
          }}
          onSaveOnly={() => { pendingImpediments.proceedSave(); }}
          onCancel={() => { setPendingImpediments(null); setIsSaving(false); }}
        />
      )}

      {/* Chat Agent Modal */}
      <ChatAgent
        isOpen={isChatAgentOpen}
        onClose={() => setIsChatAgentOpen(false)}
        publishers={publishers}
        parts={workbookParts}
        history={historyRecords} // Passando histórico completo
      />

      {/* Floating Chat Button (Hidden in Agent Tab) */}
      {activeTab !== 'agent' && (
        <button
          onClick={() => setIsChatAgentOpen(true)}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
            color: 'white',
            border: 'none',
            boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4)',
            cursor: 'pointer',
            fontSize: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s, box-shadow 0.2s',
            zIndex: 9000,
          }}
          onMouseOver={e => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 12px 32px rgba(139, 92, 246, 0.5)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(139, 92, 246, 0.4)';
          }}
          title="Assistente RVM"
        >
          🤖
        </button>
      )}
    </div>
  )
}

function AgentTabContent({ publishers, workbookParts, isWorkbookLoading, historyRecords, refreshWorkbookParts, initialCommand, initialWeekId, accessLevel = 'publisher', showControlPanel = false, canSendZap = false }: {
  publishers: Publisher[];
  workbookParts: WorkbookPart[];
  isWorkbookLoading: boolean;
  historyRecords: HistoryRecord[];
  refreshWorkbookParts: () => void;
  initialCommand?: string;
  initialWeekId?: string;
  accessLevel?: 'elder' | 'publisher';
  showControlPanel?: boolean;
  canSendZap?: boolean;
}) {
  const weekParts = useMemo(() => {
    return workbookParts.reduce((acc, part) => {
      if (!acc[part.weekId]) acc[part.weekId] = [];
      acc[part.weekId].push(part);
      return acc;
    }, {} as Record<string, WorkbookPart[]>);
  }, [workbookParts]);

  const weekOrder = useMemo(() => Object.keys(weekParts).sort(), [weekParts]);

  return <PowerfulAgentTab
    publishers={publishers}
    parts={workbookParts}
    isWorkbookLoading={isWorkbookLoading}
    weekParts={weekParts}
    weekOrder={weekOrder}
    historyRecords={historyRecords}
    onDataChange={refreshWorkbookParts}
    initialCommand={initialCommand}
    initialWeekId={initialWeekId}
    accessLevel={accessLevel}
    showControlPanel={showControlPanel}
    canSendZap={canSendZap}
  />;
}

export default App
