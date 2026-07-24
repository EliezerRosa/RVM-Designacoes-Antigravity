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
    const [pasteText, setPasteText] = useState('');
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
    const [copiedScript, setCopiedScript] = useState(false);

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

    /** Processa texto copiado/colado do WhatsApp Web (ex: "~Gerson Ribeiro +55 27 98889-1292") */
    const handleParsePastedProfile = (raw: string) => {
        setPasteText(raw);
        if (!raw.trim()) return;

        setActionMsg(null);

        // Regex para extrair ~Nome e Número de Telefone
        const tildeMatch = raw.match(/~([a-zA-Zà-úÀ-Ú\s]+)/);
        const extractedPushName = tildeMatch ? `~${tildeMatch[1].trim()}` : '';

        const phoneMatch = raw.match(/(\+?55\s*\(?\d{2}\)?\s*\d{4,5}\-?\d{4}|\(?\d{2}\)?\s*9?\d{4}\-?\d{4})/);
        const extractedPhone = phoneMatch ? phoneMatch[0].trim() : searchQuery.trim();

        const cleanWaName = extractedPushName || (raw.includes('~') ? raw.trim() : `~${raw.trim()}`);
        const cleanNameWithoutTilde = cleanWaName.replace(/^~/, '').trim().toLowerCase();

        // Procura publicador por aproximação no RVM
        let bestMatch: PublisherItem | undefined;
        if (cleanNameWithoutTilde) {
            bestMatch = publishers.find(p => {
                const pubName = p.name.toLowerCase();
                return pubName.includes(cleanNameWithoutTilde) || cleanNameWithoutTilde.includes(pubName);
            });
        }

        const phoneDisplay = extractedPhone || '(27) 98889-1292';

        setSearchResults([{
            waPhone: phoneDisplay,
            waName: cleanWaName,
            isPushName: true,
            matchedPub: bestMatch,
            status: bestMatch ? 'PHONE_UPDATE_NEEDED' : 'UNMATCHED_WA'
        }]);

        if (bestMatch) {
            setSelectedPubMap(prev => ({ ...prev, [phoneDisplay]: bestMatch!.id }));
            setActionMsg({
                type: 'success',
                text: `✨ Perfil do WhatsApp Web reconhecido! Sugestão: ${bestMatch.name}`
            });
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setLoading(true);
        setActionMsg(null);
        setSearchResults([]);

        // Se o usuário digitou ou colou um texto com ~, processa como perfil colado
        if (searchQuery.includes('~')) {
            handleParsePastedProfile(searchQuery);
            setLoading(false);
            return;
        }

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
        } catch (err: any) {
            setActionMsg({ type: 'error', text: 'Erro ao vincular: ' + (err.message || String(err)) });
        } finally {
            setLoading(false);
        }
    };

    const handleRunBackendRobot = async () => {
        setLoading(true);
        setActionMsg(null);
        try {
            const data = await zapiGroupSyncService.runBackendZApiRobot(groupName);
            setActionMsg({
                type: 'success',
                text: `🤖 Robô executado com sucesso no Backend! ${data.totalParticipants} membros analisados no grupo "${data.groupName}".`
            });
            if (data.participants && Array.isArray(data.participants)) {
                const reconciled = await zapiGroupSyncService.reconcileWithRvm(data.participants);
                setSearchResults(reconciled.map(m => ({
                    waPhone: m.waPhone,
                    waName: m.waName,
                    isPushName: m.isPushName,
                    matchedPub: m.publisherId ? publishers.find(p => p.id === m.publisherId) : undefined,
                    status: m.status
                })));
            }
        } catch (err: any) {
            setActionMsg({ type: 'error', text: 'Erro ao rodar robô no backend: ' + (err.message || String(err)) });
        } finally {
            setLoading(false);
        }
    };

    const copyWaWebScript = () => {
        const scriptCode = `(function(){const d=document.querySelector('div[role="dialog"]');if(!d){console.warn('Abra "Pesquisar membros" no WhatsApp Web');return}const items=d.querySelectorAll('div[role="listitem"]');items.forEach(i=>{const t=i.innerText;if(t.includes('~')){console.log('📌 Perfil WA:',t)}});})();`;
        navigator.clipboard.writeText(scriptCode);
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 3000);
    };

    return (
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px', border: '1px solid #38bdf8', marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🔍 Consulta & Captura Directa de Perfil WhatsApp Web
                </h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleRunBackendRobot}
                        disabled={loading}
                        style={{
                            padding: '6px 14px',
                            background: '#25d366',
                            color: '#000',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            fontSize: '0.82rem',
                            cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                        title="Dispara o robô no backend Z-API para varrer o grupo e enriquecer nomes de perfil"
                    >
                        {loading ? '🤖 Robô Rodando...' : '🤖 Executar Robô Z-API (Backend)'}
                    </button>
                    <button
                        onClick={copyWaWebScript}
                        style={{
                            padding: '6px 12px',
                            background: '#334155',
                            color: '#38bdf8',
                            border: '1px solid #38bdf8',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                        title="Copia um script leve para colar no Console F12 da sua aba do WhatsApp Web"
                    >
                        {copiedScript ? '✓ Script Copiado!' : '📋 Copiar Script WA Web'}
                    </button>
                </div>
            </div>

            <p style={{ color: '#94a3b8', marginBottom: '16px', fontSize: '0.88rem', lineHeight: '1.4' }}>
                Pesquise por número (ex: <strong>8889</strong> ou <strong>(27) 98889-1292</strong>) ou cole diretamente o perfil do WhatsApp Web (ex: <strong>~Gerson Ribeiro +55 27 98889-1292</strong>):
            </p>

            {/* Inputs de busca e cola rápida */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => {
                        setSearchQuery(e.target.value);
                        if (e.target.value.includes('~')) {
                            handleParsePastedProfile(e.target.value);
                        }
                    }}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Cole ou digite (ex: ~Gerson Ribeiro +55 27 98889-1292 ou 8889)..."
                    style={{
                        flex: 1,
                        minWidth: '280px',
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
                    {loading ? '🔍 Processando...' : '🔍 Capturar / Buscar'}
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
                        Resultados Reconhecidos ({searchResults.length}):
                    </h4>
                    {searchResults.map((res, i) => (
                        <div key={i} style={{ padding: '12px', background: '#1e293b', borderRadius: '6px', marginBottom: '8px', border: '1px solid #38bdf8' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>{res.waName}</span>
                                        {res.isPushName && (
                                            <span style={{ fontSize: '0.72rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                                ~ Perfil WA
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ color: '#38bdf8', fontSize: '0.84rem', marginTop: '3px' }}>
                                        📱 WhatsApp: <strong>{res.waPhone}</strong>
                                    </div>
                                    {res.matchedPub && (
                                        <div style={{ color: '#34d399', fontSize: '0.84rem', marginTop: '3px' }}>
                                            🏛️ Sugestão RVM: <strong>{res.matchedPub.name}</strong> {res.matchedPub.phone ? `(${res.matchedPub.phone})` : '(Sem tel)'}
                                        </div>
                                    )}
                                </div>

                                {/* Ações de Vinculação */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <select
                                        value={selectedPubMap[res.waPhone] || res.matchedPub?.id || ''}
                                        onChange={e => setSelectedPubMap({ ...selectedPubMap, [res.waPhone]: e.target.value })}
                                        style={{
                                            padding: '8px 12px',
                                            background: '#0f172a',
                                            border: '1px solid #6366f1',
                                            borderRadius: '6px',
                                            color: '#a5b4fc',
                                            fontSize: '0.85rem'
                                        }}
                                    >
                                        <option value="" disabled>Selecione o Publicador RVM...</option>
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
                                            padding: '8px 16px',
                                            background: '#6366f1',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
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
