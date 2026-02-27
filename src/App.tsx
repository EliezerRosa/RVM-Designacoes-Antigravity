import { useState, useEffect, useMemo } from 'react'
import './App.css'
import type { Publisher, WorkbookPart } from './types'
import PublisherList from './components/PublisherList'
import PublisherForm from './components/PublisherForm'

import { api } from './services/api'
import PublisherDuplicateChecker from './components/PublisherDuplicateChecker'
import WorkbookManager from './components/WorkbookManager'
import ApprovalPanel from './components/ApprovalPanel'
import BackupRestore from './components/BackupRestore'
import { ChatAgent } from './components/ChatAgent'
import PowerfulAgentTab from './components/PowerfulAgentTab'
import TerritoryManager from './components/TerritoryManager'
import { CommunicationTab } from './components/CommunicationTab'
import { DesignationConfirmationPortal } from './components/DesignationConfirmationPortal'

import { workbookService } from './services/workbookService'
import { AdminDashboard } from './pages/AdminDashboard'
import { loadCompletedParticipations } from './services/historyAdapter'
import type { HistoryRecord } from './types'
import { supabase } from './lib/supabase'
import { updateRotationConfig } from './services/unifiedRotationService'

type ActiveTab = 'workbook' | 'approvals' | 'publishers' | 'territories' | 'backup' | 'agent' | 'admin' | 'communication'

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workbook')

  // Data State
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [workbookParts, setWorkbookParts] = useState<WorkbookPart[]>([])
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([])

  // UI State
  const [showPublisherForm, setShowPublisherForm] = useState(false)
  const [showDuplicateChecker, setShowDuplicateChecker] = useState(false)
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Chat Agent state
  const [isChatAgentOpen, setIsChatAgentOpen] = useState(false)

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

  // Carregar dados iniciais e UI state
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      try {
        console.log("Loading data from Supabase...")

        // Fetch data in parallel
        const [pubs, savedTab, history, engineConfig] = await Promise.all([
          api.loadPublishers().catch(err => {
            console.warn("Failed to load publishers", err)
            return [] as Publisher[];
          }),
          api.getSetting<ActiveTab>('activeTab', 'workbook').catch(() => 'workbook' as ActiveTab),
          loadCompletedParticipations().catch(() => [] as HistoryRecord[]),
          api.getSetting<any>('engine_config', null).catch(() => null)
        ])

        if (engineConfig) {
          console.log('[App] Applying custom engine config from DB:', engineConfig);
          updateRotationConfig(engineConfig);
        }

        setHistoryRecords(history);
        setPublishers(pubs);
        console.log(`[App] Loaded ${pubs.length} publishers from DB`)

        // Validate saved tab
        const validTabs: ActiveTab[] = ['workbook', 'approvals', 'publishers', 'territories', 'backup', 'agent', 'admin']
        setActiveTab(validTabs.includes(savedTab) ? savedTab : 'workbook')
      } catch (error) {
        console.error("Critical error loading data", error)
        setStatusMessage("Erro crítico ao carregar dados.")
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  // Realtime subscriptions + Polling fallback for multi-user sync
  useEffect(() => {
    console.log('[REALTIME] Setting up subscriptions...')
    let pollingInterval: ReturnType<typeof setInterval> | null = null;

    // Subscribe to publishers changes
    const unsubPublishers = api.subscribeToPublishers((newPubs) => {
      console.log(`[REALTIME] Publishers updated: ${newPubs.length}`)
      setPublishers(newPubs)
    })

    // Polling fallback: Check every 30 seconds if realtime misses updates
    // Uses a simple hash to detect ANY changes (count, name, gender, etc.)
    const computeHash = (pubs: Publisher[]) =>
      pubs.map(p => `${p.id}:${p.name}:${p.gender}:${p.condition}:${p.isServing}`).join('|');

    let lastHash = computeHash(publishers);

    const startPolling = () => {
      pollingInterval = setInterval(async () => {
        try {
          const freshPubs = await api.loadPublishers();
          const newHash = computeHash(freshPubs);

          if (newHash !== lastHash) {
            console.log(`[POLLING] Change detected, refreshing publishers...`);
            lastHash = newHash;
            setPublishers(freshPubs);
          }
        } catch (e) {
          console.warn('[POLLING] Error checking publishers:', e);
        }
      }, 30000); // 30 seconds
    };

    startPolling();

    // Cleanup on unmount
    return () => {
      console.log('[REALTIME] Cleaning up subscriptions...')
      unsubPublishers()
      if (pollingInterval) clearInterval(pollingInterval);
    }
  }, [])

  // Realtime + Polling for workbook_parts (keeps parts in sync across tabs)
  useEffect(() => {
    console.log('[REALTIME] Setting up workbook_parts sync...');
    let partsPollingInterval: ReturnType<typeof setInterval> | null = null;
    let partsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isPartsProcessing = false;

    // Realtime subscription for workbook_parts
    const partsChannel = supabase
      .channel('parts-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workbook_parts' },
        async () => {
          if (isPartsProcessing) return;
          if (partsDebounceTimer) clearTimeout(partsDebounceTimer);
          partsDebounceTimer = setTimeout(async () => {
            try {
              isPartsProcessing = true;
              console.log('[REALTIME] workbook_parts changed, reloading...');
              const freshParts = await workbookService.getAll();
              setWorkbookParts(freshParts);
            } catch (err) {
              console.warn('[REALTIME] Failed to reload parts:', err);
            } finally {
              isPartsProcessing = false;
            }
          }, 3000); // 3s debounce (batch multiple part changes)
        }
      )
      .subscribe();

    // Polling fallback for parts (15 seconds)
    let lastPartsHash = "";
    const computePartsHash = (ps: WorkbookPart[]) =>
      ps.length + ":" + ps.slice(0, 50).map(p => `${p.id}:${p.resolvedPublisherName || ""}:${p.status}`).join("|");

    partsPollingInterval = setInterval(async () => {
      try {
        const freshParts = await workbookService.getAll();
        const newHash = computePartsHash(freshParts);
        if (newHash !== lastPartsHash) {
          console.log('[POLLING] Parts change detected, refreshing...');
          lastPartsHash = newHash;
          setWorkbookParts(freshParts);
        }
      } catch (e) {
        console.warn('[POLLING] Error checking parts:', e);
      }
    }, 60000); // 60 seconds (parts change infrequently)

    return () => {
      console.log('[REALTIME] Cleaning up parts sync...');
      if (partsDebounceTimer) clearTimeout(partsDebounceTimer);
      if (partsPollingInterval) clearInterval(partsPollingInterval);
      supabase.removeChannel(partsChannel);
    };
  }, []);

  // Monitorar necessidade de WorkbookParts (S-140 / Agente)
  // Carrega apenas quando necessário para economizar recursos iniciais
  useEffect(() => {
    const needsParts = isChatAgentOpen || activeTab === 'agent' || activeTab === 'workbook';
    if (needsParts && workbookParts.length === 0 && !isWorkbookLoading) {
      refreshWorkbookParts();
    }
  }, [isChatAgentOpen, activeTab, workbookParts.length, isWorkbookLoading]);

  const refreshWorkbookParts = async () => {
    if (isWorkbookLoading) return;

    setIsWorkbookLoading(true);
    try {
      console.log('[App] Refreshing workbook parts explicitly...');
      const data = await workbookService.getAll();
      setWorkbookParts(data);
      setLastPartsRefresh(Date.now());
      console.log(`[App] Refreshed ${data.length} parts`);
    } catch (err) {
      console.error('[App] Error refreshing workbook parts:', err);
    } finally {
      setIsWorkbookLoading(false);
    }
  };

  const refreshAllData = async () => {
    console.log('[App] Refreshing all data explicitly...');
    try {
      const [parts, pubs] = await Promise.all([
        workbookService.getAll(),
        api.loadPublishers()
      ]);
      setWorkbookParts(parts);
      setPublishers(pubs);
      console.log(`[App] Refreshed ${parts.length} parts and ${pubs.length} publishers`);
    } catch (err) {
      console.warn('[App] Error refreshing all data:', err);
    }
  };

  // Load workbook parts when ChatAgent opens OR Agent tab is active
  useEffect(() => {
    const needsParts = isChatAgentOpen || activeTab === 'agent';
    if (needsParts) {
      console.log('[Agent] Loading workbook parts for AI...');
      refreshWorkbookParts();
    }
  }, [isChatAgentOpen, activeTab]);

  const savePublisher = async (publisher: Publisher) => {
    setIsSaving(true)
    setStatusMessage("Salvando publicador...")
    try {
      if (editingPublisher) {
        // Cap name changes for Phase 3.6
        const oldName = editingPublisher.name;
        const newName = publisher.name;

        // Update existing
        await api.updatePublisher(publisher)
        setPublishers(prev => prev.map(p => p.id === publisher.id ? publisher : p))

        // Phase 3.6: Propagate name changes to workbook parts
        if (oldName !== newName) {
          console.log(`[App] Propagating name change: ${oldName} -> ${newName}`);
          setStatusMessage("Atualizando designações...");
          const updatedCount = await workbookService.propagateNameChange(oldName, newName);
          if (updatedCount > 0) {
            console.log(`[App] Updated ${updatedCount} workbook parts`);
          }
        }

        setStatusMessage("✅ Publicador atualizado")
      } else {
        // Create new
        publisher.id = crypto.randomUUID()
        await api.createPublisher(publisher)
        setPublishers(prev => [...prev, publisher])
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

  // Handle Admin Action Links effect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const admin = urlParams.get('admin');
    const action = urlParams.get('action');
    const partId = urlParams.get('id') || urlParams.get('partId');

    if (admin === 'true' && action === 'replace' && partId) {
      console.log(`[App] Admin action detected: replace part ${partId}`);

      // Find the week for this part to set context
      const part = workbookParts.find(p => p.id === partId);
      if (part) {
        setInitialAgentWeekId(part.weekId);
      }

      setInitialAgentCommand(`Substituir publicador da parte ${partId}`);
      setActiveTab('agent');
    }
  }, [workbookParts.length > 0]); // Dependency array simplified to run once data is ready

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Carregando dados do servidor...</p>
      </div>
    )
  }

  // PORTAL ROUTING: Detect public confirmation link
  const urlParams = new URLSearchParams(window.location.search);
  const portal = urlParams.get('portal');
  const partId = urlParams.get('id') || urlParams.get('partId'); // Support both 'id' and 'partId'

  if (portal === 'confirm' && partId) {
    return (
      <div className="app portal-mode">
        <DesignationConfirmationPortal partId={partId} />
      </div>
    );
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
          <button
            className={`nav-btn ${activeTab === 'workbook' ? 'active' : ''}`}
            onClick={() => handleTabChange('workbook')}
            title="Gerenciador de Apostila"
          >
            📖 Apostila
          </button>
          <button
            className={`nav-btn ${activeTab === 'approvals' ? 'active' : ''}`}
            onClick={() => handleTabChange('approvals')}
            title="Painel de Aprovação"
          >
            ✅ Aprovações
          </button>
          <button
            className={`nav-btn ${activeTab === 'publishers' ? 'active' : ''}`}
            onClick={() => handleTabChange('publishers')}
          >
            👥 Publicadores
          </button>
          <button
            className={`nav-btn ${activeTab === 'territories' ? 'active' : ''}`}
            onClick={() => handleTabChange('territories')}
            title="Gerenciar de Territórios"
          >
            🌍 Territórios
          </button>
          <button
            className={`nav-btn ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => handleTabChange('backup')}
            title="Backup e Restauração"
          >
            💾 Backup
          </button>

          <button
            className={`nav-btn ${activeTab === 'communication' ? 'active' : ''}`}
            onClick={() => handleTabChange('communication')}
            title="Hub de Comunicação"
            style={{ position: 'relative' }}
          >
            💬 Comunicação
          </button>

          <button
            className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => handleTabChange('admin')}
            title="Admin Dashboard (Resilience)"
            style={{ background: activeTab === 'admin' ? '#10B981' : 'transparent', border: activeTab === 'admin' ? 'none' : '1px solid #10B981', color: activeTab === 'admin' ? 'white' : '#10B981' }}
          >
            📊 Admin
          </button>
          <button
            className={`nav-btn ${activeTab === 'agent' ? 'active' : ''}`}
            onClick={() => handleTabChange('agent')}
            title="Agente Poderoso"
            style={{ background: activeTab === 'agent' ? '#4F46E5' : 'transparent', border: activeTab === 'agent' ? 'none' : '1px solid #4F46E5' }}
          >
            🤖 Agente
          </button>
        </nav>
      </header>

      <main className="main-content">
        {/* Workbook */}
        <div style={{ display: activeTab === 'workbook' ? 'block' : 'none' }}>
          <WorkbookManager
            publishers={publishers}
            isActive={activeTab === 'workbook'}
          />
        </div>

        {/* Approvals */}
        <div style={{ display: activeTab === 'approvals' ? 'block' : 'none' }}>
          <ApprovalPanel publishers={publishers} />
        </div>

        {/* Publishers */}
        <div style={{ display: activeTab === 'publishers' ? 'block' : 'none' }}>
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
        </div>

        {/* Publishers */}
        <div style={{ display: activeTab === 'publishers' ? 'block' : 'none' }}>
          {/* ... kept hidden to save space in prompt ... */}
          {/* (Assuming user context handles surrounding lines match) */}
        </div>

        {/* Territories */}
        <div style={{ display: activeTab === 'territories' ? 'block' : 'none' }}>
          <TerritoryManager />
        </div>

        {/* Communication */}
        <div style={{ display: activeTab === 'communication' ? 'block' : 'none' }}>
          <CommunicationTab />
        </div>

        {/* Agent Tab */}
        <div style={{ display: activeTab === 'agent' ? 'block' : 'none' }}>
          {activeTab === 'agent' && <AgentTabContent
            publishers={publishers}
            workbookParts={workbookParts}
            historyRecords={historyRecords}
            refreshWorkbookParts={refreshAllData}
            initialCommand={initialAgentCommand || undefined}
            initialWeekId={initialAgentWeekId || undefined}
          />}
        </div>

        {/* Backup */}
        <div style={{ display: activeTab === 'backup' ? 'block' : 'none' }}>
          <BackupRestore />
        </div>

        {/* Admin Dashboard */}
        {/* Admin Dashboard */}
        {activeTab === 'admin' && (
          <div className="admin-container">
            <AdminDashboard />
          </div>
        )}
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

function AgentTabContent({ publishers, workbookParts, isWorkbookLoading, historyRecords, refreshWorkbookParts, initialCommand, initialWeekId }: {
  publishers: Publisher[];
  workbookParts: WorkbookPart[];
  isWorkbookLoading: boolean;
  historyRecords: HistoryRecord[];
  refreshWorkbookParts: () => void;
  initialCommand?: string;
  initialWeekId?: string;
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
  />;
}

export default App
