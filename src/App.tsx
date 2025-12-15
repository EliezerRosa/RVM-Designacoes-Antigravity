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

type ActiveTab = 'dashboard' | 'publishers' | 'meetings' | 'assignments' | 's89' | 'history'

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard')

  // Data State
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [participations, setParticipations] = useState<Participation[]>([])

  // UI State
  const [showPublisherForm, setShowPublisherForm] = useState(false)
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Carregar dados iniciais
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      try {
        console.log("Loading data from API...")
        // Parallel fetch with fallback
        const [pubs, parts] = await Promise.all([
          api.loadPublishers().catch(err => {
            console.warn("API load failed (publishers), falling back to local.", err)
            // Fallback to local file if API fails (e.g. file doesn't exist yet)
            return initialPublishers as Publisher[];
          }),
          api.loadParticipations().catch(err => {
            console.warn("API load failed (participations), falling back to empty.", err)
            return []
          })
        ])

        setPublishers(pubs)
        setParticipations(parts)
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

    // 2. Merge Participations
    const finalParticipations = [...participations, ...newParticipations]

    // Update State & Save
    setPublishers(finalPublishers)
    setParticipations(finalParticipations)
    setActiveTab('dashboard')

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
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={`nav-btn ${activeTab === 'publishers' ? 'active' : ''}`}
            onClick={() => setActiveTab('publishers')}
          >
            👥 Publicadores
          </button>
          <button
            className={`nav-btn ${activeTab === 'assignments' ? 'active' : ''}`}
            onClick={() => setActiveTab('assignments')}
          >
            📝 Designações
          </button>
          <button
            className={`nav-btn ${activeTab === 's89' ? 'active' : ''}`}
            onClick={() => setActiveTab('s89')}
          >
            📄 S-89
          </button>
          <button
            className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
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
              <button
                className="btn-primary"
                onClick={() => setShowPublisherForm(true)}
              >
                + Novo Publicador
              </button>
            </div>
            <PublisherList
              publishers={publishers}
              onEdit={editPublisher}
              onDelete={deletePublisher}
            />
          </div>
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
            onImport={handleHistoryImport}
            onCancel={() => setActiveTab('dashboard')}
          />
        </div>
      </main>

      {showPublisherForm && (
        <PublisherForm
          publisher={editingPublisher}
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
