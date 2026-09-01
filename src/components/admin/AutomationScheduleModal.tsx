import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';

interface AutomationScheduleModalProps {
    onClose: () => void;
}

interface ScheduleInfo {
    weekId: string;
    weekDateStr: string;
    d30Date: Date | null;
    d21Date: Date | null;
}

export const AutomationScheduleModal: React.FC<AutomationScheduleModalProps> = ({ onClose }) => {
    const [loading, setLoading] = useState(true);
    const [schedules, setSchedules] = useState<ScheduleInfo[]>([]);
    const [nextFriday, setNextFriday] = useState<Date | null>(null);
    const [nextSaturday, setNextSaturday] = useState<Date | null>(null);

    useEffect(() => {
        const fetchSchedules = async () => {
            setLoading(true);
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                // Calcular próximos sexta e sábado
                const getNextDay = (date: Date, dayOfWeek: number) => {
                    const result = new Date(date);
                    let diff = (dayOfWeek + 7 - result.getDay()) % 7;
                    if (diff === 0 && new Date().getHours() >= 18) {
                        // Se já passou das 18h no dia alvo, pula pra próxima semana
                        diff = 7;
                    }
                    result.setDate(result.getDate() + diff);
                    return result;
                };

                setNextFriday(getNextDay(new Date(), 5)); // 5 = Sexta
                setNextSaturday(getNextDay(new Date(), 6)); // 6 = Sábado

                // Buscar partes futuras (próximos 90 dias)
                const futureLimit = new Date(today);
                futureLimit.setDate(futureLimit.getDate() + 90);

                const { data, error } = await supabase
                    .from('workbook_parts')
                    .select('week_id, date')
                    .gte('date', today.toISOString().split('T')[0])
                    .lte('date', futureLimit.toISOString().split('T')[0])
                    .order('date', { ascending: true });

                if (error) throw error;

                // Agrupar por semana
                const weeksMap = new Map<string, string>();
                if (data) {
                    data.forEach(p => {
                        if (!weeksMap.has(p.week_id)) {
                            weeksMap.set(p.week_id, p.date);
                        }
                    });
                }

                const scheds: ScheduleInfo[] = [];
                for (const [weekId, dateStr] of weeksMap.entries()) {
                    // Cuidado com o timezone ao criar a data: usar UTC ou adicionar timezone
                    // As datas no Supabase estão como YYYY-MM-DD
                    const weekDate = new Date(dateStr + 'T12:00:00Z'); 
                    
                    const d30 = new Date(weekDate);
                    d30.setDate(d30.getDate() - 30);
                    
                    const d21 = new Date(weekDate);
                    d21.setDate(d21.getDate() - 21);

                    scheds.push({
                        weekId,
                        weekDateStr: dateStr,
                        d30Date: d30 >= today ? d30 : null,
                        d21Date: d21 >= today ? d21 : null,
                    });
                }

                setSchedules(scheds);
            } catch (err) {
                console.error("Erro ao buscar cronograma:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchSchedules();
    }, []);

    const formatDate = (d: Date | null) => {
        if (!d) return 'Já ocorreu';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return createPortal(
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-header">
                    <h2>🕒 Agenda de Automação (Real-time)</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body" style={{ color: 'var(--text-secondary)' }}>
                    <p style={{ marginBottom: '20px' }}>
                        Baseado nas semanas importadas no banco de dados e nos horários codificados nos robôs, aqui estão as datas exatas das próximas execuções.
                    </p>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '20px' }}>Calculando datas reais...</div>
                    ) : (
                        <>
                            <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <h3 style={{ color: 'var(--primary-500)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>🤖</span> Robô RVM (Gatilhos Diários às 08:00h)
                                </h3>
                                
                                {schedules.length === 0 ? (
                                    <p style={{ fontSize: '0.9rem' }}>Nenhuma semana futura encontrada no banco.</p>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '10px' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                                    <th style={{ padding: '8px 4px' }}>Semana (Reunião)</th>
                                                    <th style={{ padding: '8px 4px' }}>D-30 (Auto-Designação)</th>
                                                    <th style={{ padding: '8px 4px' }}>D-21 (Auto-Publicação)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {schedules.map(s => (
                                                    <tr key={s.weekId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={{ padding: '8px 4px', fontWeight: 'bold' }}>
                                                            {new Date(s.weekDateStr + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                                                        </td>
                                                        <td style={{ padding: '8px 4px', color: s.d30Date ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                            {formatDate(s.d30Date)}
                                                        </td>
                                                        <td style={{ padding: '8px 4px', color: s.d21Date ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                            {formatDate(s.d21Date)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <h3 style={{ color: 'var(--color-success)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>🔔</span> Lembretes Recorrentes (Z-API)
                                </h3>
                                <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <li>
                                        <strong>Próxima Sexta-feira:</strong> {formatDate(nextFriday)}
                                        <br/>
                                        <span style={{ color: 'var(--text-muted)' }}>Dispara lembretes automáticos no WhatsApp dos publicadores (Tema e Horário).</span>
                                    </li>
                                    <li>
                                        <strong>Próximo Sábado:</strong> {formatDate(nextSaturday)}
                                        <br/>
                                        <span style={{ color: 'var(--text-muted)' }}>Envia aos admins o relatório semanal informando quem está "Pausado (Admin)".</span>
                                    </li>
                                </ul>
                            </div>
                        </>
                    )}

                    <div style={{ padding: '15px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                        <h3 style={{ color: '#f59e0b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                            <span>⚠️</span> Importante
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>
                            Os gatilhos ocorrem automaticamente nos dias indicados. Caso queira interromper temporariamente, desative a chave "Automação Z-API Background" no painel.
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
