import { useState, useEffect } from 'react'
import './App.css'
import type { Publisher } from './types'
import PublisherList from './components/PublisherList'
import PublisherForm from './components/PublisherForm'
import { initialPublishers } from './data/initialPublishers'
import { api } from './services/api'
import PublisherDuplicateChecker from './components/PublisherDuplicateChecker'
import WorkbookManager from './components/WorkbookManager'
import ApprovalPanel from './components/ApprovalPanel'
import BackupRestore from './components/BackupRestore'
import { ChatAgent } from './components/ChatAgent'

import { workbookService } from './services/workbookService'

type ActiveTab = 'workbook' | 'approvals' | 'publishers' | 'backup'

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workbook')

  // Data State
  const [publishers, setPublishers] = useState<Publisher[]>([])

  // UI State
  const [showPublisherForm, setShowPublisherForm] = useState(false)
  const [showDuplicateChecker, setShowDuplicateChecker] = useState(false)
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Chat Agent state
  const [isChatAgentOpen, setIsChatAgentOpen] = useState(false)

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

        // 1. Fetch data and seeding flag in parallel
        const [pubs, savedTab, isSeeded] = await Promise.all([
          api.loadPublishers().catch(err => {
            console.warn("Failed to load publishers", err)
            return [] as Publisher[];
          }),
          api.getSetting<ActiveTab>('activeTab', 'workbook').catch(() => 'workbook' as ActiveTab),
          api.getSetting<boolean>('isSeeded', false).catch(() => false)
        ])

        console.log(`[DEBUG] isSeeded flag from DB: ${isSeeded}`)
        console.log(`[DEBUG] Publishers count from DB: ${pubs.length}`)
        console.log(`[DEBUG] Should seed? ${!isSeeded && pubs.length === 0}`)

        // 2. First-time seeding: ONLY if DB is empty AND not yet seeded
        if (!isSeeded && pubs.length === 0) {
          console.log("[DEBUG] SEEDING: First run detected, seeding database...")
          const seedPubs = (initialPublishers as Publisher[]).map(p => ({
            ...p,
            source: 'initial' as const,
            createdAt: new Date().toISOString()
          }));
          await api.savePublishers(seedPubs);
          await api.setSetting('isSeeded', true);
          console.log("[DEBUG] SEEDING: isSeeded flag set to true")
          setPublishers(seedPubs);
          setStatusMessage("✅ Base de dados inicializada com " + seedPubs.length + " publicadores");
        } else {
          // DB is source of truth - use Supabase data as-is
          console.log(`[DEBUG] NOT SEEDING: Loading ${pubs.length} publishers from DB`)
          setPublishers(pubs);
        }

        // Validate saved tab
        const validTabs: ActiveTab[] = ['workbook', 'approvals', 'publishers', 'backup']
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
            className={`nav-btn ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => handleTabChange('backup')}
            title="Backup e Restauração"
          >
            💾 Backup
          </button>
        </nav>
      </header>

      <main className="main-content">
        {/* Workbook */}
        <div style={{ display: activeTab === 'workbook' ? 'block' : 'none' }}>
          <WorkbookManager publishers={publishers} />
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

        {/* Backup */}
        <div style={{ display: activeTab === 'backup' ? 'block' : 'none' }}>
          <BackupRestore />
        </div>
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
        parts={[]}
      />

      {/* Floating Chat Button */}
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
    </div>
  )
}

export default App
