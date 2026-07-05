/**
 * MonthlyReportTab — entry point da aba "Relatório Mensal" (lazy-loaded).
 * Orquestra sub-abas: Painel, Relatórios, Novo (S-4), Publicadores, Grupos,
 * Congregações e Sincronização.
 */
import { useState } from 'react';
import { RmDashboard } from './RmDashboard';
import { RmReportList } from './RmReportList';
import { RmReportForm } from './RmReportForm';
import { RmPublisherCrud } from './RmPublisherCrud';
import { RmFieldGroupCrud } from './RmFieldGroupCrud';
import { RmCongregationCrud } from './RmCongregationCrud';
import { RmSyncPortal } from './RmSyncPortal';

type SubTab = 'dashboard' | 'reports' | 'new' | 'publishers' | 'groups' | 'congregations' | 'sync';

const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: 'dashboard', label: '📊 Painel' },
    { id: 'reports', label: '📄 Relatórios' },
    { id: 'new', label: '➕ Novo (S-4)' },
    { id: 'publishers', label: '👥 Publicadores' },
    { id: 'groups', label: '🗂️ Grupos' },
    { id: 'congregations', label: '⛪ Congregações' },
    { id: 'sync', label: '🔗 Sincronização' },
];

export default function MonthlyReportTab() {
    const [sub, setSub] = useState<SubTab>('dashboard');

    return (
        <div>
            <div style={{
                display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0.75rem 1rem',
                borderBottom: '1px solid #334155', position: 'sticky', top: 0, background: '#0f172a', zIndex: 1,
            }}>
                {SUB_TABS.map(t => (
                    <button key={t.id} className={sub === t.id ? 'btn-primary' : 'btn-secondary'} onClick={() => setSub(t.id)}>
                        {t.label}
                    </button>
                ))}
            </div>
            {sub === 'dashboard' && <RmDashboard />}
            {sub === 'reports' && <RmReportList />}
            {sub === 'new' && <RmReportForm />}
            {sub === 'publishers' && <RmPublisherCrud />}
            {sub === 'groups' && <RmFieldGroupCrud />}
            {sub === 'congregations' && <RmCongregationCrud />}
            {sub === 'sync' && <RmSyncPortal />}
        </div>
    );
}
