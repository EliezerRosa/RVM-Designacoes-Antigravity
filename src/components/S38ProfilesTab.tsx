import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { curatorKnowledgeBaseService, type CuratorProfile } from '../services/curatorKnowledgeBaseService';
import { publisherMutationService } from '../services/publisherMutationService';
import type { Publisher } from '../types';

interface Props {
    publishers: Publisher[];
    onPublishersChange: () => void;
}

export const S38ProfilesTab: React.FC<Props> = ({ publishers, onPublishersChange }) => {
    const [profiles, setProfiles] = useState<CuratorProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [editingProfile, setEditingProfile] = useState<CuratorProfile | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // OpenRouter Models State (Curated List)
    const availableModels = [
        { id: 'anthropic/claude-sonnet-5.5', name: 'Claude 5.5 Sonnet (Rápido & Estável)' },
        { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5 (Raciocínio Profundo)' },
        { id: 'openai/gpt-6-astra', name: 'GPT-6 Astra (OpenAI)' },
        { id: 'openai/gpt-6.1-sol-pro', name: 'GPT-6.1 Sol Pro (OpenAI)' },
        { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash (Google)' },
        { id: 'meta/muse-spark-1.3', name: 'Muse Spark 1.3 (Meta)' },
        { id: 'x-ai/grok-4.7', name: 'Grok 4.7 (xAI)' }
    ];
    const [selectedModel, setSelectedModel] = useState<string>('anthropic/claude-sonnet-5.5');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Force refresh from backend
            const data = await curatorKnowledgeBaseService.fetchCuratorProfiles(true);
            // Show all profiles, prioritize S-38
            setProfiles(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveProfile = async (profile: CuratorProfile) => {
        setIsSaving(true);
        try {
            await curatorKnowledgeBaseService.upsertCuratorProfile(profile);
            await loadData();
            setEditingProfile(null);
        } catch (err: any) {
            alert(`Erro ao salvar perfil: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAssociatePublisher = async (profileId: string, publisherId: string) => {
        const pub = publishers.find(p => p.id === publisherId);
        if (!pub) return;

        const currentProfiles = pub.syntheticProfiles || [];
        if (currentProfiles.includes(profileId)) {
            // Remove
            const newProfiles = currentProfiles.filter((p: any) => p !== profileId);
            await publisherMutationService.savePublisherWithPropagation({ ...pub, syntheticProfiles: newProfiles } as any);
        } else {
            // Add
            const newProfiles = [...currentProfiles, profileId];
            await publisherMutationService.savePublisherWithPropagation({ ...pub, syntheticProfiles: newProfiles } as any);
        }
        onPublishersChange(); // Trigger refresh on App level
    };

    if (loading && profiles.length === 0) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Carregando perfis da Base de Conhecimento...</div>;
    }

    const rascunhos = profiles.filter(p => p.status === 'Rascunho IA');
    const aprovados = profiles.filter(p => p.status === 'Aprovada');
    const integrados = profiles.filter(p => p.status === 'Integrada ao Curador' || !p.status); // Perfis antigos não têm status

    const renderProfileCard = (profile: CuratorProfile) => {
        const isEditing = editingProfile?.id === profile.id;
        const currentEdit = isEditing ? editingProfile : profile;

        // Find which publishers have this profile
        const associatedPubs = publishers.filter(p => p.syntheticProfiles?.includes(profile.id));

        return (
            <div key={profile.id} style={{
                background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '12px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)', position: 'relative'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', color: '#111827' }}>
                                {isEditing ? (
                                    <input value={currentEdit.nome} onChange={e => setEditingProfile({ ...currentEdit, nome: e.target.value })} style={{ fontSize: '16px', padding: '4px' }} />
                                ) : profile.nome}
                            </h3>
                            {profile.source === 'S-38' && <span style={{ fontSize: '10px', background: '#e0e7ff', color: '#4338ca', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>S-38 Oficial</span>}
                            {profile.source === 'manual' && <span style={{ fontSize: '10px', background: '#f3f4f6', color: '#4b5563', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Manual</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>ID: {profile.id}</div>
                    </div>
                    <div>
                        {!isEditing ? (
                            <button onClick={() => setEditingProfile(profile)} style={{ padding: '6px 12px', fontSize: '12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}>Editar</button>
                        ) : (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setEditingProfile(null)} style={{ padding: '6px 12px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button onClick={() => handleSaveProfile(currentEdit)} disabled={isSaving} style={{ padding: '6px 12px', fontSize: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>{isSaving ? 'Salvando...' : 'Salvar'}</button>
                            </div>
                        )}
                    </div>
                </div>

                {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}>Descrição</label>
                            <textarea
                                value={currentEdit.descricao}
                                onChange={e => setEditingProfile({ ...currentEdit, descricao: e.target.value })}
                                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', minHeight: '60px', fontFamily: 'inherit' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}>Status do Ciclo de Vida</label>
                            <select
                                value={currentEdit.status || 'Integrada ao Curador'}
                                onChange={e => setEditingProfile({ ...currentEdit, status: e.target.value as any })}
                                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px' }}
                            >
                                <option value="Rascunho IA">Rascunho IA (Pendente de Revisão)</option>
                                <option value="Aprovada">Aprovada (Pronta para Associação)</option>
                                <option value="Integrada ao Curador">Integrada ao Curador (Ativa no Motor)</option>
                            </select>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p style={{ fontSize: '13px', color: '#4b5563', margin: '0 0 16px 0', lineHeight: '1.5' }}>{profile.descricao}</p>
                    </div>
                )}

                {/* Área de Associação de Publicadores */}
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #e5e7eb' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Associação de Publicadores ({associatedPubs.length})
                    </h4>
                    
                    {/* Se estiver editando ou não, mostramos os associados */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                        {associatedPubs.map(pub => (
                            <span key={pub.id} style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {pub.name}
                                <button onClick={() => handleAssociatePublisher(profile.id, pub.id)} style={{ background: 'transparent', border: 'none', color: '#166534', cursor: 'pointer', padding: 0, fontSize: '14px', lineHeight: 1 }}>&times;</button>
                            </span>
                        ))}
                        {associatedPubs.length === 0 && <span style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>Nenhum publicador associado ainda.</span>}
                    </div>

                    {/* Dropdown para associar novos (mostra apenas publicadores ATIVOS que não estão associados) */}
                    <select
                        value=""
                        onChange={e => {
                            if (e.target.value) handleAssociatePublisher(profile.id, e.target.value);
                        }}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#f9fafb' }}
                    >
                        <option value="">+ Associar Publicador (Ativo)...</option>
                        {publishers
                            .filter((p: any) => p.isServing === true && !p.syntheticProfiles?.includes(profile.id))
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(pub => {
                                const restricoes = pub.condition ? ` [${pub.condition}]` : '';
                                return (
                                    <option key={pub.id} value={pub.id}>
                                        {pub.name} {restricoes}
                                    </option>
                                );
                            })
                        }
                    </select>
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📖</span> Diretrizes S-38 & Curadoria
                    </h1>
                    <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
                        Gerencie os perfis sintéticos extraídos oficialmente do JW.org pela IA e associe irmãos.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <select 
                        value={selectedModel} 
                        onChange={e => setSelectedModel(e.target.value)}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', maxWidth: '200px' }}
                        title="Motor de IA a ser utilizado na sincronização"
                    >
                        {availableModels.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>

                    <button 
                        onClick={async () => {
                            if (window.confirm(`Isso disparará o motor de extração na nuvem usando o modelo [${selectedModel}]. Deseja continuar?`)) {
                                try {
                                    // Invoca edge function para disparar a action de forma segura
                                    const { error: triggerErr } = await supabase.functions.invoke('trigger-github-workflow', { 
                                        body: { 
                                            action: 'trigger',
                                            workflow_id: 's38-sync.yml',
                                            inputs: { model: selectedModel } 
                                        } 
                                    });
                                    if (triggerErr) throw triggerErr;
                                    alert('Sincronização acionada! O bot está lendo o WOL. Você receberá um aviso no WhatsApp em 1 ou 2 minutos.');
                                } catch(e: any) {
                                    alert(`Falha ao acionar robô: ${e.message}`);
                                }
                            }
                        }} 
                        style={{ padding: '8px 16px', fontSize: '13px', background: '#312e81', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                        <span>🚀</span> Sincronizar Manualmente (S-38)
                    </button>
                    
                    <button onClick={loadData} style={{ padding: '8px 16px', fontSize: '13px', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color: '#374151' }}>
                        <span>🔄</span> Atualizar Visualização
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px', borderRadius: '6px', marginBottom: '24px', fontSize: '14px' }}>
                    <strong>Erro de Conexão:</strong> {error}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                {/* Coluna 1: Rascunhos IA */}
                <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#b45309', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>⚠️</span> Rascunho IA ({rascunhos.length})
                    </h2>
                    {rascunhos.map(renderProfileCard)}
                    {rascunhos.length === 0 && <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>Nenhum rascunho pendente da IA.</div>}
                </div>

                {/* Coluna 2: Aprovados */}
                <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#047857', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>✅</span> Aprovadas ({aprovados.length})
                    </h2>
                    {aprovados.map(renderProfileCard)}
                    {aprovados.length === 0 && <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>Nenhuma regra apenas aprovada.</div>}
                </div>

                {/* Coluna 3: Integradas */}
                <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#4338ca', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🧠</span> Integradas ao Curador ({integrados.length})
                    </h2>
                    {integrados.map(renderProfileCard)}
                </div>
            </div>
        </div>
    );
};
