import { communicationService, type NotificationRecord, type ActivityLogEntry } from '../services/communicationService';
import html2canvas from 'html2canvas';
import { prepareS140UnifiedData, renderS140ToElement } from '../services/s140GeneratorUnified';
import { copyS89ToClipboard } from '../services/s89Generator';
import { supabase } from '../lib/supabase';

export function CommunicationTab() {
    const [history, setHistory] = useState<NotificationRecord[]>([]);
    const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [showActivity, setShowActivity] = useState(true);

    useEffect(() => {
        loadHistory();
        loadActivity();

        // Escutar mudanças em tempo real para o Hub
        const hubChannel = supabase
            .channel('hub-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
                loadHistory();
            })
            .subscribe();

        // Escutar mudanças no Log de Atividades
        const activityChannel = supabase
            .channel('activity-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
                loadActivity();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(hubChannel);
            supabase.removeChannel(activityChannel);
        };
    }, []);

    const loadActivity = async () => {
        const data = await communicationService.getActivityLog();
        setActivityLog(data);
    };

    const loadHistory = async () => {
        try {
            const data = await communicationService.getHistory();
            setHistory(data);
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleContentChange = async (id: string, newContent: string) => {
        // Atualizar localmente para feedback instantâneo
        setHistory(prev => prev.map(item => item.id === id ? { ...item, content: newContent } : item));

        // Debounce ou salvar ao sair seria melhor, mas para simplificar salvamos aqui
        try {
            await communicationService.updateNotification(id, { content: newContent });
        } catch (error) {
            console.error('Erro ao salvar edição:', error);
        }
    };

    const handleSend = async (item: NotificationRecord) => {
        setProcessingId(item.id || null);
        try {
            // 1. Se for S140, capturar imagem
            if (item.type === 'S140' && item.metadata?.weekId) {
                await captureAndCopyS140(item.metadata.weekId);
            }

            // 1.1 Se for S89 de estudante, capturar imagem (User Request 2.1)
            if (item.type === 'S89' && item.metadata?.isStudent && item.metadata?.partId) {
                await captureAndCopyS89(item.metadata.partId);
            }

            // 2. Atualizar status no banco
            if (item.id) {
                await communicationService.updateNotification(item.id, {
                    status: 'SENT',
                    action_url: item.action_url // Garantir que a URL original (ou atualizada) seja mantida
                });
            }

            // 3. Abrir WhatsApp (A URL já contém o texto e possivelmente o telefone)
            // Se o conteúdo foi editado, precisamos injetar o novo conteúdo na URL
            const finalUrl = communicationService.generateWhatsAppUrl(
                item.recipient_phone || '',
                item.content
            );

            window.open(finalUrl, '_blank');

        } catch (error) {
            console.error('Erro ao processar envio:', error);
            alert('Erro ao preparar envio. Verifique o console.');
        } finally {
            setProcessingId(null);
        }
    };

    const captureAndCopyS140 = async (weekId: string) => {
        // Lógica portada do TemporalChat
        try {
            // Buscar as partes da semana (precisamos delas para renderizar)
            // Nota: O banco usa week_id (snake_case)
            const { data: rawParts } = await supabase
                .from('workbook_parts')
                .select('*')
                .eq('week_id', weekId);

            if (!rawParts || rawParts.length === 0) throw new Error('Week parts not found');

            // Mapear de snake_case (DB) para camelCase (Frontend types)
            const parts = rawParts.map(p => ({
                id: p.id,
                batchId: p.batch_id,
                seq: p.seq,
                weekId: p.week_id,
                weekDisplay: p.week_display,
                date: p.date,
                section: p.section,
                tipoParte: p.tipo_parte,
                partTitle: p.part_title,
                descricao: p.descricao,
                detalhesParte: p.detalhes_parte,
                funcao: p.funcao,
                duracao: p.duracao,
                horaInicio: p.hora_inicio,
                horaFim: p.hora_fim,
                status: p.status,
                rawPublisherName: p.raw_publisher_name,
                resolvedPublisherName: p.resolved_publisher_name,
                resolvedPublisherId: p.resolved_publisher_id
            }));

            const weekData = await prepareS140UnifiedData(parts as any);
            const element = renderS140ToElement(weekData);

            element.style.position = 'absolute';
            element.style.left = '-9999px';
            element.style.top = '0';
            document.body.appendChild(element);

            const canvas = await html2canvas(element.querySelector('.container') as HTMLElement, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            document.body.removeChild(element);

            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
            if (blob) {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                console.log('S-140 capturado e copiado para o clipboard');
            }
        } catch (err) {
            console.error('Falha na captura automática:', err);
            // Non-blocking error, user can still send text
        }
    };

    const captureAndCopyS89 = async (partId: string) => {
        try {
            // Buscar dados da parte para garantir que temos o objeto WorkbookPart completo
            const { data: part } = await supabase
                .from('workbook_parts')
                .select('*')
                .eq('id', partId)
                .single();

            if (!part) throw new Error('Part not found');

            // Mapear de snake_case para camelCase (exigido pelo copyS89ToClipboard)
            const mappedPart = {
                id: part.id,
                weekId: part.week_id,
                date: part.date,
                tipoParte: part.tipo_parte,
                tituloParte: part.part_title,
                modalidade: part.modalidade,
                resolvedPublisherName: part.resolved_publisher_name,
                rawPublisherName: part.raw_publisher_name
            };

            await copyS89ToClipboard(mappedPart as any);
            console.log('S-89 capturado e copiado para o clipboard');
        } catch (err) {
            console.error('Falha na captura S-89:', err);
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'PREPARED': return { background: 'rgba(254, 243, 199, 0.2)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)' };
            case 'SENT': return { background: 'rgba(209, 250, 229, 0.2)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.3)' };
            default: return { background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB' };
        }
    };

    const getTypeEmoji = (type: string) => {
        switch (type) {
            case 'S140': return '📜';
            case 'S89': return '📇';
            case 'ANNOUNCEMENT': return '📢';
            case 'INDIVIDUAL': return '👤';
            default: return '✉️';
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        💬 Hub de Comunicação
                    </h2>
                    <p style={{ margin: '4px 0 0 0', color: '#9CA3AF', fontSize: '0.9em' }}>
                        Gerencie e envie as designações geradas pelo Agente.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => setShowActivity(!showActivity)}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                            background: showActivity ? '#4F46E5' : 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer', fontSize: '0.9em',
                            transition: 'all 0.2s'
                        }}
                    >
                        {showActivity ? '🙈 Ocultar Atividade' : '👁️ Ver Atividade'}
                    </button>
                    <button
                        onClick={() => { setLoading(true); loadHistory(); loadActivity(); }}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer', fontSize: '0.9em',
                            transition: 'all 0.2s'
                        }}
                    >
                        🔄 Atualizar
                    </button>
                </div>
            </div>

            {/* Log de Atividades (NOVO) */}
            {showActivity && activityLog.length > 0 && (
                <div style={{
                    marginBottom: '30px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.08)', padding: '15px', overflow: 'hidden'
                }}>
                    <h3 style={{ margin: '0 0 15px 0', fontSize: '1em', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📈 Feed de Atividades Recentes
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '5px' }}>
                        {activityLog.map(entry => (
                            <div key={entry.id} style={{
                                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px',
                                background: 'rgba(0,0,0,0.2)', borderRadius: '10px', fontSize: '0.9em'
                            }}>
                                <span style={{
                                    fontSize: '1.2em', width: '30px', height: '30px', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', borderRadius: '8px',
                                    background: entry.type === 'CONFIRMATION' ? 'rgba(16, 185, 129, 0.1)' :
                                        entry.type === 'REFUSAL' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(107, 114, 128, 0.1)'
                                }}>
                                    {entry.type === 'CONFIRMATION' ? '✅' : entry.type === 'REFUSAL' ? '❌' : '✉️'}
                                </span>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontWeight: '600', color: 'white' }}>{entry.publisher_name}</span>
                                    <span style={{ margin: '0 8px', color: '#6B7280' }}>•</span>
                                    <span style={{ color: '#D1D5DB' }}>
                                        {entry.type === 'CONFIRMATION' ? 'confirmou a designação' :
                                            entry.type === 'REFUSAL' ? 'recusou a designação' : 'notificação registrada'}
                                    </span>
                                    {entry.details && (
                                        <span style={{ marginLeft: '10px', color: '#9CA3AF', fontSize: '0.85em', fontStyle: 'italic' }}>
                                            ({entry.details})
                                        </span>
                                    )}
                                </div>
                                <span style={{ fontSize: '0.8em', color: '#4B5563' }}>
                                    {new Date(entry.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: '100px', color: '#9CA3AF' }}>Carregando histórico...</div>}

            {!loading && history.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: '80px', background: 'rgba(255,255,255,0.02)',
                    borderRadius: '16px', color: '#6B7280', border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    <div style={{ fontSize: '4em', marginBottom: '16px', opacity: 0.5 }}>📩</div>
                    <p style={{ color: '#E5E7EB', fontWeight: '500' }}>Nenhuma comunicação pendente</p>
                    <p style={{ fontSize: '0.9em' }}>Peça ao Agente para enviar a programação ou avisar os estudantes.</p>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', paddingBottom: '40px' }}>
                {history.map((item) => (
                    <div
                        key={item.id}
                        style={{
                            background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)',
                            padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                            display: 'flex', flexDirection: 'column', gap: '12px',
                            backdropFilter: 'blur(10px)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4em'
                                }}>
                                    {getTypeEmoji(item.type)}
                                </div>
                                <div>
                                    <div style={{ fontWeight: '600', color: 'white', fontSize: '1.1em' }}>{item.recipient_name}</div>
                                    <div style={{ fontSize: '0.85em', color: '#9CA3AF' }}>{item.title}</div>
                                </div>
                            </div>
                            <span style={{
                                padding: '4px 12px', borderRadius: '10px', fontSize: '0.75em', fontWeight: '700',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                ...getStatusStyle(item.status || 'PREPARED')
                            }}>
                                {item.status === 'PREPARED' ? 'PENDENTE' : item.status === 'SENT' ? 'ENVIADO' : item.status}
                            </span>
                        </div>

                        <div style={{ position: 'relative' }}>
                            <textarea
                                value={item.content}
                                onChange={(e) => handleContentChange(item.id!, e.target.value)}
                                style={{
                                    width: '100%', minHeight: '120px',
                                    background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px',
                                    fontSize: '0.95em', color: '#D1D5DB', whiteSpace: 'pre-wrap',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5',
                                    outline: 'none', transition: 'border-color 0.2s'
                                }}
                                placeholder="Edite a mensagem aqui..."
                                onFocus={(e) => e.target.style.borderColor = '#4F46E5'}
                                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                            />
                            {item.type === 'S140' && (
                                <div style={{
                                    position: 'absolute', right: '10px', bottom: '10px',
                                    fontSize: '0.7em', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '4px'
                                }}>
                                    📷 A imagem será copiada automaticamente no envio
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                            <span style={{ fontSize: '0.8em', color: '#6B7280' }}>
                                Gerado em: {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : 'Agora'}
                            </span>

                            <button
                                onClick={() => handleSend(item)}
                                disabled={processingId === item.id}
                                style={{
                                    padding: '10px 24px', background: processingId === item.id ? '#1e3a24' : '#10B981',
                                    color: 'white', borderRadius: '10px', border: 'none', fontWeight: '700',
                                    fontSize: '0.95em', display: 'flex', alignItems: 'center', gap: '8px',
                                    cursor: processingId === item.id ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
                                    transition: 'transform 0.1s, opacity 0.2s'
                                }}
                            >
                                {processingId === item.id ? (
                                    <>⏳ Processando...</>
                                ) : (
                                    <>Enviar via WhatsApp <span style={{ fontSize: '1.1em' }}>↗</span></>
                                )}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
