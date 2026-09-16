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
    d15Date: Date | null;
    d7Date: Date | null;
    d2Date: Date | null;
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

                const { data: settingsData } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 's89_meeting_day_by_week')
                    .maybeSingle();
                const meetingDays = settingsData?.value || {};

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
                    const weekDate = new Date(dateStr + 'T12:00:00Z'); 
                    
                    const d30 = new Date(weekDate);
                    d30.setDate(d30.getDate() - 30);
                    
                    const d21 = new Date(weekDate);
                    d21.setDate(d21.getDate() - 21);

                    const dp = weekId.split('-');
                    const baseDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]), 12, 0, 0);
                    const dow = meetingDays[weekId] ?? 4;
                    const daysToMeeting = (dow - baseDate.getDay() + 7) % 7;
                    const meetingDate = new Date(baseDate);
                    meetingDate.setDate(meetingDate.getDate() + daysToMeeting);

                    const d15 = new Date(meetingDate); d15.setDate(d15.getDate() - 15);
                    const d7 = new Date(meetingDate); d7.setDate(d7.getDate() - 7);
                    const d2 = new Date(meetingDate); d2.setDate(d2.getDate() - 2);

                    scheds.push({
                        weekId,
                        weekDateStr: dateStr,
                        d30Date: d30 >= today ? d30 : null,
                        d21Date: d21 >= today ? d21 : null,
                        d15Date: d15 >= today ? d15 : null,
                        d7Date: d7 >= today ? d7 : null,
                        d2Date: d2 >= today ? d2 : null,
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
                                                    <th style={{ padding: '8px 4px', borderLeft: '1px solid var(--border-color)' }}>D-15 (Sentinela)</th>
                                                    <th style={{ padding: '8px 4px' }}>D-7 (Lembrete Proximidade)</th>
                                                    <th style={{ padding: '8px 4px' }}>D-2 (Lembrete Proximidade)</th>
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
                                                        <td style={{ padding: '8px 4px', borderLeft: '1px solid var(--border-color)', color: s.d15Date ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                                                            {formatDate(s.d15Date)}
                                                        </td>
                                                        <td style={{ padding: '8px 4px', color: s.d7Date ? 'var(--color-success)' : 'var(--text-muted)' }}>
                                                            {formatDate(s.d7Date)}
                                                        </td>
                                                        <td style={{ padding: '8px 4px', color: s.d2Date ? 'var(--color-success)' : 'var(--text-muted)' }}>
                                                            {formatDate(s.d2Date)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <h3 style={{ color: 'var(--color-warning)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>⏳</span> Ciclo de Cobrança Contínua (72h)
                                </h3>
                                <p style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-secondary)' }}>
                                    Qualquer parte enviada que permaneça pendente de confirmação (status <strong>PROPOSTA</strong>) receberá uma cobrança automática a cada 72 horas, repetidamente, até que o publicador responda ou seja substituído pelo SRVM. Anciãos e Servos Ministeriais gozam de aquiescência tácita e são isentos desta cobrança.
                                </p>
                            </div>

                            <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <h3 style={{ color: 'var(--color-success)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>🔔</span> Relatórios Mensais e Semanais (Z-API)
                                </h3>
                                <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <li>
                                        <strong>Dia 1º do Mês:</strong>
                                        <br/>
                                        <span style={{ color: 'var(--text-muted)' }}>Relatório para a Comissão de Serviço informando irmãos com restrições / pedido de pausa. Além de Re-Convite (Magic Link) individual.</span>
                                    </li>
                                    <li>
                                        <strong>Todo Sábado:</strong> {formatDate(nextSaturday)}
                                        <br/>
                                        <span style={{ color: 'var(--text-muted)' }}>Envia aos admins o relatório semanal informando quem está com a flag "Pausado (Admin)".</span>
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
                            A chave "Automação Z-API Background" no painel desliga <strong>apenas os Crons de Lembretes e Cobranças de 72h</strong>. O robô Headless de Auto-Designação (D-30) e Auto-Publicação (D-21) roda independentemente na nuvem via GitHub Actions.
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
