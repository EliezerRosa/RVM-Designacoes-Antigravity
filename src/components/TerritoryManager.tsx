import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FiEdit2, FiTrash2, FiExternalLink, FiPlus } from 'react-icons/fi';

interface Neighborhood {
    id: string;
    name: string;
}

interface Territory {
    id: string;
    number: string;
    neighborhood_id: string;
    description: string;
    map_url: string;
    last_worked_at: string | null;
    neighborhoods?: { name: string };
}

export default function TerritoryManager() {
    const [isLoading, setIsLoading] = useState(true);
    const [territories, setTerritories] = useState<Territory[]>([]);
    const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
    const [filterNeighborhood, setFilterNeighborhood] = useState('all');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Territory>>({
        number: '',
        neighborhood_id: '',
        description: '',
        map_url: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Fetch neighborhoods
            const { data: nData } = await supabase
                .from('neighborhoods')
                .select('*')
                .order('name');
            if (nData) setNeighborhoods(nData);

            // Fetch territories
            const { data: tData } = await supabase
                .from('territories')
                .select('*, neighborhoods(name)')
                .order('number');
            if (tData) {
                // sort numeric
                const sorted = tData.sort((a, b) => parseInt(a.number) - parseInt(b.number));
                setTerritories(sorted);
            }
        } catch (error) {
            console.error('Error fetching territories:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenModal = (t?: Territory) => {
        if (t) {
            setEditingId(t.id);
            setFormData({
                number: t.number,
                neighborhood_id: t.neighborhood_id,
                description: t.description || '',
                map_url: t.map_url || ''
            });
        } else {
            setEditingId(null);
            setFormData({
                number: '',
                neighborhood_id: neighborhoods.length > 0 ? neighborhoods[0].id : '',
                description: '',
                map_url: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.number || !formData.neighborhood_id) {
            alert("Número e Bairro são obrigatórios.");
            return;
        }

        try {
            if (editingId) {
                await supabase
                    .from('territories')
                    .update({
                        number: formData.number,
                        neighborhood_id: formData.neighborhood_id,
                        description: formData.description,
                        map_url: formData.map_url
                    })
                    .eq('id', editingId);
            } else {
                await supabase
                    .from('territories')
                    .insert([{
                        number: formData.number,
                        neighborhood_id: formData.neighborhood_id,
                        description: formData.description,
                        map_url: formData.map_url
                    }]);
            }
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Error saving territory', error);
            alert('Falha ao salvar território.');
        }
    };

    const handleDelete = async (id: string, numberStr: string) => {
        if (window.confirm(`Tem certeza que deseja excluir o território ${numberStr}?`)) {
            await supabase.from('territories').delete().eq('id', id);
            fetchData();
        }
    };

    const getImageUrl = (numberStr: string) => {
        // Our extracted images are named territory_card_01.png, ..., territory_card_48.png
        const parsed = parseInt(numberStr, 10);
        if (isNaN(parsed)) return '/territories/territory_card_01.png'; // fallback
        const pad = String(parsed).padStart(2, '0');
        return `/territories/territory_card_${pad}.png`;
    };

    const filteredTerritories = filterNeighborhood === 'all'
        ? territories
        : territories.filter(t => t.neighborhood_id === filterNeighborhood);

    return (
        <div className="territory-manager" style={{ padding: '0 20px 20px' }}>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Controle de Territórios</h2>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <select
                        value={filterNeighborhood}
                        onChange={(e) => setFilterNeighborhood(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                        <option value="all">Todos os Bairros</option>
                        {neighborhoods.map(n => (
                            <option key={n.id} value={n.id}>{n.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => handleOpenModal()}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#4F46E5', color: '#fff', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        <FiPlus /> Novo
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="loading-screen" style={{ position: 'relative', height: '200px' }}>
                    <div className="spinner"></div>
                </div>
            ) : (
                <div
                    className="territory-grid"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '20px'
                    }}
                >
                    {filteredTerritories.map(t => (
                        <div key={t.id} style={{
                            background: 'var(--bg-secondary)',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {/* Image Header */}
                            <div style={{
                                height: '160px',
                                background: '#e5e7eb',
                                position: 'relative',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <img
                                    src={getImageUrl(t.number)}
                                    alt={`Mapa Território ${t.number}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => {
                                        // fallback styling if image doesn't exist
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="color: #6b7280"><FiMap size={32} /></span>';
                                    }}
                                />
                                <div style={{
                                    position: 'absolute',
                                    top: '10px',
                                    right: '10px',
                                    background: 'rgba(0,0,0,0.7)',
                                    color: '#fff',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    fontWeight: 'bold',
                                    fontSize: '0.9rem'
                                }}>
                                    Nº {t.number}
                                </div>
                            </div>

                            {/* Content */}
                            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontSize: '0.85rem', color: '#4F46E5', fontWeight: 'bold', marginBottom: '4px' }}>
                                    {t.neighborhoods?.name || 'Sem Bairro'}
                                </div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px', flex: 1 }}>
                                    {t.description && t.description.length > 60 ? t.description.substring(0, 60) + '...' : (t.description || 'Sem descrição')}
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => handleOpenModal(t)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }} title="Editar">
                                            <FiEdit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(t.id, t.number)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }} title="Excluir">
                                            <FiTrash2 size={16} />
                                        </button>
                                    </div>

                                    {t.map_url && (
                                        <a href={t.map_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#4F46E5', textDecoration: 'none', fontWeight: '500' }}>
                                            Google Maps <FiExternalLink />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredTerritories.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                            Nenhum território encontrado para este filtro.
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Edição */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'var(--bg-primary)',
                        padding: '24px',
                        borderRadius: '12px',
                        width: '90%',
                        maxWidth: '500px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.25rem' }}>
                            {editingId ? 'Editar Território' : 'Novo Território'}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Número</label>
                                    <input
                                        type="text"
                                        value={formData.number || ''}
                                        onChange={e => setFormData({ ...formData, number: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                    />
                                </div>
                                <div style={{ flex: 2 }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Bairro</label>
                                    <select
                                        value={formData.neighborhood_id || ''}
                                        onChange={e => setFormData({ ...formData, neighborhood_id: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                    >
                                        <option value="" disabled>Selecione um bairro</option>
                                        {neighborhoods.map(n => (
                                            <option key={n.id} value={n.id}>{n.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Descrição (Limites/Ruas)</label>
                                <textarea
                                    value={formData.description || ''}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', resize: 'vertical' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>URL do Google Maps</label>
                                <input
                                    type="text"
                                    value={formData.map_url || ''}
                                    onChange={e => setFormData({ ...formData, map_url: e.target.value })}
                                    placeholder="https://goo.gl/maps/..."
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                style={{ padding: '8px 16px', background: '#4F46E5', border: 'none', color: '#white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
