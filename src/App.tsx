import { useState, useEffect } from 'react'
import './App.css'
import type { Publisher, Participation } from './types'
import PublisherList from './components/PublisherList'
import PublisherForm from './components/PublisherForm'
import Dashboard from './components/Dashboard'
import AssignmentGenerator from './components/AssignmentGenerator'
import { initialPublishers } from './data/initialPublishers'

import HistoryImporter from './components/HistoryImporter'

type ActiveTab = 'dashboard' | 'publishers' | 'meetings' | 'assignments' | 's89' | 'history'

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard')
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [participations, setParticipations] = useState<Participation[]>([])
  const [showPublisherForm, setShowPublisherForm] = useState(false)
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Carregar dados iniciais
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Tentar carregar do localStorage
      const savedPublishers = localStorage.getItem('rvm_publishers')
      const savedParticipations = localStorage.getItem('rvm_participations')

      if (savedPublishers) {
        setPublishers(JSON.parse(savedPublishers))
      } else {
        // Carregar dados iniciais do arquivo VARÕES
        setPublishers(initialPublishers as Publisher[])
        localStorage.setItem('rvm_publishers', JSON.stringify(initialPublishers))
      }

      if (savedParticipations) {
        setParticipations(JSON.parse(savedParticipations))
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    }
    setIsLoading(false)
  }

  const handleHistoryImport = (newPublishers: Publisher[], updatedExistingPublishers: Publisher[], newParticipations: Participation[]) => {
    // Merge publishers logic
    let currentPublishers = [...publishers];

    // Apply updates to existing
    updatedExistingPublishers.forEach(update => {
      const idx = currentPublishers.findIndex(p => p.id === update.id);
      if (idx !== -1) {
        currentPublishers[idx] = update;
      }
    });

    const finalPublishers = [...currentPublishers, ...newPublishers];
    setPublishers(finalPublishers);
    localStorage.setItem('rvm_publishers', JSON.stringify(finalPublishers));

    // Merge participations
    const updatedParticipations = [...participations, ...newParticipations];
    setParticipations(updatedParticipations);
    localStorage.setItem('rvm_participations', JSON.stringify(updatedParticipations));

    setActiveTab('dashboard');
    alert(`Importação concluída!\n\n${newPublishers.length} novos publicadores.\n${updatedExistingPublishers.length} publicadores atualizados.\n${newParticipations.length} participações importadas.`);
  };

  const savePublisher = (publisher: Publisher) => {
    let updated: Publisher[]
    if (editingPublisher) {
      updated = publishers.map(p => p.id === publisher.id ? publisher : p)
    } else {
      publisher.id = crypto.randomUUID()
      updated = [...publishers, publisher]
    }
    setPublishers(updated)
    localStorage.setItem('rvm_publishers', JSON.stringify(updated))
    setShowPublisherForm(false)
    setEditingPublisher(null)
  }

  const deletePublisher = (publisher: Publisher) => {
    if (confirm(`Remover ${publisher.name}?`)) {
      const updated = publishers.filter(p => p.id !== publisher.id)
      setPublishers(updated)
      localStorage.setItem('rvm_publishers', JSON.stringify(updated))
    }
  }

  const editPublisher = (publisher: Publisher) => {
    setEditingPublisher(publisher)
    setShowPublisherForm(true)
  }

  const saveParticipation = (participation: Participation) => {
    participation.id = crypto.randomUUID()
    const updated = [...participations, participation]
    setParticipations(updated)
    localStorage.setItem('rvm_participations', JSON.stringify(updated))
  }

  // Render main content with persistence
  // We use hidden divs for persistence

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Carregando...</p>
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
