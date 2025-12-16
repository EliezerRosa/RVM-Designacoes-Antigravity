import { useState, useEffect } from 'react'
import './App.css'
import type { Publisher, Participation } from './types'
import PublisherList from './components/PublisherList'
import PublisherForm from './components/PublisherForm'
import Dashboard from './components/Dashboard'
import AssignmentGenerator from './components/AssignmentGenerator'
import { initialPublishers } from './data/initialPublishers'
import { api } from './services/api'

import HistoryImporter from './components/HistoryImporter'
import PublisherDuplicateChecker from './components/PublisherDuplicateChecker'

type ActiveTab = 'dashboard' | 'publishers' | 'meetings' | 'assignments' | 's89' | 'history'

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard')

  // Data State
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [participations, setParticipations] = useState<Participation[]>([])

  // UI State
  const [showPublisherForm, setShowPublisherForm] = useState(false)
  const [showDuplicateChecker, setShowDuplicateChecker] = useState(false)
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

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
        const [pubs, parts, savedTab, isSeeded] = await Promise.all([
          api.loadPublishers().catch(err => {
            console.warn("Failed to load publishers", err)
            return [] as Publisher[];
          }),
          api.loadParticipations().catch(err => {
            console.warn("Failed to load participations", err)
            return []
          }),
          api.getSetting<ActiveTab>('activeTab', 'dashboard').catch(() => 'dashboard' as ActiveTab),
          api.getSetting<boolean>('isSeeded', false).catch(() => false)
        ])

        // 2. First-time seeding: ONLY if DB is empty AND not yet seeded
        if (!isSeeded && pubs.length === 0) {
          console.log("First run detected: seeding database with initial publishers...")
          const seedPubs = (initialPublishers as Publisher[]).map(p => ({
            ...p,
            source: 'initial' as const,
            createdAt: new Date().toISOString()
          }));
          await api.savePublishers(seedPubs);
          await api.setSetting('isSeeded', true);
          setPublishers(seedPubs);
          setStatusMessage("✅ Base de dados inicializada com " + seedPubs.length + " publicadores");
        } else {
          // DB is source of truth - use Supabase data as-is
          console.log(`Loaded ${pubs.length} publishers and ${parts.length} participations from DB`)
          setPublishers(pubs);
        }

        setParticipations(parts)
        setActiveTab(savedTab)
      } catch (error) {
        console.error("Critical error loading data", error)
        setStatusMessage("Erro crítico ao carregar dados.")
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  // Helper to persist publishers
  const persistPublishers = async (newPublishers: Publisher[]) => {
    setPublishers(newPublishers) // Optimistic update
    setIsSaving(true)
    setStatusMessage("Salvando alterações...")
    try {
      await api.savePublishers(newPublishers)
      setStatusMessage("✅ Alterações enviadas para processamento")
      setTimeout(() => setStatusMessage(null), 3000)
    } catch (e) {
      console.error(e)
      setStatusMessage("❌ Erro ao salvar dados!")
    } finally {
      setIsSaving(false)
    }
  }

  // Helper to persist participations
  const persistParticipations = async (newParticipations: Participation[]) => {
    setParticipations(newParticipations)
    setIsSaving(true)
    setStatusMessage("Salvando participações...")
    try {
      await api.saveParticipations(newParticipations)
      setStatusMessage("✅ Participações salvas")
      setTimeout(() => setStatusMessage(null), 3000)
    } catch (e) {
      console.error(e)
      setStatusMessage("❌ Erro ao salvar participações")
    } finally {
      setIsSaving(false)
    }
  }

  const handleHistoryImport = async (newPublishers: Publisher[], updatedExistingPublishers: Publisher[], newParticipations: Participation[]) => {
    // 1. Merge Publishers
    let finalPublishers = [...publishers]

    // Apply updates
    updatedExistingPublishers.forEach(updated => {
      finalPublishers = finalPublishers.map(p => p.id === updated.id ? updated : p)
    })

    // Add new
    newPublishers.forEach(np => {
      if (!finalPublishers.find(p => p.id === np.id)) {
        finalPublishers.push(np);
      }
    })

    // 2. Merge Participations (with deduplication)
    // Create a Set of existing participation signatures to detect duplicates
    const existingSignatures = new Set(
      participations.map(p => `${p.publisherName}|${p.week}|${p.partTitle}`)
    );

    // Only add new participations that don't already exist
    const uniqueNewParticipations = newParticipations.filter(np => {
      const signature = `${np.publisherName}|${np.week}|${np.partTitle}`;
      if (existingSignatures.has(signature)) {
        console.log(`Skipping duplicate participation: ${signature}`);
        return false;
      }
      existingSignatures.add(signature); // Prevent duplicates within newParticipations too
      return true;
    });

    console.log(`Imported ${uniqueNewParticipations.length} new participations (${newParticipations.length - uniqueNewParticipations.length} duplicates skipped)`);
    const finalParticipations = [...participations, ...uniqueNewParticipations]

    // Update State & Save
    setPublishers(finalPublishers)
    setParticipations(finalParticipations)
    handleTabChange('dashboard')

    setIsSaving(true)
    setStatusMessage("Sincronizando importação...")

    try {
      // We do sequential or parallel save? Parallel is fine they are different blocks.
      await Promise.all([
        api.savePublishers(finalPublishers),
        api.saveParticipations(finalParticipations)
      ])
      setStatusMessage("✅ Importação concluída e enviada!")
      setTimeout(() => setStatusMessage(null), 5000)
    } catch (e) {
      setStatusMessage("❌ Erro na sincronização da importação")
    } finally {
      setIsSaving(false)
    }
  };

  const savePublisher = (publisher: Publisher) => {
    let updated: Publisher[]
    if (editingPublisher) {
      updated = publishers.map(p => p.id === publisher.id ? publisher : p)
    } else {
      publisher.id = crypto.randomUUID()
      updated = [...publishers, publisher]
    }

    persistPublishers(updated)
    setShowPublisherForm(false)
    setEditingPublisher(null)
  }

  const deletePublisher = (publisher: Publisher) => {
    if (confirm(`Remover ${publisher.name}?`)) {
      const updated = publishers.filter(p => p.id !== publisher.id)
      persistPublishers(updated)
    }
  }

  const editPublisher = (publisher: Publisher) => {
    setEditingPublisher(publisher)
    setShowPublisherForm(true)
  }

  const saveParticipation = (participation: Participation) => {
    // Generate ID if empty
    if (!participation.id) {
      participation.id = crypto.randomUUID()
    }
    // Update or Add
    const filtered = participations.filter(p => p.id !== participation.id)
    const newParts = [...filtered, participation]
    persistParticipations(newParts)
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
            className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleTabChange('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={`nav-btn ${activeTab === 'publishers' ? 'active' : ''}`}
            onClick={() => handleTabChange('publishers')}
          >
            👥 Publicadores
          </button>
          <button
            className={`nav-btn ${activeTab === 'assignments' ? 'active' : ''}`}
            onClick={() => handleTabChange('assignments')}
          >
            📝 Designações
          </button>
          <button
            className={`nav-btn ${activeTab === 's89' ? 'active' : ''}`}
            onClick={() => handleTabChange('s89')}
          >
            📄 S-89
          </button>
          <button
            className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => handleTabChange('history')}
            title="Importar Histórico"
          >
            ⚙️ Histórico
          </button>
        </nav>
      </header>

      <main className="main-content">
        {/* Dashboard */}
        <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
          <Dashboard publishers={publishers} participations={participations} />
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

        {/* Assignments */}
        <div style={{ display: activeTab === 'assignments' ? 'block' : 'none' }}>
          <AssignmentGenerator
            publishers={publishers}
            participations={participations}
            onSaveParticipation={saveParticipation}
          />
        </div>

        {/* S-89 */}
        <div style={{ display: activeTab === 's89' ? 'block' : 'none' }}>
          <div style={{ padding: 20 }}>Gerador S-89 (Em construção)</div>
        </div>

        {/* History */}
        <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
          <HistoryImporter
            publishers={publishers}
            participations={participations}
            onImport={handleHistoryImport}
            onCancel={() => handleTabChange('dashboard')}
          />
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
    </div>
  )
}

export default App
