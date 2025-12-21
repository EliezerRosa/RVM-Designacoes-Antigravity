import type { Publisher, Participation } from '../types';
import { TeachingCategory } from '../types';
import { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';

interface DashboardProps {
    publishers: Publisher[];
    participations: Participation[];
}

// Cores para os gráficos
const COLORS = {
    danger: '#ef4444',
    warning: '#f59e0b',
    success: '#22c55e',
    primary: '#6366f1',
    secondary: '#8b5cf6',
    tertiary: '#06b6d4',
};

const CATEGORY_COLORS = {
    TEACHING: '#6366f1',
    STUDENT: '#22c55e',
    HELPER: '#f59e0b',
};

// Mapeamento de partes para categorias
const getPartCategory = (partTitle: string): TeachingCategory => {
    const lowerTitle = partTitle.toLowerCase();
    if (lowerTitle.includes('discurso') || lowerTitle.includes('joias') || lowerTitle.includes('necessidades')) {
        return TeachingCategory.TEACHING;
    }
    if (lowerTitle.includes('ajudante')) {
        return TeachingCategory.HELPER;
    }
    return TeachingCategory.STUDENT;
};

export default function Dashboard({ publishers, participations }: DashboardProps) {
    // ===== CÁLCULOS =====
    const stats = useMemo(() => {
        const now = new Date();
        const brothers = publishers.filter(p => p.gender === 'brother').length;
        const sisters = publishers.filter(p => p.gender === 'sister').length;
        const elders = publishers.filter(p => p.condition === 'Ancião').length;
        const ministerialServants = publishers.filter(p => p.condition === 'Servo Ministerial').length;

        // Calcular dias sem participar para cada publicador ativo
        const publisherData = publishers
            .filter(p => p.isServing && !p.isNotQualified && !p.requestedNoParticipation)
            .map(pub => {
                const pubParticipations = participations.filter(p =>
                    p.publisherName.toLowerCase() === pub.name.toLowerCase()
                );

                const validDates = pubParticipations
                    .map(p => p.date)
                    .filter(d => d && !isNaN(new Date(d).getTime()));

                const lastDate = validDates.length > 0
                    ? validDates.sort((a, b) => b.localeCompare(a))[0]
                    : null;

                const daysSinceLast = lastDate
                    ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
                    : 999;

                return {
                    id: pub.id,
                    name: pub.name,
                    gender: pub.gender,
                    condition: pub.condition,
                    daysSinceLast,
                    count: pubParticipations.length,
                    lastDate,
                };
            });

        // Top 10 mais tempo sem participar
        const topWaiting = [...publisherData]
            .sort((a, b) => b.daysSinceLast - a.daysSinceLast)
            .slice(0, 10);

        // Top 5 com mais participações
        const topActive = [...publisherData]
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Distribuição por categoria
        const categoryCount = { TEACHING: 0, STUDENT: 0, HELPER: 0 };
        participations.forEach(p => {
            const cat = getPartCategory(p.partTitle);
            categoryCount[cat]++;
        });

        const categoryData = [
            { name: 'Ensino', value: categoryCount.TEACHING, color: CATEGORY_COLORS.TEACHING },
            { name: 'Estudante', value: categoryCount.STUDENT, color: CATEGORY_COLORS.STUDENT },
            { name: 'Ajudante', value: categoryCount.HELPER, color: CATEGORY_COLORS.HELPER },
        ];

        // Alertas
        const urgentCount = publisherData.filter(p => p.daysSinceLast > 90).length;
        const warningCount = publisherData.filter(p => p.daysSinceLast > 60 && p.daysSinceLast <= 90).length;
        const neverParticipated = publisherData.filter(p => p.daysSinceLast === 999).length;

        return {
            totalPublishers: publishers.length,
            brothers,
            sisters,
            elders,
            ministerialServants,
            totalParticipations: participations.length,
            topWaiting,
            topActive,
            categoryData,
            urgentCount,
            warningCount,
            neverParticipated,
        };
    }, [publishers, participations]);

    // Dados para o gráfico de barras
    const barChartData = stats.topWaiting.map(p => ({
        name: p.name.split(' ')[0], // Primeiro nome apenas
        fullName: p.name,
        days: p.daysSinceLast === 999 ? 0 : p.daysSinceLast,
        neverParticipated: p.daysSinceLast === 999,
        fill: p.daysSinceLast > 90 ? COLORS.danger : p.daysSinceLast > 60 ? COLORS.warning : COLORS.success,
    }));

    return (
        <div className="dashboard" style={{ padding: 'var(--spacing-lg)' }}>
            <h2 style={{ marginBottom: 'var(--spacing-xl)' }}>📊 Dashboard Analítico</h2>

            {/* ===== CARDS DE ALERTA ===== */}
            {(stats.urgentCount > 0 || stats.warningCount > 0 || stats.neverParticipated > 0) && (
                <div className="card" style={{
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(245,158,11,0.1))',
                    marginBottom: 'var(--spacing-xl)',
                    padding: 'var(--spacing-lg)',
                    border: '1px solid rgba(239,68,68,0.3)'
                }}>
                    <h3 style={{ marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        ⚠️ Atenção Necessária
                    </h3>
                    <div style={{ display: 'flex', gap: 'var(--spacing-xl)', flexWrap: 'wrap' }}>
                        {stats.urgentCount > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '12px', height: '12px', borderRadius: '50%',
                                    background: COLORS.danger, display: 'inline-block'
                                }}></span>
                                <span><strong>{stats.urgentCount}</strong> publicadores &gt; 90 dias sem participar</span>
                            </div>
                        )}
                        {stats.warningCount > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '12px', height: '12px', borderRadius: '50%',
                                    background: COLORS.warning, display: 'inline-block'
                                }}></span>
                                <span><strong>{stats.warningCount}</strong> entre 60-90 dias</span>
                            </div>
                        )}
                        {stats.neverParticipated > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '12px', height: '12px', borderRadius: '50%',
                                    background: COLORS.secondary, display: 'inline-block'
                                }}></span>
                                <span><strong>{stats.neverParticipated}</strong> nunca participaram</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== KPIs ===== */}
            <div className="stats-grid" style={{ marginBottom: 'var(--spacing-xl)' }}>
                <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-info">
                        <h3>{stats.totalPublishers}</h3>
                        <p>Publicadores</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">👔</div>
                    <div className="stat-info">
                        <h3>{stats.brothers}</h3>
                        <p>Irmãos</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">👗</div>
                    <div className="stat-info">
                        <h3>{stats.sisters}</h3>
                        <p>Irmãs</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">📝</div>
                    <div className="stat-info">
                        <h3>{stats.totalParticipations}</h3>
                        <p>Participações</p>
                    </div>
                </div>
            </div>

            {/* ===== GRÁFICOS ===== */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--spacing-xl)', marginBottom: 'var(--spacing-xl)' }}>

                {/* Gráfico de Barras: Dias sem Participar */}
                <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>📊 Dias sem Participar (Top 10)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={barChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                            <XAxis type="number" />
                            <YAxis type="category" dataKey="name" width={80} />
                            <Tooltip
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                formatter={(value: any, _name: any, props: any) => [
                                    props.payload.neverParticipated ? 'Nunca participou' : `${value} dias`,
                                    props.payload.fullName
                                ]}
                            />
                            <Bar dataKey="days" radius={[0, 4, 4, 0]}>
                                {barChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--spacing-lg)', marginTop: 'var(--spacing-md)', fontSize: '0.85em' }}>
                        <span><span style={{ color: COLORS.danger }}>●</span> &gt; 90 dias</span>
                        <span><span style={{ color: COLORS.warning }}>●</span> 60-90 dias</span>
                        <span><span style={{ color: COLORS.success }}>●</span> &lt; 60 dias</span>
                    </div>
                </div>

                {/* Gráfico de Pizza: Distribuição por Categoria */}
                <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>🎯 Distribuição por Categoria</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={stats.categoryData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={2}
                                dataKey="value"
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                label={({ name, percent }: any) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
                            >
                                {stats.categoryData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ===== RANKINGS ===== */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-xl)' }}>

                {/* Ranking: Mais tempo sem participar */}
                <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>⏰ Mais Tempo Sem Participar</h3>
                    <div>
                        {stats.topWaiting.slice(0, 5).map((pub, i) => (
                            <div
                                key={pub.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: 'var(--spacing-sm) 0',
                                    borderBottom: '1px solid var(--border-color)'
                                }}
                            >
                                <span>
                                    <span style={{
                                        display: 'inline-block',
                                        width: '24px',
                                        fontWeight: 'bold',
                                        color: 'var(--text-muted)'
                                    }}>{i + 1}.</span>
                                    {pub.gender === 'brother' ? '👔' : '👗'} {pub.name}
                                </span>
                                <span style={{
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    fontSize: '0.85em',
                                    background: pub.daysSinceLast > 90 ? 'rgba(239,68,68,0.2)' :
                                        pub.daysSinceLast > 60 ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)',
                                    color: pub.daysSinceLast > 90 ? COLORS.danger :
                                        pub.daysSinceLast > 60 ? COLORS.warning : COLORS.success
                                }}>
                                    {pub.daysSinceLast === 999 ? 'Nunca' : `${pub.daysSinceLast} dias`}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Ranking: Mais participações */}
                <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>🏆 Mais Participações</h3>
                    <div>
                        {stats.topActive.map((pub, i) => (
                            <div
                                key={pub.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: 'var(--spacing-sm) 0',
                                    borderBottom: '1px solid var(--border-color)'
                                }}
                            >
                                <span>
                                    <span style={{
                                        display: 'inline-block',
                                        width: '24px',
                                        fontWeight: 'bold',
                                        color: 'var(--text-muted)'
                                    }}>{i + 1}.</span>
                                    {pub.gender === 'brother' ? '👔' : '👗'} {pub.name}
                                </span>
                                <span style={{
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    fontSize: '0.85em',
                                    background: 'rgba(99,102,241,0.2)',
                                    color: COLORS.primary
                                }}>
                                    {pub.count}x
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ===== COMPOSIÇÃO ===== */}
            <div className="card" style={{ padding: 'var(--spacing-lg)', marginTop: 'var(--spacing-xl)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>👥 Composição da Congregação</h3>
                <div style={{ display: 'flex', gap: 'var(--spacing-xl)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                        <span>Anciãos</span>
                        <span className="badge badge-elder">{stats.elders}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                        <span>Servos Ministeriais</span>
                        <span className="badge badge-ms">{stats.ministerialServants}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                        <span>Publicadores</span>
                        <span className="badge">{stats.totalPublishers - stats.elders - stats.ministerialServants}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
