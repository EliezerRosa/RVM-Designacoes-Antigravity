/**
 * WorkbookToolbar — Barra de ações + filtros do WorkbookManager
 * Extraído de WorkbookManager.tsx (Fase 5B da Auditoria)
 */

import { type WorkbookPart } from '../types';
import { downloadS140Unified } from '../services/s140GeneratorUnified';
import { undoService } from '../services/undoService';

interface WeekOption {
    weekId: string;
    weekDisplay: string;
    year: number;
}

interface WorkbookToolbarProps {
    // Estado
    loading: boolean;
    canUndo: boolean;
    undoDescription?: string;
    showHiddenParts: boolean;

    // Filtros
    searchText: string;
    filterWeek: string;
    filterSection: string;
    filterFuncao: string;
    filterTipo: string;
    filterStatus: string;

    // Dados derivados
    filteredParts: WorkbookPart[];
    parts: WorkbookPart[];
    currentPage: number;
    uniqueWeeks: WeekOption[];
    uniqueSections: string[];
    uniqueTipos: string[];

    // Callbacks de filtro
    onSearchTextChange: (v: string) => void;
    onFilterWeekChange: (v: string) => void;
    onFilterSectionChange: (v: string) => void;
    onFilterFuncaoChange: (v: string) => void;
    onFilterTipoChange: (v: string) => void;
    onFilterStatusChange: (v: string) => void;
    onShowHiddenPartsChange: (v: boolean) => void;
    onCurrentPageChange: (v: number) => void;

    // Callbacks de ação
    onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onRefresh: () => void;
    onOpenGeneration: () => void;
    onOpenLocalNeeds: () => void;
    onOpenEvents: () => void;
    onOpenBulkReset: () => void;
    onOpenS140Multi: () => void;
    setLoading: (v: boolean) => void;
    setSuccessMessage: (v: string | null) => void;
}

export function WorkbookToolbar(props: WorkbookToolbarProps) {
    const {
        loading, canUndo, undoDescription, showHiddenParts,
        searchText, filterWeek, filterSection, filterFuncao, filterTipo, filterStatus,
        filteredParts, parts, currentPage, uniqueWeeks, uniqueSections, uniqueTipos,
        onSearchTextChange, onFilterWeekChange, onFilterSectionChange, onFilterFuncaoChange,
        onFilterTipoChange, onFilterStatusChange, onShowHiddenPartsChange, onCurrentPageChange,
        onFileUpload, onRefresh, onOpenGeneration, onOpenLocalNeeds, onOpenEvents,
        onOpenBulkReset, onOpenS140Multi, setLoading, setSuccessMessage,
    } = props;

    // Paginação derivada
    const currentFilteredWeeks = [...new Set(filteredParts.map(p => p.weekId))].sort().reverse();
    const totalPages = currentFilteredWeeks.length || 1;
    const safePage = Math.min(Math.max(currentPage, 1), totalPages);

    // S-140: semana da página atual (sorted ASC para S-140)
    const sortedWeeks = [...new Set(filteredParts.map(p => p.weekId))].sort();
    const s140SafePage = Math.min(Math.max(currentPage, 1), sortedWeeks.length || 1);
    const currentWeekId = sortedWeeks[s140SafePage - 1];
    const hasWeek = !!currentWeekId;

    return (
        <div style={{
            marginBottom: '2px',
            background: '#fff',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #E5E7EB',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
            {/* Linha Superior: Upload e Ações Principais */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                {/* Upload Button Disfarçado */}
                <div>
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={onFileUpload}
                        style={{ display: 'none' }}
                        id="workbook-excel-upload"
                    />
                    <label
                        htmlFor="workbook-excel-upload"
                        style={{
                            cursor: 'pointer',
                            color: '#4F46E5',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            padding: '4px 8px',
                            background: '#EEF2FF',
                            borderRadius: '4px'
                        }}
                    >
                        📊 Carregar Excel
                    </label>
                </div>

                {/* Paginação Central */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F3F4F6', padding: '2px 8px', borderRadius: '4px' }}>
                    <button
                        onClick={() => onCurrentPageChange(Math.max(1, safePage - 1))}
                        disabled={safePage === 1}
                        style={{ border: 'none', background: 'none', cursor: safePage === 1 ? 'not-allowed' : 'pointer', opacity: safePage === 1 ? 0.3 : 1, fontSize: '14px' }}
                    >
                        ⬅️
                    </button>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                        Semana {safePage} de {totalPages}
                    </span>
                    <button
                        onClick={() => onCurrentPageChange(Math.min(totalPages, safePage + 1))}
                        disabled={safePage === totalPages}
                        style={{ border: 'none', background: 'none', cursor: safePage === totalPages ? 'not-allowed' : 'pointer', opacity: safePage === totalPages ? 0.3 : 1, fontSize: '14px' }}
                    >
                        ➡️
                    </button>
                </div>

                {/* Botões de Ação */}
                <div style={{ display: 'flex', gap: '4px' }}>
                    {/* Botão UNDO */}
                    <button
                        onClick={async () => {
                            if (!canUndo) return;
                            try {
                                setLoading(true);
                                const result = await undoService.undo();
                                if (result.success) {
                                    setSuccessMessage(`↩️ Desfeito: ${result.description || undoDescription}`);
                                    onRefresh();
                                }
                            } catch (err) {
                                alert('Erro ao desfazer');
                            } finally {
                                setLoading(false);
                            }
                        }}
                        disabled={loading || !canUndo}
                        title={undoDescription ? `Desfazer: ${undoDescription}` : 'Nada para desfazer'}
                        style={{
                            padding: '4px 10px',
                            cursor: canUndo ? 'pointer' : 'not-allowed',
                            background: canUndo ? '#EF4444' : '#E5E7EB',
                            color: canUndo ? 'white' : '#9CA3AF',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s'
                        }}
                    >
                        ↩️ Desfazer
                    </button>

                    <button onClick={onRefresh} disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                        🔄 Atualizar
                    </button>
                    <button onClick={onOpenGeneration} disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer', background: '#7C3AED', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                        🎯 Gerar
                    </button>
                    <button onClick={onOpenLocalNeeds} disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer', background: '#0891B2', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                        📋 Fila NL
                    </button>
                    <button onClick={onOpenEvents} disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer', background: '#DC2626', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                        📅 Eventos
                    </button>
                    <button onClick={onOpenBulkReset} disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer', background: '#F59E0B', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                        🔄 Reset Período
                    </button>
                    {/* Botões S-140 */}
                    <button
                        onClick={() => {
                            if (currentWeekId) {
                                const weekParts = parts.filter(p => p.weekId === currentWeekId);
                                downloadS140Unified(weekParts);
                            }
                        }}
                        disabled={loading || !hasWeek}
                        style={{ padding: '4px 10px', cursor: hasWeek ? 'pointer' : 'not-allowed', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500', opacity: hasWeek ? 1 : 0.5 }}>
                        📄 S-140
                    </button>
                    <button
                        onClick={onOpenS140Multi}
                        disabled={loading}
                        style={{ padding: '4px 10px', cursor: 'pointer', background: '#0F766E', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                        📦 Pacote
                    </button>
                </div>
            </div>

            {/* Linha Inferior: Filtros e Busca */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="🔍 Buscar..."
                    value={searchText}
                    onChange={e => onSearchTextChange(e.target.value)}
                    style={{ padding: '6px 10px', width: '180px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                />
                {/* Navegação de Semanas com setas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                        onClick={() => {
                            const idx = uniqueWeeks.findIndex(w => w.weekId === filterWeek);
                            if (idx > 0) onFilterWeekChange(uniqueWeeks[idx - 1].weekId);
                            else if (idx === -1 && uniqueWeeks.length > 0) onFilterWeekChange(uniqueWeeks[uniqueWeeks.length - 1].weekId);
                        }}
                        disabled={uniqueWeeks.length === 0}
                        style={{ padding: '4px 8px', border: '1px solid #D1D5DB', borderRadius: '4px', background: '#F9FAFB', cursor: 'pointer', fontSize: '14px' }}
                        title="Semana anterior"
                    >
                        ⬅️
                    </button>
                    <select value={filterWeek} onChange={e => onFilterWeekChange(e.target.value)} style={{ padding: '6px', minWidth: '180px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                        <option value="">Todas as semanas</option>
                        {uniqueWeeks.map(w => {
                            const cleanDisplay = w.weekDisplay.replace(/\bde\s+/gi, '').replace(/\s+/g, ' ').trim();
                            return (
                                <option key={w.weekId} value={w.weekId}>
                                    {w.year} | {cleanDisplay}
                                </option>
                            );
                        })}
                    </select>
                    <button
                        onClick={() => {
                            const idx = uniqueWeeks.findIndex(w => w.weekId === filterWeek);
                            if (idx >= 0 && idx < uniqueWeeks.length - 1) onFilterWeekChange(uniqueWeeks[idx + 1].weekId);
                            else if (idx === -1 && uniqueWeeks.length > 0) onFilterWeekChange(uniqueWeeks[0].weekId);
                        }}
                        disabled={uniqueWeeks.length === 0}
                        style={{ padding: '4px 8px', border: '1px solid #D1D5DB', borderRadius: '4px', background: '#F9FAFB', cursor: 'pointer', fontSize: '14px' }}
                        title="Próxima semana"
                    >
                        ➡️
                    </button>
                </div>
                <select value={filterSection} onChange={e => onFilterSectionChange(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                    <option value="">Seção: Todas</option>
                    {uniqueSections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filterFuncao} onChange={e => onFilterFuncaoChange(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                    <option value="">Função: Todas</option>
                    <option value="Titular">Titular</option>
                    <option value="Ajudante">Ajudante</option>
                </select>
                <select value={filterTipo} onChange={e => onFilterTipoChange(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                    <option value="">Tipo: Todos</option>
                    {uniqueTipos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={filterStatus} onChange={e => onFilterStatusChange(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                    <option value="">Status: Todos</option>
                    <option value="PENDENTE">Pendente</option>
                    <option value="PROPOSTA">Proposta</option>
                    <option value="APROVADA">Aprovada</option>
                    <option value="DESIGNADA">Designada</option>
                    <option value="REJEITADA">Rejeitada</option>
                    <option value="CONCLUIDA">Concluída</option>
                </select>
                {/* Toggle para exibir partes ocultas */}
                <label
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: '#6B7280',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        background: showHiddenParts ? '#FEF3C7' : '#F3F4F6',
                        borderRadius: '4px',
                        border: showHiddenParts ? '1px solid #F59E0B' : '1px solid #D1D5DB'
                    }}
                    title="Exibir Cânticos, Comentários Iniciais/Finais, Oração Inicial e Elogios"
                >
                    <input
                        type="checkbox"
                        checked={showHiddenParts}
                        onChange={e => onShowHiddenPartsChange(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                    />
                    👁️ Ocultas
                </label>
            </div>
        </div>
    );
}
