import { useState, useEffect } from 'react'
import './App.css'
import type { Publisher, WorkbookPart } from './types'
import PublisherList from './components/PublisherList'
import PublisherForm from './components/PublisherForm'
import { initialPublishers } from './data/initialPublishers'
import { api } from './services/api'
import PublisherDuplicateChecker from './components/PublisherDuplicateChecker'
import WorkbookManager from './components/WorkbookManager'
import ApprovalPanel from './components/ApprovalPanel'
import BackupRestore from './components/BackupRestore'
import { ChatAgent } from './components/ChatAgent'
import PowerfulAgentTab from './components/PowerfulAgentTab'

import { workbookService } from './services/workbookService'

// Import Dashboard using lazy load or direct (direct for now)
import { AdminDashboard } from './pages/AdminDashboard'; // Needs to be created/exported

type ActiveTab = 'workbook' | 'approvals' | 'publishers' | 'backup' | 'agent' | 'admin'

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workbook')

  // ... (existing state)

  // Validate saved tab
  const validTabs: ActiveTab[] = ['workbook', 'approvals', 'publishers', 'backup', 'agent', 'admin']
    // ...

    // render nav:
    < button
  className = {`nav-btn ${activeTab === 'backup' ? 'active' : ''}`
}
onClick = {() => handleTabChange('backup')}
title = "Backup e Restauração"
  >
            💾 Backup
          </button >
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

        {/* Publishers */}
        <div style={{ display: activeTab === 'publishers' ? 'block' : 'none' }}>
          {/* ... kept hidden to save space in prompt ... */}
          {/* (Assuming user context handles surrounding lines match) */}
        </div>

        {/* Agent Tab */}
        <div style={{ display: activeTab === 'agent' ? 'block' : 'none' }}>
          {activeTab === 'agent' && (() => {
            // Compute derived state for Agent Tab
            // TODO: Optimization - move to useMemo if re-renders become an issue
            const weekParts = workbookParts.reduce((acc, part) => {
              if (!acc[part.weekId]) acc[part.weekId] = [];
              acc[part.weekId].push(part);
              return acc;
            }, {} as Record<string, WorkbookPart[]>);
            const weekOrder = Object.keys(weekParts).sort(); // YYYY-MM-DD sorting works

            return (
              <PowerfulAgentTab
                publishers={publishers}
                parts={workbookParts}
                weekParts={weekParts}
                weekOrder={weekOrder}
              />
            );
          })()}
        </div>

        {/* Backup */}
        <div style={{ display: activeTab === 'backup' ? 'block' : 'none' }}>
          <BackupRestore />
        </div>

        {/* Admin Dashboard */}
        <div style={{ display: activeTab === 'admin' ? 'block' : 'none' }}>
          <AdminDashboard />
        </div>
      </main>

{
  showPublisherForm && (
    <PublisherForm
      publisher={editingPublisher}
      publishers={publishers}
      onSave={savePublisher}
      onCancel={() => {
        setShowPublisherForm(false)
        setEditingPublisher(null)
      }}
    />
  )
}

{/* Chat Agent Modal */ }
<ChatAgent
  isOpen={isChatAgentOpen}
  onClose={() => setIsChatAgentOpen(false)}
  publishers={publishers}
  parts={workbookParts}
/>

{/* Floating Chat Button (Hidden in Agent Tab) */ }
{
  activeTab !== 'agent' && (
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
  )
}
    </div >
  )
}

export default App
