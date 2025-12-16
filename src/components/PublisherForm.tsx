import { useState, useEffect } from 'react'
import type { Publisher, PublisherPrivileges, PublisherPrivilegesBySection } from '../types'

interface PublisherFormProps {
    publisher: Publisher | null
    publishers: Publisher[]  // All publishers for parent selection
    onSave: (publisher: Publisher) => void
    onCancel: () => void
}

const defaultPrivileges: PublisherPrivileges = {
    canGiveTalks: false,
    canConductCBS: false,
    canReadCBS: false,
    canPray: false,
    canPreside: false,
}

const defaultPrivilegesBySection: PublisherPrivilegesBySection = {
    canParticipateInTreasures: true,
    canParticipateInMinistry: true,
    canParticipateInLife: true,
}

const emptyPublisher: Publisher = {
    id: '',
    name: '',
    gender: 'brother',
    condition: 'Publicador',
    phone: '',
    isBaptized: false,
    isServing: true,
    ageGroup: 'Adulto',
    parentIds: [],
    isHelperOnly: false,
    canPairWithNonParent: true,
    privileges: { ...defaultPrivileges },
    privilegesBySection: { ...defaultPrivilegesBySection },
    availability: { mode: 'always', exceptionDates: [], availableDates: [] },
    aliases: [],
    isNotQualified: false,
    requestedNoParticipation: false,
}

export default function PublisherForm({ publisher, publishers, onSave, onCancel }: PublisherFormProps) {
    const [formData, setFormData] = useState<Publisher>(publisher || { ...emptyPublisher })
    const [newExceptionDate, setNewExceptionDate] = useState('')
    const [newAvailableDate, setNewAvailableDate] = useState('')
    const [newAlias, setNewAlias] = useState('')

    useEffect(() => {
        if (publisher) {
            setFormData({
                ...emptyPublisher,
                ...publisher,
                privileges: { ...defaultPrivileges, ...publisher.privileges },
                privilegesBySection: { ...defaultPrivilegesBySection, ...publisher.privilegesBySection },
            })
        }
    }, [publisher])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined

        if (name.startsWith('privileges.')) {
            const key = name.split('.')[1] as keyof PublisherPrivileges
            setFormData(prev => ({
                ...prev,
                privileges: {
                    ...prev.privileges,
                    [key]: checked
                }
            }))
        } else if (name.startsWith('section.')) {
            const key = name.split('.')[1] as keyof PublisherPrivilegesBySection
            setFormData(prev => ({
                ...prev,
                privilegesBySection: {
                    ...prev.privilegesBySection,
                    [key]: checked
                }
            }))
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: type === 'checkbox' ? checked : value
            }))
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave(formData)
    }

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h2>{publisher ? 'Editar Publicador' : 'Novo Publicador'}</h2>
                    <button className="modal-close" onClick={onCancel}>&times;</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label>Nome Completo *</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                placeholder="Ex: João Silva"
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Gênero</label>
                                <select name="gender" value={formData.gender} onChange={handleChange}>
                                    <option value="brother">Irmão</option>
                                    <option value="sister">Irmã</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Condição</label>
                                <select name="condition" value={formData.condition} onChange={handleChange}>
                                    <option value="Publicador">Publicador</option>
                                    <option value="Servo Ministerial">Servo Ministerial</option>
                                    <option value="Ancião">Ancião</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Telefone</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    placeholder="(27) 99999-9999"
                                />
                            </div>

                            <div className="form-group">
                                <label>Faixa Etária</label>
                                <select name="ageGroup" value={formData.ageGroup} onChange={handleChange}>
                                    <option value="Adulto">Adulto</option>
                                    <option value="Jovem">Jovem</option>
                                    <option value="Criança">Criança</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <div className="checkbox-group">
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="isBaptized"
                                        checked={formData.isBaptized}
                                        onChange={handleChange}
                                    />
                                    Batizado
                                </label>
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="isServing"
                                        checked={formData.isServing}
                                        onChange={handleChange}
                                    />
                                    Ativo
                                </label>
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="isHelperOnly"
                                        checked={formData.isHelperOnly}
                                        onChange={handleChange}
                                    />
                                    Apenas Ajudante
                                </label>
                            </div>
                        </div>

                        <h4 style={{ marginBottom: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)', color: 'var(--color-warning)' }}>
                            🚫 Status de Participação
                        </h4>
                        <div className="form-group">
                            <div className="checkbox-group">
                                <label className="checkbox-item" style={{ color: formData.isNotQualified ? 'var(--color-warning)' : 'inherit' }}>
                                    <input
                                        type="checkbox"
                                        name="isNotQualified"
                                        checked={formData.isNotQualified || false}
                                        onChange={handleChange}
                                    />
                                    ⚠️ Não Apto / Não Assiste Reunião
                                </label>
                                <label className="checkbox-item" style={{ color: formData.requestedNoParticipation ? 'var(--color-warning)' : 'inherit' }}>
                                    <input
                                        type="checkbox"
                                        name="requestedNoParticipation"
                                        checked={formData.requestedNoParticipation || false}
                                        onChange={handleChange}
                                    />
                                    🙅 Pediu para Não Participar
                                </label>
                            </div>
                        </div>

                        {/* Youth & Parent Settings - only visible for non-adults */}
                        {(formData.ageGroup === 'Jovem' || formData.ageGroup === 'Crianca') && (
                            <>
                                <h4 style={{ marginBottom: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)', color: 'var(--primary-500)' }}>
                                    👨‍👩‍👧 Configurações de Jovem/Criança
                                </h4>
                                <div className="form-group">
                                    <div className="checkbox-group">
                                        <label className="checkbox-item">
                                            <input
                                                type="checkbox"
                                                name="canPairWithNonParent"
                                                checked={formData.canPairWithNonParent}
                                                onChange={handleChange}
                                            />
                                            ✅ Liberado(a) pelos pais para participar com outro par (não apenas com os pais)
                                        </label>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Pais/Responsáveis</label>
                                    <select
                                        multiple
                                        value={formData.parentIds || []}
                                        onChange={(e) => {
                                            const selected = Array.from(e.target.selectedOptions, option => option.value);
                                            setFormData(prev => ({
                                                ...prev,
                                                parentIds: selected
                                            }));
                                        }}
                                        style={{
                                            width: '100%',
                                            minHeight: '120px',
                                            padding: '8px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-color)',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        {publishers
                                            .filter(p => p.ageGroup === 'Adulto' && p.id !== formData.id)
                                            .map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name} ({p.gender === 'brother' ? 'Irmão' : 'Irmã'})
                                                </option>
                                            ))
                                        }
                                    </select>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Ctrl+Click para selecionar múltiplos. Selecione os pais ou responsáveis deste jovem/criança.
                                    </p>
                                </div>
                            </>
                        )}

                        {/* Availability Settings */}
                        <h4 style={{ marginBottom: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)', color: 'var(--info-500)' }}>
                            📅 Disponibilidade
                        </h4>
                        <div className="form-group">
                            <label className="form-label">Datas Indisponíveis</label>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <input
                                    type="date"
                                    value={newExceptionDate}
                                    onChange={(e) => setNewExceptionDate(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: '8px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (newExceptionDate) {
                                            // Check for conflict with available dates
                                            if (formData.availability.availableDates?.includes(newExceptionDate)) {
                                                alert('⚠️ Esta data já está na lista de Disponíveis. Remova-a primeiro.');
                                                return;
                                            }
                                            if (!formData.availability.exceptionDates.includes(newExceptionDate)) {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    availability: {
                                                        ...prev.availability,
                                                        exceptionDates: [...prev.availability.exceptionDates, newExceptionDate].sort()
                                                    }
                                                }));
                                                setNewExceptionDate('');
                                            }
                                        }
                                    }}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: 'var(--primary-500)',
                                        color: 'white',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ➕ Adicionar
                                </button>
                            </div>

                            {formData.availability.exceptionDates.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {formData.availability.exceptionDates.map((date, idx) => (
                                        <span
                                            key={idx}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '4px 10px',
                                                borderRadius: '16px',
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                color: 'var(--danger-500)',
                                                fontSize: '0.85rem',
                                            }}
                                        >
                                            📅 {new Date(date + 'T00:00').toLocaleDateString('pt-BR')}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        availability: {
                                                            ...prev.availability,
                                                            exceptionDates: prev.availability.exceptionDates.filter(d => d !== date)
                                                        }
                                                    }));
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--danger-500)',
                                                    cursor: 'pointer',
                                                    padding: '0 2px',
                                                    fontSize: '1rem',
                                                }}
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Nenhuma data indisponível cadastrada. O publicador está disponível em todas as datas.
                                </p>
                            )}
                        </div>

                        {/* Available Dates (Positive Scale) */}
                        <div className="form-group">
                            <label className="form-label" style={{ color: 'var(--success-500)' }}>✅ Datas Disponíveis (Escala Positiva)</label>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <input
                                    type="date"
                                    value={newAvailableDate}
                                    onChange={(e) => setNewAvailableDate(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: '8px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (newAvailableDate) {
                                            // Check for conflict with unavailable dates
                                            if (formData.availability.exceptionDates.includes(newAvailableDate)) {
                                                alert('⚠️ Esta data já está na lista de Indisponíveis. Remova-a primeiro.');
                                                return;
                                            }
                                            if (!formData.availability.availableDates?.includes(newAvailableDate)) {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    availability: {
                                                        ...prev.availability,
                                                        availableDates: [...(prev.availability.availableDates || []), newAvailableDate].sort()
                                                    }
                                                }));
                                                setNewAvailableDate('');
                                            }
                                        }
                                    }}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: 'var(--success-500)',
                                        color: 'white',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ➕ Adicionar
                                </button>
                            </div>

                            {formData.availability.availableDates && formData.availability.availableDates.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {formData.availability.availableDates.map((date, idx) => (
                                        <span
                                            key={idx}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '4px 10px',
                                                borderRadius: '16px',
                                                background: 'rgba(34, 197, 94, 0.1)',
                                                color: 'var(--success-500)',
                                                fontSize: '0.85rem',
                                            }}
                                        >
                                            ✅ {new Date(date + 'T00:00').toLocaleDateString('pt-BR')}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        availability: {
                                                            ...prev.availability,
                                                            availableDates: (prev.availability.availableDates || []).filter(d => d !== date)
                                                        }
                                                    }));
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--success-500)',
                                                    cursor: 'pointer',
                                                    padding: '0 2px',
                                                    fontSize: '1rem',
                                                }}
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Nenhuma data específica marcada como disponível.
                                </p>
                            )}
                        </div>

                        <h4 style={{ marginBottom: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)' }}>
                            Privilégios
                        </h4>
                        <div className="form-group">
                            <div className="checkbox-group">
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="privileges.canGiveTalks"
                                        checked={formData.privileges.canGiveTalks}
                                        onChange={handleChange}
                                    />
                                    Dar Discursos
                                </label>
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="privileges.canPray"
                                        checked={formData.privileges.canPray}
                                        onChange={handleChange}
                                    />
                                    Fazer Oração
                                </label>
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="privileges.canPreside"
                                        checked={formData.privileges.canPreside}
                                        onChange={handleChange}
                                    />
                                    Presidir
                                </label>
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="privileges.canConductCBS"
                                        checked={formData.privileges.canConductCBS}
                                        onChange={handleChange}
                                    />
                                    Dirigir EBC
                                </label>
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="privileges.canReadCBS"
                                        checked={formData.privileges.canReadCBS}
                                        onChange={handleChange}
                                    />
                                    Ler EBC
                                </label>
                            </div>
                        </div>

                        <h4 style={{ marginBottom: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)' }}>
                            Participação por Seção
                        </h4>
                        <div className="form-group">
                            <div className="checkbox-group">
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="section.canParticipateInTreasures"
                                        checked={formData.privilegesBySection.canParticipateInTreasures}
                                        onChange={handleChange}
                                    />
                                    Tesouros
                                </label>
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="section.canParticipateInMinistry"
                                        checked={formData.privilegesBySection.canParticipateInMinistry}
                                        onChange={handleChange}
                                    />
                                    Ministério
                                </label>
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="section.canParticipateInLife"
                                        checked={formData.privilegesBySection.canParticipateInLife}
                                        onChange={handleChange}
                                    />
                                    Nossa Vida
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Aliases Section */}
                    <div className="form-section">
                        <h4 style={{ marginBottom: '12px', color: '#888' }}>📝 Aliases (Nomes Alternativos)</h4>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                            <input
                                type="text"
                                placeholder="Adicionar nome alternativo..."
                                value={newAlias}
                                onChange={(e) => setNewAlias(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (newAlias.trim() && !formData.aliases.includes(newAlias.trim())) {
                                            setFormData(prev => ({
                                                ...prev,
                                                aliases: [...prev.aliases, newAlias.trim()]
                                            }));
                                            setNewAlias('');
                                        }
                                    }
                                }}
                                style={{ flex: 1 }}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    if (newAlias.trim() && !formData.aliases.includes(newAlias.trim())) {
                                        setFormData(prev => ({
                                            ...prev,
                                            aliases: [...prev.aliases, newAlias.trim()]
                                        }));
                                        setNewAlias('');
                                    }
                                }}
                                className="btn-secondary"
                                style={{ padding: '8px 16px' }}
                            >
                                + Adicionar
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {formData.aliases.length === 0 ? (
                                <span style={{ color: '#666', fontSize: '0.9em' }}>Nenhum alias cadastrado</span>
                            ) : (
                                formData.aliases.map((alias, idx) => (
                                    <span
                                        key={idx}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: '#3b82f633',
                                            color: '#60a5fa',
                                            padding: '4px 10px',
                                            borderRadius: '16px',
                                            fontSize: '0.85em'
                                        }}
                                    >
                                        {alias}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    aliases: prev.aliases.filter((_, i) => i !== idx)
                                                }));
                                            }}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#f87171',
                                                cursor: 'pointer',
                                                padding: '0 2px',
                                                fontSize: '14px'
                                            }}
                                            title="Remover alias"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn-secondary" onClick={onCancel}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary">
                            {publisher ? 'Salvar Alterações' : 'Criar Publicador'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
