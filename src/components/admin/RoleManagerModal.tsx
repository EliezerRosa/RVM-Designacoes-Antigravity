import React, { useState, useEffect } from 'react';
import { congregationRoleService, type CongregationRole } from '../../services/congregationRoleService';

interface RoleManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRolesChanged?: () => void;
}

export const RoleManagerModal: React.FC<RoleManagerModalProps> = ({ isOpen, onClose, onRolesChanged }) => {
    const [roles, setRoles] = useState<CongregationRole[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Form para nova função / edição
    const [editingRole, setEditingRole] = useState<CongregationRole | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [allowedConditions, setAllowedConditions] = useState<('Ancião' | 'Servo Ministerial' | 'Publicador')[]>(['Ancião']);

    const loadRoles = async () => {
        setIsLoading(true);
        setErrorMsg(null);
        try {
            const list = await congregationRoleService.listRoles();
            setRoles(list);
        } catch (err: any) {
            setErrorMsg(err.message || 'Falha ao carregar funções.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadRoles();
            resetForm();
        }
    }, [isOpen]);

    const resetForm = () => {
        setEditingRole(null);
        setName('');
        setDescription('');
        setAllowedConditions(['Ancião']);
        setErrorMsg(null);
        setSuccessMsg(null);
    };

    const handleConditionToggle = (cond: 'Ancião' | 'Servo Ministerial' | 'Publicador') => {
        setAllowedConditions(prev => {
            if (prev.includes(cond)) {
                if (prev.length === 1) return prev; // Mantém pelo menos uma
                return prev.filter(c => c !== cond);
            } else {
                return [...prev, cond];
            }
        });
    };

    const handleEditClick = (role: CongregationRole) => {
        setEditingRole(role);
        setName(role.name);
        setDescription(role.description || '');
        setAllowedConditions([...role.allowedConditions]);
        setErrorMsg(null);
        setSuccessMsg(null);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setSuccessMsg(null);

        if (!name.trim()) {
            setErrorMsg('Informe o nome da função.');
            return;
        }

        try {
            if (editingRole) {
                await congregationRoleService.updateRole(editingRole.id, {
                    name,
                    description,
                    allowedConditions,
                });
                setSuccessMsg(`Função "${name}" atualizada com sucesso!`);
            } else {
                await congregationRoleService.createRole({
                    name,
                    description,
                    allowedConditions,
                });
                setSuccessMsg(`Nova função "${name}" criada com sucesso!`);
            }
            await loadRoles();
            resetForm();
            onRolesChanged?.();
        } catch (err: any) {
            setErrorMsg(err.message || 'Erro ao salvar função.');
        }
    };

    const handleDelete = async (role: CongregationRole) => {
        if (role.isSystemDefault) {
            alert('Funções padrão do sistema não podem ser excluídas.');
            return;
        }

        if (!window.confirm(`Deseja realmente excluir a função "${role.name}"?`)) {
            return;
        }

        try {
            await congregationRoleService.deleteRole(role.id);
            setSuccessMsg(`Função "${role.name}" excluída.`);
            await loadRoles();
            onRolesChanged?.();
        } catch (err: any) {
            setErrorMsg(err.message || 'Erro ao excluir função.');
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
        }}>
            <div style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '720px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                color: '#f8fafc',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.25rem' }}>⚙️</span>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                            Gerenciar Funções Congregacionais
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '1.2rem',
                            cursor: 'pointer',
                            padding: '4px 8px',
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {errorMsg && (
                        <div style={{
                            padding: '10px 14px',
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid #ef4444',
                            borderRadius: '6px',
                            color: '#fca5a5',
                            fontSize: '0.9rem',
                        }}>
                            {errorMsg}
                        </div>
                    )}

                    {successMsg && (
                        <div style={{
                            padding: '10px 14px',
                            backgroundColor: 'rgba(34, 197, 94, 0.15)',
                            border: '1px solid #22c55e',
                            borderRadius: '6px',
                            color: '#86efac',
                            fontSize: '0.9rem',
                        }}>
                            {successMsg}
                        </div>
                    )}

                    {/* Form de Criação / Edição */}
                    <form onSubmit={handleSave} style={{
                        backgroundColor: '#1e293b',
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px solid #334155',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                    }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#38bdf8' }}>
                            {editingRole ? `✏️ Editar Função: ${editingRole.name}` : '➕ Adicionar Nova Função'}
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                                Nome da Função *
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Ex: Responsável pelo Som, Indicador Chefe..."
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    backgroundColor: '#0f172a',
                                    border: '1px solid #475569',
                                    borderRadius: '6px',
                                    color: '#f8fafc',
                                    fontSize: '0.9rem',
                                    boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                                Descrição / Atribuições
                            </label>
                            <input
                                type="text"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Breve resumo da responsabilidade desta função..."
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    backgroundColor: '#0f172a',
                                    border: '1px solid #475569',
                                    borderRadius: '6px',
                                    color: '#f8fafc',
                                    fontSize: '0.9rem',
                                    boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
                                Condições Permitidas para esta Função:
                            </label>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                {(['Ancião', 'Servo Ministerial', 'Publicador'] as const).map(cond => (
                                    <label key={cond} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={allowedConditions.includes(cond)}
                                            onChange={() => handleConditionToggle(cond)}
                                        />
                                        <span>{cond}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                            {editingRole && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#334155',
                                        border: 'none',
                                        borderRadius: '6px',
                                        color: '#cbd5e1',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                    }}
                                >
                                    Cancelar Edição
                                </button>
                            )}
                            <button
                                type="submit"
                                style={{
                                    padding: '6px 14px',
                                    backgroundColor: '#0284c7',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: '#ffffff',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                }}
                            >
                                {editingRole ? 'Salvar Alterações' : 'Criar Função'}
                            </button>
                        </div>
                    </form>

                    {/* Lista de Funções */}
                    <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#94a3b8', marginBottom: '10px' }}>
                            Funções Cadastradas ({roles.length})
                        </div>

                        {isLoading ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Carregando funções...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {roles.map(role => (
                                    <div
                                        key={role.id}
                                        style={{
                                            padding: '12px 14px',
                                            backgroundColor: '#1e293b',
                                            border: '1px solid #334155',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{role.name}</span>
                                                {role.isSystemDefault ? (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                                        color: '#38bdf8',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                                    }}>
                                                        Sistema
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        backgroundColor: 'rgba(168, 85, 247, 0.15)',
                                                        color: '#c084fc',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        border: '1px solid rgba(168, 85, 247, 0.3)',
                                                    }}>
                                                        Personalizada
                                                    </span>
                                                )}
                                            </div>

                                            {role.description && (
                                                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                                    {role.description}
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                                {role.allowedConditions.map(c => (
                                                    <span
                                                        key={c}
                                                        style={{
                                                            fontSize: '0.72rem',
                                                            backgroundColor: '#0f172a',
                                                            color: '#cbd5e1',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            border: '1px solid #475569',
                                                        }}
                                                    >
                                                        {c}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleEditClick(role)}
                                                style={{
                                                    padding: '4px 8px',
                                                    backgroundColor: '#334155',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    color: '#cbd5e1',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                }}
                                                title="Editar função"
                                            >
                                                ✏️
                                            </button>
                                            {!role.isSystemDefault && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(role)}
                                                    style={{
                                                        padding: '4px 8px',
                                                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                                        borderRadius: '4px',
                                                        color: '#fca5a5',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem',
                                                    }}
                                                    title="Excluir função"
                                                >
                                                    🗑️
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 20px',
                    borderTop: '1px solid #1e293b',
                    display: 'flex',
                    justifyContent: 'flex-end',
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#334155',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#f8fafc',
                            fontWeight: 500,
                            cursor: 'pointer',
                        }}
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};
