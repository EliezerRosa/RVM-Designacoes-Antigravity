import { useState, useEffect } from 'react';
import { zapiGroupSyncService } from '../../services/zapiGroupSyncService';
import { supabase } from '../../lib/supabase';

interface PublisherItem {
    id: string;
    name: string;
    phone?: string;
}

export function ZApiMemberSearchPanel() {
    const [searchQuery, setSearchQuery] = useState('');
    const [groupName, setGroupName] = useState('Congregação Parque Jacaraípe');
    const [loading, setLoading] = useState(false);
    const [publishers, setPublishers] = useState<PublisherItem[]>([]);
    const [searchResults, setSearchResults] = useState<Array<{
        waPhone: string;
        waName: string;
        isPushName: boolean;
        matchedPub?: PublisherItem;
        status: string;
    }>>([]);
    const [selectedPubMap, setSelectedPubMap] = useState<Record<string, string>>({});
    const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadPublishers();
    }, []);

    const loadPublishers = async () => {
        try {
            const list = await zapiGroupSyncService.getAllPublishers();
            setPublishers(list);
        } catch (e) {
            console.warn('[ZApiMemberSearchPanel] Erro ao carregar publicadores:', e);
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setLoading(true);
        setActionMsg(null);
        setSearchResults([]);

        try {
            const { participants } = await zapiGroupSyncService.fetchGroupParticipants(groupName);
            const queryClean = searchQuery.toLowerCase().replace(/\D/g, '');
            const queryText = searchQuery.toLowerCase().trim();

            // Filtra membros por número (ex: 8889, 988891292) ou nome
            const filtered = participants.filter(p => {
                const rawP = (p.phone || '').replace(/\D/g, '');
                const pName = (p.name || p.pushName || p.shortName || '').toLowerCase();
                return (queryClean && rawP.includes(queryClean)) || (queryText && pName.includes(queryText));
            });

            if (filtered.length === 0) {
                // Tenta fallback com todos se a busca for por parte de numero
                const allReconciled = await zapiGroupSyncService.reconcileWithRvm(participants);
                const matched = allReconciled.filter(item => {
                    const clean = item.waPhone.replace(/\D/g, '');
                    return (queryClean && clean.includes(queryClean)) || (queryText && item.waName.toLowerCase().includes(queryText));
                });

                if (matched.length > 0) {
                    setSearchResults(matched.map(m => ({
                        waPhone: m.waPhone,
                        waName: m.waName,
                        isPushName: m.isPushName,
                        matchedPub: m.publisherId ? publishers.find(p => p.id === m.publisherId) : undefined,
                        status: m.status
                    })));
                    setLoading(false);
                    return;
                }
            }

            const reconciled = await zapiGroupSyncService.reconcileWithRvm(filtered);
            setSearchResults(reconciled.map(m => ({
                waPhone: m.waPhone,
                waName: m.waName,
                isPushName: m.isPushName,
                matchedPub: m.publisherId ? publishers.find(p => p.id === m.publisherId) : undefined,
                status: m.status
            })));

        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Falha ao pesquisar membro no Z-API.' });
        } finally {
            setLoading(false);
        }
    };

    const handleBindAndSave = async (waPhone: string, pubId: string) => {
        const pub = publishers.find(p => p.id === pubId);
        if (!pub) return;

        setLoading(true);
        setActionMsg(null);

        try {
            // Limpa telefone para salvar no formato (DDD) NNNNN-NNNN
            const cleanDigits = waPhone.replace(/\D/g, '');
            const rawPhone = cleanDigits.startsWith('55') && cleanDigits.length > 11 ? cleanDigits.slice(2) : cleanDigits;
            const formattedPhone = rawPhone.length === 11 
                ? `(${rawPhone.slice(0,2)}) ${rawPhone.slice(2,7)}-${rawPhone.slice(7)}`
                : waPhone;

            // 1. Atualiza o cadastro do publicador no Supabase
            const { data: currentPub } = await supabase.from('publishers').select('data').eq('id', pub.id).single();
            const updatedData = { ...(currentPub?.data || {}), phone: formattedPhone, contact_phone: formattedPhone };

            await supabase.from('publishers').update({ data: updatedData }).eq('id', pub.id);

            // 2. Atualiza a tabela rm.publishers se existir
            await supabase.from('rm.publishers').update({ phone: formattedPhone }).eq('id', pub.id);

            setActionMsg({ 
                type: 'success', 
                text: `✅ Sucesso! Telefone ${formattedPhone} vinculado a ${pub.name}!` 
            });

            // Recarrega publicadores
            loadPublishers();
            handleSearch();
        } catch (err: any) {
            setActionMsg({ type: 'error', text: 'Erro ao vincular: ' + (err.message || String(err)) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px', border: '1px solid #334155', marginTop: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔍 Consulta Individual de Membro WhatsApp (Fora do Modal)
            </h3>
            <p style={{ color: '#94a3b8', marginBottom: '16px', fontSize: '0.88rem' }}>
                Digite um número (ex: <strong>8889</strong> ou <strong>(27) 98889-1292</strong>) ou parte do nome para buscar a identificação do perfil WhatsApp no grupo e vincular ao RVM:
            </p>

            {/* Inputs de busca */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Digite o número (ex: 8889, 988891292) ou nome..."
                    style={{
                        flex: 1,
                        minWidth: '240px',
                        padding: '10px 14px',
                        background: '#0f172a',
                        border: '1px solid #38bdf8',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '0.9rem'
                    }}
                />
                <button
                    onClick={handleSearch}
                    disabled={loading || !searchQuery.trim()}
                    style={{
                        padding: '10px 20px',
                        background: '#0284c7',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                >
                    {loading ? '🔍 Consultando...' : '🔍 Buscar no Zap'}
                </button>
            </div>

            {actionMsg && (
                <div style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    marginBottom: '14px',
                    fontSize: '0.88rem',
                    background: actionMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${actionMsg.type === 'success' ? '#10b981' : '#ef4444'}`,
                    color: actionMsg.type === 'success' ? '#34d399' : '#f87171'
                }}>
                    {actionMsg.text}
                </div>
            )}

            {/* Resultados da Busca */}
            {searchResults.length > 0 && (
                <div style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #334155', padding: '12px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#f8fafc', fontSize: '0.95rem' }}>
                        Resultados Encontrados ({searchResults.length}):
                    </h4>
                    {searchResults.map((res, i) => (
                        <div key={i} style={{ padding: '10px', background: '#1e293b', borderRadius: '6px', marginBottom: '8px', border: '1px solid #334155' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.95rem' }}>
                                        {res.waName} {res.isPushName && <span style={{ fontSize: '0.72rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>~ Perfil WA</span>}
                                    </div>
                                    <div style={{ color: '#38bdf8', fontSize: '0.82rem', marginTop: '2px' }}>
                                        📱 WhatsApp: {res.waPhone}
                                    </div>
                                    {res.matchedPub && (
                                        <div style={{ color: '#34d399', fontSize: '0.82rem', marginTop: '2px' }}>
                                            🏛️ Vinculado a: <strong>{res.matchedPub.name}</strong> {res.matchedPub.phone ? `(${res.matchedPub.phone})` : ''}
                                        </div>
                                    )}
                                </div>

                                {/* Ações de Vinculação */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <select
                                        value={selectedPubMap[res.waPhone] || res.matchedPub?.id || ''}
                                        onChange={e => setSelectedPubMap({ ...selectedPubMap, [res.waPhone]: e.target.value })}
                                        style={{
                                            padding: '6px 10px',
                                            background: '#0f172a',
                                            border: '1px solid #6366f1',
                                            borderRadius: '6px',
                                            color: '#a5b4fc',
                                            fontSize: '0.82rem'
                                        }}
                                    >
                                        <option value="" disabled>Selecione Publicador RVM...</option>
                                        {publishers.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} {p.phone ? `(${p.phone})` : '(Sem tel)'}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        onClick={() => handleBindAndSave(res.waPhone, selectedPubMap[res.waPhone] || res.matchedPub?.id || '')}
                                        disabled={loading || !(selectedPubMap[res.waPhone] || res.matchedPub?.id)}
                                        style={{
                                            padding: '6px 14px',
                                            background: '#6366f1',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            fontWeight: 'bold',
                                            fontSize: '0.82rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ⚡ Salvar e Vincular
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
