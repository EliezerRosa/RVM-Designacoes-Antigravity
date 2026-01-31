import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export const CostMonitor: React.FC = () => {
    const [stats, setStats] = useState({
        totalInput: 0,
        totalOutput: 0,
        totalTokens: 0,
        costUSD: 0,
        costBRL: 0,
        requestCount: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCostStats();
    }, []);

    const fetchCostStats = async () => {
        try {
            // Define start of current month
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            const { data, error } = await supabase
                .from('ai_intent_cache')
                .select('input_tokens, output_tokens')
                .gte('created_at', startOfMonth);

            if (error) throw error;

            if (data) {
                let inputSum = 0;
                let outputSum = 0;
                let count = 0;

                data.forEach(row => {
                    inputSum += row.input_tokens || 0;
                    outputSum += row.output_tokens || 0;
                    count++;
                });

                // Gemini 1.5 Flash Pricing (approx)
                // Input: $0.075 / 1M tokens
                // Output: $0.30 / 1M tokens
                const inputCost = (inputSum / 1_000_000) * 0.075;
                const outputCost = (outputSum / 1_000_000) * 0.30;
                const totalUSD = inputCost + outputCost;

                // Simple conversion rate estimate (Safety margin: R$ 6.50)
                const totalBRL = totalUSD * 6.50;

                setStats({
                    totalInput: inputSum,
                    totalOutput: outputSum,
                    totalTokens: inputSum + outputSum,
                    costUSD: totalUSD,
                    costBRL: totalBRL,
                    requestCount: count
                });
            }
        } catch (err) {
            console.error('Error fetching cost stats:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div style={{ fontSize: '12px', color: '#9CA3AF' }}>Calculando custos...</div>;

    return (
        <div style={{
            background: '#1E293B', // slate-800
            border: '1px solid #334155', // slate-700
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            width: '100%',
            maxWidth: '384px',
            marginBottom: '10px' // Spacing for injection in TemporalChat
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#CBD5E1', // slate-300
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    margin: 0
                }}>
                    Custo IA (Mês Atual)
                </h3>
                <span style={{
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: stats.costBRL > 25 ? '#7F1D1D' : '#064E3B', // red-900 : green-900
                    color: stats.costBRL > 25 ? '#FECACA' : '#A7F3D0' // red-200 : green-200
                }}>
                    {stats.requestCount} reqs
                </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '24px', fontWeight: 'bold', color: 'white' }}>
                        R$ {stats.costBRL.toFixed(2)}
                    </span>
                    <span style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>
                        ($ {stats.costUSD.toFixed(4)})
                    </span>
                </div>

                <div style={{ width: '100%', backgroundColor: '#334155', height: '6px', borderRadius: '9999px', overflow: 'hidden', marginTop: '4px' }}>
                    {/* Budget Progress Bar (Assuming R$ 50.00 limit) */}
                    <div
                        style={{
                            height: '100%',
                            backgroundColor: stats.costBRL > 40 ? '#EF4444' : stats.costBRL > 20 ? '#EAB308' : '#10B981',
                            width: `${Math.min((stats.costBRL / 50) * 100, 100)}%`
                        }}
                    />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748B', marginTop: '4px' }}>
                    <span>{stats.totalTokens.toLocaleString()} tokens</span>
                    <span>Meta: R$ 50,00</span>
                </div>
            </div>
        </div>
    );
};
