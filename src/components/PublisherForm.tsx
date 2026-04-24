import { useState, useEffect } from 'react'
import type { Funcao, Publisher, PublisherPrivileges, PublisherPrivilegesBySection } from '../types'
import { getWeekMondayId } from '../services/eligibilityService'

interface PublisherFormProps {
    publisher: Publisher | null
    publishers: Publisher[]  // All publishers for parent selection
    onSave: (publisher: Publisher) => void
    onCancel: () => void
}

const defaultPrivileges: PublisherPrivileges = {
    canGiveTalks: false,
    canGiveStudentTalks: true,  // Padrão: true para maioria dos publicadores
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
    funcao: null,
    phone: '',
    email: '',
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

        // Lógica específica para mudança de Gênero
        if (name === 'gender' && value === 'sister') {
            setFormData(prev => ({
                ...prev,
                gender: 'sister',
                // Desativar seções restritas a irmãos
                privilegesBySection: {
                    canParticipateInTreasures: false,
                    canParticipateInMinistry: true, // Ativar Ministério (Demonstrações)
                    canParticipateInLife: false,
                },
                // Desativar privilégios restritos a irmãos
                privileges: {
                    ...prev.privileges,
                    canGiveTalks: false,
                    canPray: false,
                    canPreside: false,
                    canConductCBS: false,
                    canReadCBS: false,
                    // Manter canGiveStudentTalks como estava (ou false? Geralmente irmãs não fazem discurso de estudante, fazem demonstração. O privilege chama-se "Dar Discurso de Estudante". Se for irmã, é melhor false? O user não pediu explicitamente, mas coerência sugere false).
                    // Mas Demonstração é "Parte de Estudante".
                    // O privilégio 'canGiveStudentTalks' controla "Discurso de Estudante" (nº 3 ou 4 da escola). Irmãs fazem nº 2 (Demonstração).
                    // Vamos manter o que estava ou setar false para evitar confusão.
                    // O código original diz: "Rule 16: Discurso de Estudante: Só irmãos".
                    canGiveStudentTalks: false,
                }
            }))
            return
        }

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

        // Validation: Logic Coherence for Teaching Talks
        if (formData.privileges.canGiveTalks) {
            const blockedInTreasures = !formData.privilegesBySection.canParticipateInTreasures;
            const blockedInLife = !formData.privilegesBySection.canParticipateInLife;

            if (blockedInTreasures && blockedInLife) {
                alert('⚠️ Incoerência Detectada:\n\nPara ter o privilégio "Dar Discurso de Ensino", o publicador deve poder participar em pelo menos uma das seções onde discursos ocorrem ("Tesouros" ou "Nossa Vida").\n\nPor favor, habilite a participação em uma dessas seções ou remova o privilégio de ensino.');
                return;
            }
        }

        // Validation: Student Talks require Ministry Section
        if (formData.privileges.canGiveStudentTalks) {
            if (!formData.privilegesBySection.canParticipateInMinistry) {
                alert('⚠️ Atenção:\n\nO privilégio "Dar Discurso de Estudante" está ativo, mas a seção "Ministério" (onde ocorrem estas partes) está desativada.\n\nPor favor, ative a seção "Ministério" para este publicador ou remova o privilégio.');
                return;
            }
        }

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

                        {(formData.condition === 'Ancião' || formData.condition === 'Anciao' || formData.condition === 'Servo Ministerial') && (
                        <div className="form-row">
                            <div className="form-group">
                                <label>Função</label>
                                <select
                                    name="funcao"
                                    value={formData.funcao || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, funcao: (e.target.value || null) as Funcao }))}
                                >
                                    <option value="">Sem função específica</option>
                                    {(formData.condition === 'Ancião' || formData.condition === 'Anciao') && (
                                        <>
                                            <option value="Coordenador do Corpo de Anciãos">Coordenador do Corpo de Anciãos</option>
                                            <option value="Secretário">Secretário</option>
                                            <option value="Superintendente de Serviço">Superintendente de Serviço</option>
                                            <option value="Superintendente da Reunião Vida e Ministério">Superintendente da Reunião Vida e Ministério</option>
                                            <option value="Ajudante do Superintendente da Reunião Vida e Ministério">Ajudante do Sup. da Reunião VM</option>
                                        </>
                                    )}
                                    {formData.condition === 'Servo Ministerial' && (
                                        <option value="Ajudante do Superintendente da Reunião Vida e Ministério">Ajudante do Sup. da Reunião VM</option>
                                    )}
                                </select>
                            </div>
                        </div>
                        )}

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
                                <label>E-mail (Google)</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email || ''}
                                    onChange={handleChange}
                                    placeholder="exemplo@gmail.com"
                                    title="E-mail usado pelo publicador para login Google. Vincula o usuário ao registro nos portais (confirmação, disponibilidade)."
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
                                    ⚠️ Não Apto para Participar
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

                                    {/* Phase 3.4: Display current parents above dropdown */}
                                    {formData.parentIds && formData.parentIds.length > 0 && (
                                        <div style={{
                                            marginBottom: '8px',
                                            padding: '8px 12px',
                                            background: 'rgba(34, 197, 94, 0.1)',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            color: 'var(--success-500)'
                                        }}>
                                            <strong>✓ Selecionados:</strong>{' '}
                                            {formData.parentIds.map(id => {
                                                const parent = publishers.find(p => p.id === id);
                                                return parent?.name || id;
                                            }).join(', ')}
                                        </div>
                                    )}

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
                                        {/* Phase 3.7: Sort parents alphabetically */}
                                        {publishers
                                            .filter(p => p.ageGroup === 'Adulto' && p.id !== formData.id)
                                            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
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
                                            const weekId = getWeekMondayId(newExceptionDate);
                                            // Check for conflict with available dates
                                            if (formData.availability.availableDates?.some(d => getWeekMondayId(d) === weekId)) {
                                                alert('⚠️ Esta semana já está na lista de Disponíveis. Remova-a primeiro.');
                                                return;
                                            }
                                            if (!formData.availability.exceptionDates.some(d => getWeekMondayId(d) === weekId)) {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    availability: {
                                                        ...prev.availability,
                                                        exceptionDates: [...prev.availability.exceptionDates, weekId].sort()
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
                                            📅 Sem. {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
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
                                            const weekId = getWeekMondayId(newAvailableDate);
                                            if (formData.availability.exceptionDates.some(d => getWeekMondayId(d) === weekId)) {
                                                alert('⚠️ Esta semana já está na lista de Indisponíveis. Remova-a primeiro.');
                                                return;
                                            }
                                            if (!formData.availability.availableDates?.some(d => getWeekMondayId(d) === weekId)) {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    availability: {
                                                        ...prev.availability,
                                                        availableDates: [...(prev.availability.availableDates || []), weekId].sort()
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
                                    Dar Discurso de Ensino (Anciãos/SMs)
                                </label>
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        name="privileges.canGiveStudentTalks"
                                        checked={formData.privileges.canGiveStudentTalks}
                                        onChange={handleChange}
                                    />
                                    Dar Discurso de Estudante
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
                                <label className="checkbox-item" style={{ opacity: formData.gender === 'sister' ? 0.5 : 1 }}>
                                    <input
                                        type="checkbox"
                                        name="section.canParticipateInTreasures"
                                        checked={formData.privilegesBySection.canParticipateInTreasures}
                                        onChange={handleChange}
                                        disabled={formData.gender === 'sister'}
                                        title={formData.gender === 'sister' ? "Restrito a irmãos" : ""}
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
                                <label className="checkbox-item" style={{ opacity: formData.gender === 'sister' ? 0.5 : 1 }}>
                                    <input
                                        type="checkbox"
                                        name="section.canParticipateInLife"
                                        checked={formData.privilegesBySection.canParticipateInLife}
                                        onChange={handleChange}
                                        disabled={formData.gender === 'sister'}
                                        title={formData.gender === 'sister' ? "Restrito a irmãos" : ""}
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
