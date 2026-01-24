import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';

interface CacheItem {
    id: string;
    prompt_preview: string;
    thinking_level: string;
    model_used: string;
    created_at: string;
}

export function AdminDashboard() {
    const [cacheItems, setCacheItems] = useState<CacheItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        total: 0,
        byModel: [] as { name: string; value: number }[],
        byLevel: [] as { name: string; value: number }[]
    });

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('ai_intent_cache')
                .select('id, prompt_preview, thinking_level, model_used, created_at')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;

            if (data) {
                setCacheItems(data);
                processStats(data);
            }
        } catch (err) {
            console.error('Error fetching dashboard stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const processStats = (data: CacheItem[]) => {
        const modelCount: Record<string, number> = {};
        const levelCount: Record<string, number> = {};

        data.forEach(item => {
            modelCount[item.model_used] = (modelCount[item.model_used] || 0) + 1;
            levelCount[item.thinking_level] = (levelCount[item.thinking_level] || 0) + 1;
        });

        setStats({
            total: data.length,
            byModel: Object.entries(modelCount).map(([name, value]) => ({ name, value })),
            byLevel: Object.entries(levelCount).map(([name, value]) => ({ name, value }))
        });
    };

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    if (loading) {
        return (
            <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
                <div className="text-xl text-gray-500">Loading Intelligence...</div>
            </div>
        );
    }

    return (
        <div className="p-8 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">🧠 Antigravity Admin Core</h1>
                    <p className="text-gray-500 mt-2">Monitoramento em tempo real do ecossistema de Inteligência Artificial</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Stat Cards */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
                        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Total Cached Intents</h3>
                        <div className="flex items-baseline mt-2">
                            <p className="text-4xl font-extrabold text-gray-900">{stats.total}</p>
                            <span className="ml-2 text-sm text-green-600 font-medium">intents</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Economia direta de tokens e latência</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
                        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Top Model</h3>
                        <p className="text-2xl font-bold text-gray-800 mt-2 truncate">
                            {stats.byModel.sort((a, b) => b.value - a.value)[0]?.name || 'N/A'}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">Modelo mais utilizado pelo time</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
                        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Most Common Level</h3>
                        <p className="text-2xl font-bold text-gray-800 mt-2">
                            {stats.byLevel.sort((a, b) => b.value - a.value)[0]?.name || 'N/A'}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">Complexidade média das tarefas</p>
                    </div>
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Model Distribution */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-[400px]">
                        <h3 className="text-lg font-semibold text-gray-700 mb-6">Distribuição de Modelos</h3>
                        <div className="flex-1 w-full min-h-0">
                            {stats.total > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={stats.byModel}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {stats.byModel.map((_entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-300">
                                    <span className="text-4xl mb-2">📊</span>
                                    <p>Nenhum dado coletado ainda</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Thinking Levels */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-[400px]">
                        <h3 className="text-lg font-semibold text-gray-700 mb-6">Níveis de Raciocínio (Thinking Levels)</h3>
                        <div className="flex-1 w-full min-h-0">
                            {stats.total > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats.byLevel} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} />
                                        <Tooltip
                                            cursor={{ fill: '#f9fafb' }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                        />
                                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                            {stats.byLevel.map((_entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-300">
                                    <span className="text-4xl mb-2">🧠</span>
                                    <p>Aguardando interações...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Recent Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-gray-700">Fluxo de Atividade Recente</h3>
                        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">Live</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-gray-400 text-xs font-bold uppercase tracking-wider border-b border-gray-100">
                                    <th className="px-6 py-4 font-medium">Horário</th>
                                    <th className="px-6 py-4 font-medium">Nível</th>
                                    <th className="px-6 py-4 font-medium">Modelo</th>
                                    <th className="px-6 py-4 font-medium">Preview do Prompt</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {cacheItems.length > 0 ? cacheItems.map(item => (
                                    <tr key={item.id} className="hover:bg-gray-50/80 transition-colors duration-150">
                                        <td className="px-6 py-4 text-sm text-gray-600 tabular-nums">
                                            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                                ${item.thinking_level === 'HIGH' ? 'bg-purple-100 text-purple-800' :
                                                    item.thinking_level === 'MEDIUM' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-green-100 text-green-800'}`}>
                                                {item.thinking_level}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                            {item.model_used.replace('models/', '')}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate font-mono text-xs">
                                            {item.prompt_preview || 'No preview available'}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-gray-400 text-sm">
                                            Nenhuma atividade registrada no cache ainda.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Default export for lazy loading
export default AdminDashboard;
