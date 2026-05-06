import { useMemo } from 'react';
import { Tooltip } from '../Tooltip';
import type { PublisherProfileChangeNotification } from '../../hooks/usePublisherProfileNotifications';

interface Props {
    notifications: PublisherProfileChangeNotification[];
    publisherName?: string | null;
    tone?: 'dark' | 'light';
}

const FIELD_LABELS: Record<string, string> = {
    active: 'Ativo/Inativo',
    isDisqualified: 'Nao apto',
    wontParticipate: 'Pediu nao participar',
    requestedNoParticipation: 'Pediu nao participar',
    noParticipationReason: 'Motivo do nao participar',
    gender: 'Genero',
    isBaptized: 'Batismo',
    isHelperOnly: 'So ajudante',
    condition: 'Condicao',
    privileges: 'Privilegios gerais',
    privilegesBySection: 'Privilegios por secao',
    canParticipateInTreasures: 'Participacao em Tesouros',
    canParticipateInMinistry: 'Participacao no Ministerio',
    canParticipateInLife: 'Participacao em Vida Crista',
};

function normalize(value?: string | null): string {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function formatDate(iso?: string | null): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
}

function prettifyChangedField(field: string): string {
    if (FIELD_LABELS[field]) return FIELD_LABELS[field];
    if (field.includes('.')) {
        const parts = field.split('.');
        const leaf = parts[parts.length - 1];
        return FIELD_LABELS[leaf] || leaf;
    }
    return field;
}

export function ProfileChangeTooltipChip({ notifications, publisherName, tone = 'dark' }: Props) {
    const relevant = useMemo(() => {
        if (!notifications || notifications.length === 0) return [];
        if (!publisherName) return notifications;
        const target = normalize(publisherName);
        return notifications.filter(n => normalize(n.publisher_name) === target);
    }, [notifications, publisherName]);

    if (relevant.length === 0) return null;

    const latest = relevant[0];
    const changedFields = (latest.changed_fields || []).map(prettifyChangedField);

    const triggerStyle: React.CSSProperties = tone === 'light'
        ? {
            background: '#FEF3C7',
            color: '#92400E',
            border: '1px solid #FDE68A',
        }
        : {
            background: 'rgba(245, 158, 11, 0.18)',
            color: '#F59E0B',
            border: '1px solid rgba(245, 158, 11, 0.35)',
        };

    return (
        <Tooltip
            content={
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontWeight: 700 }}>Perfil Alterado</div>
                    {latest.publisher_name && (
                        <div>
                            <strong>Publicador:</strong> {latest.publisher_name}
                        </div>
                    )}
                    <div>
                        <strong>Resumo:</strong> {latest.summary}
                    </div>
                    <div>
                        <strong>O que mudou:</strong>
                    </div>
                    {changedFields.length > 0 ? (
                        <div style={{ marginTop: '-2px' }}>
                            {changedFields.slice(0, 8).map((label, idx) => (
                                <div key={`${label}-${idx}`} style={{ fontSize: '12px' }}>
                                    - {label}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ fontSize: '12px' }}>- Alteracoes de perfil registradas.</div>
                    )}
                    <div style={{ fontSize: '12px', color: '#CBD5E1' }}>
                        {latest.author_label} - {formatDate(latest.created_at)}
                    </div>
                </div>
            }
        >
            <span
                title="Perfil alterado: clique para detalhes"
                style={{
                    ...triggerStyle,
                    borderRadius: '999px',
                    height: '20px',
                    padding: '0 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                }}
            >
                Perfil Alterado
            </span>
        </Tooltip>
    );
}
