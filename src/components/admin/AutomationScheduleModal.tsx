import React from 'react';
import { createPortal } from 'react-dom';

interface AutomationScheduleModalProps {
    onClose: () => void;
}

export const AutomationScheduleModal: React.FC<AutomationScheduleModalProps> = ({ onClose }) => {
    return createPortal(
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h2>🕒 Agenda de Automação</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body" style={{ color: 'var(--text-secondary)' }}>
                    <p style={{ marginBottom: '20px' }}>
                        O sistema possui robôs rodando em segundo plano (via <em>Edge Functions</em> e <em>GitHub Actions</em>) que executam tarefas automaticamente nos horários e condições abaixo.
                    </p>

                    <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ color: 'var(--primary-500)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🤖</span> Robô RVM (Designação e Publicação)
                        </h3>
                        <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem' }}>
                            <strong>Horário de Execução:</strong> Todos os dias, às <strong>08:00 (Horário de Brasília)</strong>.
                        </p>
                        <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <li>
                                <strong>Auto-Designação (D-30):</strong> Quando faltam ~30 dias para a semana importada, a IA preenche automaticamente a semana e avisa os Administradores para revisarem.
                            </li>
                            <li>
                                <strong>Auto-Publicação (D-21):</strong> Quando faltam ~21 dias para a semana, o robô publica as partes aprovadas e envia os cartões (S-89) no WhatsApp dos irmãos.
                            </li>
                        </ul>
                    </div>

                    <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ color: 'var(--color-success)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🔔</span> Lembretes Z-API
                        </h3>
                        <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem' }}>
                            <strong>Horário de Execução:</strong> Todas as <strong>Sextas-feiras e Sábados</strong>, à tarde.
                        </p>
                        <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <li>
                                <strong>Sexta-feira:</strong> Dispara lembretes automáticos no WhatsApp dos publicadores que têm parte na semana seguinte, confirmando o tema e horário.
                            </li>
                            <li>
                                <strong>Sábado:</strong> Envia aos administradores o relatório semanal informando quais publicadores estão com o status "Pausado (Admin)" ativo, para que não sejam esquecidos.
                            </li>
                        </ul>
                    </div>

                    <div style={{ padding: '15px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                        <h3 style={{ color: '#f59e0b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                            <span>⚠️</span> Importante
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>
                            As automações acima são disparadas automaticamente (Hardcoded e via Cron) e dependem de que as chaves da Z-API e o <em>Bot Token</em> estejam devidamente configurados no painel de segurança. Caso queira interromper envios gerais, você deve desativar a "Automação Z-API Background".
                        </p>
                    </div>

                </div>
                <div className="modal-footer" style={{ marginTop: '20px' }}>
                    <button className="btn-secondary" onClick={onClose}>
                        Fechar
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
