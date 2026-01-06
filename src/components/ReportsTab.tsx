import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import type { AnalyticsSummary } from '../services/analyticsService';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

interface ReportsTabProps {
    data: AnalyticsSummary | null;
}

export function ReportsTab({ data }: ReportsTabProps) {
    if (!data) return <div style={{ padding: 20, color: '#666' }}>Sem dados para exibir. Gere designações primeiro.</div>;

    const {
        totalAssignments,
        uniquePublishersUsed,
        coveragePercentage,
        distributionByType,
        topDesignated,
        lowDesignated,
        bumpChartData
    } = data;

    return (
        <div style={{ padding: '20px', overflowY: 'auto', height: '100%' }}>
            <h2 style={{ marginBottom: '20px', color: 'var(--text-primary)' }}>Relatórios de Designação</h2>

            {/* CARD DE RESUMO */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '30px'
            }}>
                <StatCard label="Total de Designações" value={totalAssignments} />
                <StatCard label="Publicadores Únicos" value={uniquePublishersUsed} />
                <StatCard label="Cobertura (Participação)" value={`${coveragePercentage}%`} />
            </div>

            {/* GRÁFICOS LINHA 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px', minHeight: '300px' }}>

                {/* DISTRIBUIÇÃO */}
                <ChartContainer title="Distribuição por Tipo">
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={distributionByType}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {distributionByType.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartContainer>

                {/* RANKING EVOLUTION (BUMP CHART) */}
                <ChartContainer title="Evolução do Ranking (Top 5 Histórico) - Bump Chart">
                    <div style={{ fontSize: '0.8em', color: '#666', marginBottom: '5px', textAlign: 'center' }}>
                        Posição no Ranking Acumulado (1º no topo)
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={bumpChartData?.data || []}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis reversed={true} hide={false} domain={[1, 'auto']} allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            {bumpChartData?.trackedKeys?.map((key: string, index: number) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    stroke={COLORS[index % COLORS.length]}
                                    strokeWidth={3}
                                    dot={{ r: 4 }}
                                    connectNulls
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </ChartContainer>
            </div>

            {/* GRÁFICOS LINHA 2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px', minHeight: '300px' }}>

                {/* TOP 10 */}
                <ChartContainer title="Top 10 Mais Designados (Total)">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={topDesignated} layout="vertical" margin={{ left: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#82ca9d" name="Partes" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartContainer>

                {/* LOW 10 */}
                <ChartContainer title="Top 10 Menos Designados (Total)">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={lowDesignated} layout="vertical" margin={{ left: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#f87171" name="Partes" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartContainer>
            </div>
        </div>
    );
}

function StatCard({ label, value }: { label: string, value: string | number }) {
    return (
        <div style={{
            background: 'var(--bg-secondary)',
            padding: '15px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            textAlign: 'center'
        }}>
            <div style={{ fontSize: '0.9em', color: 'var(--text-secondary)', marginBottom: '5px' }}>{label}</div>
            <div style={{ fontSize: '1.8em', fontWeight: 'bold', color: 'var(--primary-color)' }}>{value}</div>
        </div>
    );
}

function ChartContainer({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div style={{
            background: 'var(--bg-secondary)',
            padding: '15px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <h3 style={{ fontSize: '1.1em', marginBottom: '15px', textAlign: 'center', color: 'var(--text-primary)' }}>{title}</h3>
            <div style={{ flex: 1 }}>
                {children}
            </div>
        </div>
    );
}
