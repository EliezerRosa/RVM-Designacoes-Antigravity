import { useState, useRef, useEffect } from 'react';

import type { WorkbookPart, Publisher } from '../types';

import { copyS89ToClipboard } from '../services/s89Generator';
import html2canvas from 'html2canvas';

import { communicationService } from '../services/communicationService';

interface S89SelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    weekParts: WorkbookPart[];
    weekId: string;
    publishers: Publisher[];
}

export function S89SelectionModal({ isOpen, onClose, weekParts, weekId, publishers }: S89SelectionModalProps) {
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
    const [isSharingS140, setIsSharingS140] = useState(false);
    const [s140HTML, setS140HTML] = useState<string>('');
    const [editingMessages, setEditingMessages] = useState<Record<string, string>>({});
    const [lastMessages, setLastMessages] = useState<Record<string, any>>({});
    const s140Ref = useRef<HTMLDivElement>(null);


    // Helper function must be declared before use
    const extractPartNumber = (titulo: string): string => {
        const match = titulo?.match(/^(\d+)/);
        return match ? match[1] : '';
    };



    // Nova lógica: usar prepareS140UnifiedData para garantir agrupamento idêntico ao S-140 contextual
    const [validParts, setValidParts] = useState<any[]>([]);
    useEffect(() => {
        let mounted = true;
        async function prepareParts() {
            if (!weekParts || weekParts.length === 0) {
                setValidParts([]);
                return;
            }
            const { prepareS140UnifiedData } = await import('../services/s140GeneratorUnified');
            const weekData = await prepareS140UnifiedData(weekParts, publishers);

            // Helper: encontrar WorkbookPart original pelo ID do S140Part
            const findOriginal = (s140PartId?: string) =>
                weekParts.find(wp => wp.id === s140PartId);

            const cards = [];
            // Rastrear IDs já incluídos via S-140 para não duplicar
            const includedOriginalIds = new Set<string>();

            for (const part of weekData.parts || []) {
                const original = findOriginal(part.id);
                // Campos do WorkbookPart necessários para prepareS89Message / generateWhatsAppMessage
                const wpFields = original ? {
                    date: original.date,
                    weekId: original.weekId,
                    weekDisplay: original.weekDisplay,
                    tituloParte: original.tituloParte,
                    modalidade: original.modalidade,
                    status: original.status,
                    horaInicio: original.horaInicio,
                    descricaoParte: original.descricaoParte,
                    detalhesParte: original.detalhesParte,
                    duracao: original.duracao,
                    rawPublisherName: original.rawPublisherName,
                    resolvedPublisherId: original.resolvedPublisherId,
                    section: original.section,
                } : {};

                if (part.mainHallAssignee) {
                    cards.push({
                        ...part,
                        ...wpFields,
                        funcao: 'Titular',
                        resolvedPublisherName: part.mainHallAssignee,
                        tipoParte: part.tipoParte,
                        id: part.id + '-titular',
                    });
                    if (part.id) includedOriginalIds.add(part.id);
                }
                if (part.mainHallAssistant) {
                    cards.push({
                        ...part,
                        ...wpFields,
                        funcao: 'Ajudante',
                        resolvedPublisherName: part.mainHallAssistant,
                        tipoParte: part.tipoParte,
                        id: part.id + '-ajudante',
                    });
                }
            }

            // Garantia de cobertura: incluir partes designadas/aprovadas do weekParts
            // que possam ter ficado de fora do S-140 (ex: partes respondidas, reconfirmações)
            const DESIGNATABLE_STATUSES = ['DESIGNADA', 'APROVADA', 'PROPOSTA', 'CONCLUIDA'];
            const HIDDEN_TYPES = ['Cântico', 'Cantico', 'Comentários Iniciais', 'Comentarios Iniciais',
                'Comentários Finais', 'Comentarios Finais', 'Elogios e Conselhos', 'Elogios e conselhos'];

            for (const wp of weekParts) {
                if (!DESIGNATABLE_STATUSES.includes(wp.status)) continue;
                if (HIDDEN_TYPES.some(h => wp.tipoParte?.includes(h))) continue;
                const name = wp.resolvedPublisherName || wp.rawPublisherName;
                if (!name) continue;
                // Já incluída via S-140?
                const virtualId = wp.id + (wp.funcao === 'Ajudante' ? '-ajudante' : '-titular');
                if (cards.some(c => c.id === virtualId)) continue;
                // Adicionar card avulso para garantir reenvio
                cards.push({
                    ...wp,
                    id: virtualId,
                    resolvedPublisherName: name,
                });
            }
            if (mounted) setValidParts(cards);
        }
        prepareParts();
        return () => { mounted = false; };
    }, [weekParts, publishers]);

    // Carregar histórico de mensagens ao abrir o modal
    // Deps incluem weekParts e publishers para regen a msg ao mudar designação
    useEffect(() => {
        if (isOpen) {
            loadHistory();
        }
    }, [isOpen, weekId, weekParts, publishers]);

    const loadHistory = async () => {
        try {
            const history = await communicationService.getHistory(100);
            const mapping: Record<string, any> = {};
            history.forEach(h => {
                if (h.metadata?.partId) {
                    mapping[h.metadata.partId] = h;
                }
            });
            setLastMessages(mapping);

            // SEMPRE regenerar a mensagem com dados ATUAIS do part
            // O histórico (mapping) é usado apenas para o badge "Enviado em ..."
            const initialEdits: Record<string, string> = {};
            for (const p of validParts) {
                const { content } = await communicationService.prepareS89Message(p, publishers, weekParts);
                initialEdits[p.id] = content;
            }
            setEditingMessages(initialEdits);
        } catch (err) {
            console.error('Erro ao carregar histórico no modal:', err);
        }
    };

    // Async Generation of S-140 HTML for Sharing
    // IMPORTANT: Dependencies must be consistent.
    useEffect(() => {
        if (!isOpen) return; // Don't generate if closed
        if (weekParts.length === 0) return;

        let isMounted = true;
        const generateHiddenS140 = async () => {
            try {
                const { prepareS140UnifiedData, renderS140ToElement } = await import('../services/s140GeneratorUnified');

                // Passa publishers para que resolveName funcione quando resolvedPublisherName é null
                const weekData = await prepareS140UnifiedData(weekParts, publishers);
                const element = renderS140ToElement(weekData);

                if (isMounted) {
                    setS140HTML(element.outerHTML);
                }
            } catch (error) {
                console.error('Erro ao preparar S-140 hidden:', error);
            }
        };

        generateHiddenS140();

        return () => { isMounted = false; };
    }, [weekParts, publishers, isOpen]);

    // Helper to find publisher phone
    const getPublisher = (name?: string) => publishers.find(p => p.name === name);

    const handleSend = async (part: WorkbookPart) => {
        setProcessingIds(prev => new Set(prev).add(part.id));
        try {
            const isAjudante = part.funcao === 'Ajudante';
            const publisherName = part.resolvedPublisherName || part.rawPublisherName;
            const foundPublisher = getPublisher(publisherName);
            const phone = foundPublisher?.phone;

            const currentPartNumber = extractPartNumber(part.tituloParte || part.tipoParte);

            let assistantName: string | undefined;

            if (isAjudante) {
                // Find Titular
                /* const titular = weekParts.find(p => {
                    const pNum = extractPartNumber(p.tituloParte || p.tipoParte);
                    return pNum === currentPartNumber && p.funcao === 'Titular' && p.id !== part.id;
                }); */
            } else {
                // Find Assistant
                const assistant = weekParts.find(p => {
                    const pNum = extractPartNumber(p.tituloParte || p.tipoParte);
                    return pNum === currentPartNumber && p.funcao === 'Ajudante' && p.id !== part.id;
                });
                assistantName = assistant?.resolvedPublisherName || assistant?.rawPublisherName;
            }

            const message = editingMessages[part.id];

            // 1. Identificar se é Estudante (Para Image Capture)
            const pType = (part.tipoParte || '').toLowerCase();
            const pSection = (part.section || '').toLowerCase();
            const isStudent = pSection.includes('ministério') ||
                pSection.includes('ministerio') ||
                pType.includes('leitura') ||
                pType.includes('conversa') ||
                pType.includes('revisita') ||
                pType.includes('estudo');

            // 2. Capturar imagem se for estudante
            if (isStudent) {
                const success = await copyS89ToClipboard(part, assistantName);
                if (!success) {
                    console.warn('Falha ao gerar imagem do cartão S-89. Continuando apenas com texto.');
                }
            }

            // 3. Registrar no histórico de notificações
            await communicationService.logNotification({
                type: 'S89',
                recipient_name: publisherName,
                recipient_phone: phone,
                title: `S-89: ${part.tipoParte}`,
                content: message,
                status: 'SENT',
                metadata: {
                    weekId,
                    partId: part.id,
                    isStudent: isStudent
                }
            });

            // 4. Abrir WhatsApp
            const url = communicationService.generateWhatsAppUrl(phone || '', message);
            window.open(url, '_blank');

            // Atualizar histórico local para o UI
            setLastMessages(prev => ({
                ...prev,
                [part.id]: { content: message, created_at: new Date().toISOString() }
            }));

        } catch (error) {
            console.error('Erro ao enviar S-89:', error);
            alert('Erro ao processar envio.');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(part.id);
                return next;
            });
        }
    };

    // --- S-140 SHARE LOGIC ---
    const handleShareS140 = async () => {
        if (!s140Ref.current) return;
        setIsSharingS140(true);
        try {
            // Force block visibility for capture (although it's visually hidden via position)
            const element = s140Ref.current;

            const canvas = await html2canvas(element, {
                scale: 2, // High DPI
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false,
            });

            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));

            if (!blob) throw new Error('Falha ao gerar Blob da imagem S-140');

            if (navigator.clipboard && navigator.clipboard.write) {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        [blob.type]: blob
                    })
                ]);

                // 1. Calcular Saudação (Dia/Tarde/Noite) — PT-BR: bom dia / boa tarde / boa noite
                const hour = new Date().getHours();
                const greeting = hour < 12 ? 'bom dia' : hour < 18 ? 'boa tarde' : 'boa noite';

                // 2. Calcular Data da Quinta-feira da semana
                // weekId assume formato YYYY-MM-DD (Segunda-feira)
                const [y, m, d] = weekId.split('-').map(Number);
                const weekDate = new Date(y, m - 1, d);
                // Adicionar 3 dias para chegar na Quinta-feira
                const thursdayDate = new Date(weekDate);
                thursdayDate.setDate(weekDate.getDate() + 3);

                // Formatar Data: DD de MMMMM de YYYYY
                const day = thursdayDate.getDate();
                const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
                const month = months[thursdayDate.getMonth()];
                const year = thursdayDate.getFullYear();
                const formattedDate = `${day} de ${month} de ${year}`;

                // 3. Montar Mensagem
                const message = `Olá irmãos! ${greeting.charAt(0).toUpperCase() + greeting.slice(1)}!\n\nSegue programação da reunião de meio de semana, para quinta-feira, dia ${formattedDate}.\n\n(Salmo 90:17)`;

                // 4. Abrir WhatsApp Web com texto preenchido
                const encodedMessage = encodeURIComponent(message);
                window.open(`https://api.whatsapp.com/send?text=${encodedMessage}`, '_blank');
            } else {
                alert('Seu navegador não suporta cópia direta. Imagem gerada, mas não copiada.');
            }

        } catch (error) {
            console.error('Erro ao compartilhar S-140:', error);
            alert('Erro ao gerar imagem S-140.');
        } finally {
            setIsSharingS140(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }} onClick={onClose}>
            <div style={{
                background: 'white', borderRadius: '12px', width: '500px', maxWidth: '95vw',
                maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F9FAFB' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1em', color: '#111827' }}>📤 Enviar Cartões (Semana {weekId})</h3>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7280' }}>&times;</button>
                </div>

                {/* S-140 Hidden Render Container */}
                <div
                    ref={s140Ref}
                    style={{
                        position: 'absolute',
                        top: '-9999px',
                        left: '-9999px',
                        width: '800px', // Fixed width for A4 consistency or similar
                        background: 'white',
                        padding: '20px'
                    }}
                    dangerouslySetInnerHTML={{ __html: s140HTML }}
                />

                {/* List */}
                <div style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* S-140 Action Row */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px', borderRadius: '8px', border: '1px solid #d1fae5', background: '#ecfdf5',
                        marginBottom: '8px'
                    }}>
                        <div>
                            <div style={{ fontWeight: '600', color: '#065f46', fontSize: '0.9em' }}>📜 Quadro de Anúncios (S-140)</div>
                            <div style={{ fontSize: '0.85em', color: '#047857' }}>
                                Programação completa da semana
                            </div>
                        </div>
                        <button
                            onClick={handleShareS140}
                            disabled={isSharingS140}
                            style={{
                                background: '#059669', color: 'white', border: 'none',
                                padding: '8px 12px', borderRadius: '6px', cursor: isSharingS140 ? 'wait' : 'pointer',
                                fontWeight: '500', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '4px',
                                opacity: isSharingS140 ? 0.7 : 1
                            }}
                            title="Copia a imagem do S-140 e abre o WhatsApp Web"
                        >
                            {isSharingS140 ? '⏳...' : 'ZapWeb 🌐'}
                        </button>
                    </div>

                    <div style={{ height: '1px', background: '#E5E7EB', margin: '4px 0 8px 0' }} />
                    <div style={{ fontSize: '0.85em', color: '#6B7280', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' }}>
                        Cartões Individuais (S-89)
                    </div>

                    {validParts.length === 0 ? (
                        <div style={{ color: '#6B7280', textAlign: 'center', padding: '20px' }}>Nenhuma designação relevante nesta semana.</div>
                    ) : (
                        validParts.map(part => {
                            const isProcessing = processingIds.has(part.id);
                            const lastSent = lastMessages[part.id];
                            return (
                                <div key={part.id} style={{
                                    display: 'flex', flexDirection: 'column', gap: '8px',
                                    padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#fff'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: '600', color: '#374151', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {part.modalidade} {part.tituloParte ? `- ${part.tituloParte}` : ''}
                                                {lastSent && (
                                                    <span
                                                        title={`Última msg: ${lastSent.content}`}
                                                        style={{ cursor: 'help', fontSize: '14px' }}
                                                    >
                                                        ℹ️
                                                    </span>
                                                )}
                                                {lastSent?.created_at && (
                                                    <span style={{ fontSize: '10px', color: '#10B981', background: '#ECFDF5', padding: '1px 4px', borderRadius: '4px' }}>
                                                        Enviado em {new Date(lastSent.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.85em', color: '#6B7280' }}>
                                                👤 {part.resolvedPublisherName || part.rawPublisherName}
                                                {part.funcao === 'Ajudante' && <span style={{ marginLeft: '4px', background: '#E0E7FF', color: '#3730A3', padding: '1px 4px', borderRadius: '4px', fontSize: '0.9em' }}>Ajudante</span>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleSend(part)}
                                            disabled={isProcessing}
                                            style={{
                                                background: '#25D366', color: 'white', border: 'none',
                                                padding: '8px 12px', borderRadius: '6px', cursor: isProcessing ? 'wait' : 'pointer',
                                                fontWeight: '500', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '4px',
                                                opacity: isProcessing ? 0.7 : 1
                                            }}
                                        >
                                            {isProcessing ? '⏳...' : 'Zap 📤'}
                                        </button>
                                    </div>
                                    <textarea
                                        value={editingMessages[part.id] || ''}
                                        onChange={(e) => setEditingMessages(prev => ({ ...prev, [part.id]: e.target.value }))}
                                        style={{
                                            width: '100%',
                                            fontSize: '11px',
                                            border: '1px solid #E5E7EB',
                                            borderRadius: '4px',
                                            padding: '8px',
                                            fontFamily: 'inherit',
                                            resize: 'vertical',
                                            minHeight: '60px',
                                            background: '#F9FAFB'
                                        }}
                                        placeholder="Carregando mensagem..."
                                    />
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', background: '#F9FAFB' }}>
                    <button onClick={onClose} style={{
                        padding: '8px 16px', borderRadius: '6px', border: '1px solid #D1D5DB',
                        background: 'white', color: '#374151', cursor: 'pointer'
                    }}>
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}
