import { useEffect, useMemo, useState } from 'react';
import type { Condition, Funcao, Publisher } from '../../types';
import type { PublisherMutationPreview } from '../../services/publisherMutationService';

interface Props {
    publishers: Publisher[];
    defaultPublisherId?: string | null;
    busy: boolean;
    onPreview: (publisherId: string, updates: Partial<Publisher>) => Promise<PublisherMutationPreview>;
    onConfirm: (publisherId: string, updates: Partial<Publisher>) => Promise<void>;
}

const CONDITION_OPTIONS: Condition[] = ['Anciao', 'Ancião', 'Servo Ministerial', 'Publicador'];
const FUNCAO_OPTIONS: Array<Funcao | ''> = [
    '',
    'Coordenador do Corpo de Anciãos',
    'Secretário',
    'Superintendente de Serviço',
    'Superintendente da Reunião Vida e Ministério',
    'Ajudante do Superintendente da Reunião Vida e Ministério',
];

const FIELD_LABELS: Record<string, string> = {
    name: 'Nome',
    phone: 'Telefone',
    condition: 'Condição',
    funcao: 'Função',
    isNotQualified: 'Não apto',
    notQualifiedReason: 'Motivo',
};

const getPublisherFieldValue = <K extends keyof Publisher>(publisher: Publisher, key: K) => publisher[key];

export function PublisherQuickEditMicroUi({ publishers, defaultPublisherId = null, busy, onPreview, onConfirm }: Props) {
    const [selectedPublisherId, setSelectedPublisherId] = useState(defaultPublisherId || publishers[0]?.id || '');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [condition, setCondition] = useState<Condition>('Publicador');
    const [funcao, setFuncao] = useState<Funcao>(null);
    const [isNotQualified, setIsNotQualified] = useState(false);
    const [notQualifiedReason, setNotQualifiedReason] = useState('');
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [preview, setPreview] = useState<PublisherMutationPreview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const selectedPublisher = useMemo(
        () => publishers.find(publisher => publisher.id === selectedPublisherId) || null,
        [publishers, selectedPublisherId]
    );

    useEffect(() => {
        if (defaultPublisherId) {
            setSelectedPublisherId(defaultPublisherId);
        }
    }, [defaultPublisherId]);

    useEffect(() => {
        if (!selectedPublisher) return;
        setName(selectedPublisher.name);
        setPhone(selectedPublisher.phone || '');
        setCondition(selectedPublisher.condition);
        setFuncao(selectedPublisher.funcao);
        setIsNotQualified(Boolean(selectedPublisher.isNotQualified));
        setNotQualifiedReason(selectedPublisher.notQualifiedReason || '');
        setIsPreviewing(false);
        setPreview(null);
        setPreviewError(null);
    }, [selectedPublisher]);

    if (publishers.length === 0 || !selectedPublisher) {
        return null;
    }

    const updates: Partial<Publisher> = {
        name: name.trim(),
        phone,
        condition,
        funcao,
        isNotQualified,
        notQualifiedReason: isNotQualified ? notQualifiedReason.trim() : '',
    };

    const changedFields = (Object.entries(updates) as Array<[keyof Publisher, Publisher[keyof Publisher]]>)
        .filter(([key, value]) => getPublisherFieldValue(selectedPublisher, key) !== value);

    const handleFieldMutation = (callback: () => void) => {
        callback();
        setIsPreviewing(false);
        setPreview(null);
        setPreviewError(null);
    };

    const handlePrepare = async () => {
        try {
            setPreviewError(null);
            const nextPreview = await onPreview(selectedPublisher.id, updates);
            setPreview(nextPreview);
            setIsPreviewing(true);
        } catch (error) {
            setPreviewError(error instanceof Error ? error.message : 'Falha ao gerar preview.');
            setIsPreviewing(false);
        }
    };

    return (
        <div style={{
            margin: '0 10px 10px 10px',
            padding: '12px',
            borderRadius: '12px',
            background: 'linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 100%)',
            border: '1px solid #BBF7D0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Micro-UI de publicador
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#14532D' }}>
                        Editar ficha principal com preview curto
                    </div>
                </div>
                <div style={{ fontSize: '12px', color: '#15803D' }}>
                    Fase {isPreviewing ? '2' : '1'}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                    Publicador
                    <select value={selectedPublisherId} onChange={(event) => setSelectedPublisherId(event.target.value)} style={{ borderRadius: '8px', border: '1px solid #86EFAC', padding: '8px 10px', fontSize: '12px' }}>
                        {publishers.map(publisher => (
                            <option key={publisher.id} value={publisher.id}>{publisher.name}</option>
                        ))}
                    </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                    Nome
                    <input value={name} onChange={(event) => handleFieldMutation(() => setName(event.target.value))} style={{ borderRadius: '8px', border: '1px solid #86EFAC', padding: '8px 10px', fontSize: '12px' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                    Condição
                    <select value={condition} onChange={(event) => handleFieldMutation(() => setCondition(event.target.value as Condition))} style={{ borderRadius: '8px', border: '1px solid #86EFAC', padding: '8px 10px', fontSize: '12px' }}>
                        {CONDITION_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                    Função
                    <select value={funcao || ''} onChange={(event) => handleFieldMutation(() => setFuncao((event.target.value || null) as Funcao))} style={{ borderRadius: '8px', border: '1px solid #86EFAC', padding: '8px 10px', fontSize: '12px' }}>
                        {FUNCAO_OPTIONS.map(option => <option key={option || 'none'} value={option || ''}>{option || 'Sem função'}</option>)}
                    </select>
                </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', marginBottom: '8px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                    Telefone
                    <input value={phone} onChange={(event) => handleFieldMutation(() => setPhone(event.target.value))} style={{ borderRadius: '8px', border: '1px solid #86EFAC', padding: '8px 10px', fontSize: '12px' }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', fontSize: '12px', color: '#334155', paddingBottom: '8px' }}>
                    <input type="checkbox" checked={isNotQualified} onChange={(event) => handleFieldMutation(() => setIsNotQualified(event.target.checked))} />
                    Não apto
                </label>
            </div>

            {isNotQualified && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155', marginBottom: '8px' }}>
                    Motivo
                    <input value={notQualifiedReason} onChange={(event) => handleFieldMutation(() => setNotQualifiedReason(event.target.value))} style={{ borderRadius: '8px', border: '1px solid #86EFAC', padding: '8px 10px', fontSize: '12px' }} />
                </label>
            )}

            {previewError && (
                <div style={{ marginBottom: '8px', fontSize: '12px', color: '#B91C1C' }}>
                    {previewError}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '11px', color: '#166534' }}>
                    {changedFields.length === 0 ? 'Nenhuma alteração detectada.' : `${changedFields.length} campo(s) alterado(s) prontos para preview.`}
                </div>
                <button
                    onClick={() => void handlePrepare()}
                    disabled={busy || changedFields.length === 0}
                    style={{ border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: busy || changedFields.length === 0 ? 'not-allowed' : 'pointer', background: '#166534', color: '#F0FDF4', fontSize: '12px', fontWeight: 600, opacity: busy || changedFields.length === 0 ? 0.6 : 1 }}
                >
                    Preparar
                </button>
            </div>

            {isPreviewing && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #DCFCE7' }}>
                    <div style={{ fontSize: '12px', color: '#166534', marginBottom: '6px' }}>Preview dos campos alterados:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155', marginBottom: '8px' }}>
                        {changedFields.map(([key, value]) => (
                            <div key={key}><strong>{FIELD_LABELS[key] || key}</strong>: {String(value || '—')}</div>
                        ))}
                    </div>
                    {preview?.renamed && (
                        <div style={{ marginBottom: '10px', padding: '10px', borderRadius: '10px', background: '#ECFCCB', border: '1px solid #BEF264', color: '#3F6212', fontSize: '12px' }}>
                            <div style={{ fontWeight: 700, marginBottom: '4px' }}>Preview de rename</div>
                            <div>{selectedPublisher.name} → {updates.name}</div>
                            <div style={{ marginTop: '4px' }}>Impacto previsto: {preview.renameImpact.totalParts} parte(s), sendo {preview.renameImpact.resolvedParts} em resolved e {preview.renameImpact.rawParts} em raw.</div>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => void onConfirm(selectedPublisher.id, updates)}
                            disabled={busy}
                            style={{ border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: busy ? 'wait' : 'pointer', background: '#14532D', color: '#F0FDF4', fontSize: '12px', fontWeight: 600, opacity: busy ? 0.7 : 1 }}
                        >
                            Confirmar atualização
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}