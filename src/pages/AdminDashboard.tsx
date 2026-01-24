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
        <div className="p-6 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">🧠 Antigravity Admin Core</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Stat Cards */}
                <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
                    <h3 className="text-gray-500 text-sm font-semibold uppercase">Total Cached Intents</h3>
                    <p className="text-4xl font-bold text-gray-800 mt-2">{stats.total}</p>
                    <p className="text-xs text-green-500 mt-1">Economia direta de Tokens</p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-500">
                    <h3 className="text-gray-500 text-sm font-semibold uppercase">Top Model</h3>
                    <p className="text-2xl font-bold text-gray-800 mt-2">
                        {stats.byModel.sort((a, b) => b.value - a.value)[0]?.name || 'N/A'}
                    </p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-purple-500">
                    <h3 className="text-gray-500 text-sm font-semibold uppercase">Most Common Level</h3>
                    <p className="text-2xl font-bold text-gray-800 mt-2">
                        {stats.byLevel.sort((a, b) => b.value - a.value)[0]?.name || 'N/A'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Charts */}
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold mb-4">Model Distribution</h3>
                    <div className="h-64">
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
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold mb-4">Thinking Levels</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.byLevel}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="value" fill="#8884d8">
                                    {stats.byLevel.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Recent Table */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold">Recent Cache Activity</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-100 text-gray-600 text-sm uppercase">
                                <th className="px-6 py-3">Time</th>
                                <th className="px-6 py-3">Level</th>
                                <th className="px-6 py-3">Model</th>
                                <th className="px-6 py-3">Prompt Preview</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {cacheItems.map(item => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {new Date(item.created_at).toLocaleTimeString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs rounded-full font-semibold
                                            ${item.thinking_level === 'HIGH' ? 'bg-red-100 text-red-800' :
                                                item.thinking_level === 'MEDIUM' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-green-100 text-green-800'}`}>
                                            {item.thinking_level}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-700">
                                        {item.model_used}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">
                                        {item.prompt_preview || 'No preview available'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// Default export for lazy loading
export default AdminDashboard;
