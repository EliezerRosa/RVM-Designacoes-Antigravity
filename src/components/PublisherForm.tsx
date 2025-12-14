import { useState, useEffect } from 'react'
import type { Publisher, PublisherPrivileges, PublisherPrivilegesBySection } from '../types'

interface PublisherFormProps {
    publisher: Publisher | null
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
    availability: { mode: 'always', exceptionDates: [] },
    aliases: [],
}

export default function PublisherForm({ publisher, onSave, onCancel }: PublisherFormProps) {
    const [formData, setFormData] = useState<Publisher>(publisher || { ...emptyPublisher })

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
