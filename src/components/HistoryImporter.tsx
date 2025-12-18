import type { Publisher, Participation } from '../types';

interface Props {
    publishers: Publisher[];
    participations: Participation[];
    onImport: (newPublishers: Publisher[], updatedPublishers: Publisher[], newParticipations: Participation[]) => void;
    onCancel: () => void;
}

export default function HistoryImporter({ publishers, participations }: Props) {
    return (
        <div style={{
            padding: 'var(--spacing-xl)',
            maxWidth: '800px',
            margin: '0 auto'
        }}>
            <h2 style={{ marginBottom: 'var(--spacing-lg)' }}>
                📜 Histórico
            </h2>

            <div className="card" style={{
                padding: 'var(--spacing-xl)',
                textAlign: 'center'
            }}>
                <div style={{
                    fontSize: '4rem',
                    marginBottom: 'var(--spacing-lg)'
                }}>
                    🚧
                </div>

                <h3 style={{ marginBottom: 'var(--spacing-md)' }}>
                    Em Construção
                </h3>

                <p style={{
                    color: 'var(--text-secondary)',
                    marginBottom: 'var(--spacing-lg)'
                }}>
                    Esta funcionalidade está sendo redesenhada.<br />
                    Novas funcionalidades serão adicionadas em breve.
                </p>

                <div style={{
                    display: 'flex',
                    gap: 'var(--spacing-lg)',
                    justifyContent: 'center',
                    marginTop: 'var(--spacing-xl)',
                    padding: 'var(--spacing-lg)',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-400)' }}>
                            {publishers.length}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Publicadores
                        </div>
                    </div>
                    <div style={{
                        width: '1px',
                        background: 'var(--border-color)'
                    }} />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success-400)' }}>
                            {participations.length}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Participações
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
