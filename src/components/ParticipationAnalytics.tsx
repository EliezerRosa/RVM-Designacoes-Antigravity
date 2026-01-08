/**
 * Participation Analytics Component
 * Painel de análise de histórico de participações
 */

import { useState, useEffect, useCallback } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line
} from 'recharts';
import {
    participationAnalyticsService,
    type ParticipationFilters,
    type ComparisonData
} from '../services/participationAnalyticsService';
import type { WorkbookPart } from '../types';



// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================

function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: string }) {
    return (
        <div style={{
            background: '#1f2937',
            padding: '16px',
            borderRadius: '8px',
            textAlign: 'center',
            border: '1px solid #374151'
        }}>
            <div style={{ fontSize: '0.85em', color: '#9ca3af', marginBottom: '6px' }}>
                {icon && <span style={{ marginRight: '6px' }}>{icon}</span>}
                {label}
            </div>
            <div style={{ fontSize: '1.6em', fontWeight: 'bold', color: '#3b82f6' }}>{value}</div>
        </div>
    );
}

function MultiSelect({
    label,
    options,
    selected,
    onChange
}: {
    label: string;
    options: string[];
    selected: string[];
    onChange: (v: string[]) => void
}) {
    const [isOpen, setIsOpen] = useState(false);

    const toggleOption = (opt: string) => {
        if (selected.includes(opt)) {
            onChange(selected.filter(s => s !== opt));
        } else {
            onChange([...selected, opt]);
        }
    };

    return (
        <div style={{ position: 'relative', minWidth: '200px' }}>
            <label style={{ fontSize: '0.85em', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                {label}
            </label>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: '#374151',
                    border: '1px solid #4b5563',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: '#fff',
                    minHeight: '38px'
                }}
            >
                {selected.length === 0 ? 'Selecione...' : `${selected.length} selecionado(s)`}
            </div>
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#1f2937',
                    border: '1px solid #4b5563',
                    borderRadius: '6px',
                    maxHeight: '250px',
                    overflowY: 'auto',
                    zIndex: 100,
                    marginTop: '2px'
                }}>
                    {options.map(opt => (
                        <div
                            key={opt}
                            onClick={() => toggleOption(opt)}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                background: selected.includes(opt) ? '#3b82f6' : 'transparent',
                                color: '#fff',
                                borderBottom: '1px solid #374151'
                            }}
                        >
                            {selected.includes(opt) ? '✓ ' : ''}{opt}
                        </div>
                    ))}
                    {options.length === 0 && (
                        <div style={{ padding: '12px', color: '#9ca3af', textAlign: 'center' }}>
                            Nenhum publicador encontrado
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function ParticipationAnalytics() {
    // Estados de filtro
    const [publishers, setPublishers] = useState<string[]>([]);
    const [selectedPublishers, setSelectedPublishers] = useState<string[]>([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [modalidades, setModalidades] = useState<string[]>([]);
    const [selectedModalidade, setSelectedModalidade] = useState('Todas');
    const [tiposParte, setTiposParte] = useState<string[]>([]);
    const [selectedTipoParte, setSelectedTipoParte] = useState('Todos');
    const [selectedFuncao, setSelectedFuncao] = useState<'Todos' | 'Titular' | 'Ajudante'>('Todos');

    // Estados de dados
    const [loading, setLoading] = useState(false);
    const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
    const [participations, setParticipations] = useState<WorkbookPart[]>([]);

    // Carregar opções dos dropdowns
    useEffect(() => {
        async function loadOptions() {
            const [pubs, mods, tipos] = await Promise.all([
                participationAnalyticsService.getDistinctPublishers(),
                participationAnalyticsService.getDistinctModalidades(),
                participationAnalyticsService.getDistinctTiposParte()
            ]);
            setPublishers(pubs);
            setModalidades(['Todas', ...mods]);
            setTiposParte(['Todos', ...tipos]);

            // Definir período padrão: últimos 12 meses
            const today = new Date();
            const yearAgo = new Date();
            yearAgo.setFullYear(today.getFullYear() - 1);
            setEndDate(today.toISOString().split('T')[0]);
            setStartDate(yearAgo.toISOString().split('T')[0]);
        }
        loadOptions();
    }, []);

    // Executar busca
    const handleSearch = useCallback(async () => {
        if (selectedPublishers.length === 0) {
            alert('Selecione pelo menos um publicador');
            return;
        }

        setLoading(true);
        try {
            const filters: ParticipationFilters = {
                publisherNames: selectedPublishers,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                modalidade: selectedModalidade !== 'Todas' ? selectedModalidade : undefined,
                tipoParte: selectedTipoParte !== 'Todos' ? selectedTipoParte : undefined,
                funcao: selectedFuncao !== 'Todos' ? selectedFuncao : undefined
            };

            // Buscar dados comparativos
            const comparison = await participationAnalyticsService.comparePublishers(
                selectedPublishers,
                filters
            );
            setComparisonData(comparison);

            // Buscar detalhes das participações
            const parts = await participationAnalyticsService.getParticipations(filters);
            setParticipations(parts);

        } catch (err) {
            console.error('Erro ao buscar dados:', err);
            alert('Erro ao buscar dados: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setLoading(false);
        }
    }, [selectedPublishers, startDate, endDate, selectedModalidade, selectedTipoParte, selectedFuncao]);

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.5em', marginBottom: '20px', color: '#fff' }}>
                📊 Análise de Participações
            </h2>

            {/* FILTROS */}
            <div style={{
                background: '#1f2937',
                padding: '20px',
                borderRadius: '12px',
                marginBottom: '20px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '15px',
                alignItems: 'flex-end'
            }}>
                {/* Publicadores */}
                <MultiSelect
                    label="Publicadores"
                    options={publishers}
                    selected={selectedPublishers}
                    onChange={setSelectedPublishers}
                />

                {/* Período */}
                <div>
                    <label style={{ fontSize: '0.85em', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        Data Início
                    </label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        style={{
                            background: '#374151',
                            border: '1px solid #4b5563',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            color: '#fff'
                        }}
                    />
                </div>

                <div>
                    <label style={{ fontSize: '0.85em', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        Data Fim
                    </label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        style={{
                            background: '#374151',
                            border: '1px solid #4b5563',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            color: '#fff'
                        }}
                    />
                </div>

                {/* Modalidade */}
                <div>
                    <label style={{ fontSize: '0.85em', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        Modalidade
                    </label>
                    <select
                        value={selectedModalidade}
                        onChange={e => setSelectedModalidade(e.target.value)}
                        style={{
                            background: '#374151',
                            border: '1px solid #4b5563',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            color: '#fff',
                            minWidth: '150px'
                        }}
                    >
                        {modalidades.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>

                {/* Tipo de Parte */}
                <div>
                    <label style={{ fontSize: '0.85em', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        Tipo de Parte
                    </label>
                    <select
                        value={selectedTipoParte}
                        onChange={e => setSelectedTipoParte(e.target.value)}
                        style={{
                            background: '#374151',
                            border: '1px solid #4b5563',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            color: '#fff',
                            minWidth: '180px'
                        }}
                    >
                        {tiposParte.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                {/* Função */}
                <div>
                    <label style={{ fontSize: '0.85em', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        Função
                    </label>
                    <select
                        value={selectedFuncao}
                        onChange={e => setSelectedFuncao(e.target.value as any)}
                        style={{
                            background: '#374151',
                            border: '1px solid #4b5563',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            color: '#fff',
                            minWidth: '120px'
                        }}
                    >
                        <option value="Todos">Todos</option>
                        <option value="Titular">Titular</option>
                        <option value="Ajudante">Ajudante</option>
                    </select>
                </div>

                {/* Botão Buscar */}
                <button
                    onClick={handleSearch}
                    disabled={loading || selectedPublishers.length === 0}
                    style={{
                        background: loading ? '#6b7280' : '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '6px',
                        cursor: loading || selectedPublishers.length === 0 ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    {loading ? '⏳ Buscando...' : '🔍 Buscar'}
                </button>
            </div>

            {/* RESULTADOS */}
            {comparisonData && (
                <>
                    {/* CARDS DE RESUMO */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '15px',
                        marginBottom: '25px'
                    }}>
                        <StatCard
                            icon="📋"
                            label="Total de Participações"
                            value={comparisonData.publishers.reduce((sum, p) => sum + p.totalParticipations, 0)}
                        />
                        <StatCard
                            icon="👤"
                            label="Publicadores Analisados"
                            value={comparisonData.publishers.length}
                        />
                        <StatCard
                            icon="🎯"
                            label="Como Titular"
                            value={comparisonData.publishers.reduce((sum, p) => sum + p.asTitular, 0)}
                        />
                        <StatCard
                            icon="🤝"
                            label="Como Ajudante"
                            value={comparisonData.publishers.reduce((sum, p) => sum + p.asAjudante, 0)}
                        />
                    </div>

                    {/* GRÁFICO COMPARATIVO */}
                    {comparisonData.chartData.length > 0 && (
                        <div style={{
                            background: '#1f2937',
                            padding: '20px',
                            borderRadius: '12px',
                            marginBottom: '25px'
                        }}>
                            <h3 style={{ fontSize: '1.1em', marginBottom: '15px', color: '#fff' }}>
                                📊 Comparação de Participações
                            </h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={comparisonData.chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9ca3af" />
                                    <YAxis stroke="#9ca3af" />
                                    <Tooltip
                                        contentStyle={{ background: '#1f2937', border: '1px solid #374151' }}
                                        labelStyle={{ color: '#fff' }}
                                    />
                                    <Legend />
                                    <Bar dataKey="Total" fill="#3b82f6" name="Total" />
                                    <Bar dataKey="Titular" fill="#10b981" name="Titular" />
                                    <Bar dataKey="Ajudante" fill="#f59e0b" name="Ajudante" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* TIMELINE (se único publicador) */}
                    {comparisonData.publishers.length === 1 && comparisonData.publishers[0].timeline.length > 0 && (
                        <div style={{
                            background: '#1f2937',
                            padding: '20px',
                            borderRadius: '12px',
                            marginBottom: '25px'
                        }}>
                            <h3 style={{ fontSize: '1.1em', marginBottom: '15px', color: '#fff' }}>
                                📈 Evolução Mensal - {comparisonData.publishers[0].name}
                            </h3>
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={comparisonData.publishers[0].timeline}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="date" stroke="#9ca3af" />
                                    <YAxis stroke="#9ca3af" />
                                    <Tooltip
                                        contentStyle={{ background: '#1f2937', border: '1px solid #374151' }}
                                        labelStyle={{ color: '#fff' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="count"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        dot={{ fill: '#3b82f6' }}
                                        name="Participações"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* TABELA DE DETALHES */}
                    {participations.length > 0 && (
                        <div style={{
                            background: '#1f2937',
                            padding: '20px',
                            borderRadius: '12px'
                        }}>
                            <h3 style={{ fontSize: '1.1em', marginBottom: '15px', color: '#fff' }}>
                                📋 Detalhes das Participações ({participations.length})
                            </h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #374151' }}>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#9ca3af' }}>Data</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#9ca3af' }}>Publicador</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#9ca3af' }}>Tipo da Parte</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#9ca3af' }}>Título</th>
                                            <th style={{ padding: '10px', textAlign: 'center', color: '#9ca3af' }}>Função</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {participations.slice(0, 100).map(p => (
                                            <tr key={p.id} style={{ borderBottom: '1px solid #374151' }}>
                                                <td style={{ padding: '10px', color: '#fff' }}>{p.date}</td>
                                                <td style={{ padding: '10px', color: '#fff', fontWeight: '500' }}>
                                                    {p.resolvedPublisherName}
                                                </td>
                                                <td style={{ padding: '10px', color: '#d1d5db' }}>{p.tipoParte}</td>
                                                <td style={{ padding: '10px', color: '#9ca3af', fontSize: '0.9em' }}>
                                                    {p.tituloParte?.substring(0, 50)}{p.tituloParte?.length > 50 ? '...' : ''}
                                                </td>
                                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '3px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.85em',
                                                        background: p.funcao === 'Titular' ? '#10b98133' : '#f59e0b33',
                                                        color: p.funcao === 'Titular' ? '#10b981' : '#f59e0b'
                                                    }}>
                                                        {p.funcao}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {participations.length > 100 && (
                                    <div style={{ padding: '15px', textAlign: 'center', color: '#9ca3af' }}>
                                        Mostrando 100 de {participations.length} registros
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ESTADO INICIAL */}
            {!comparisonData && !loading && (
                <div style={{
                    background: '#1f2937',
                    padding: '40px',
                    borderRadius: '12px',
                    textAlign: 'center',
                    color: '#9ca3af'
                }}>
                    <div style={{ fontSize: '3em', marginBottom: '15px' }}>📊</div>
                    <div style={{ fontSize: '1.1em' }}>
                        Selecione publicadores e clique em "Buscar" para ver o histórico de participações.
                    </div>
                </div>
            )}
        </div>
    );
}
