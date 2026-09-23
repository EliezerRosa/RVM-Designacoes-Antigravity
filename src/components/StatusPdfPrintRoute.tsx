import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { WorkbookPart, Publisher } from '../types';
import { mapDbToWorkbookPart } from '../services/workbookService';

const PART_LABELS: Record<string, string> = {
  PRESIDENTE: 'Presidente',
  ORACAO_INICIAL: 'Oração Inicial',
  TESOUROS_DISCURSO: 'Discurso de Tesouros',
  JOIAS: 'Joias Espirituais',
  LEITURA_BIBLIA: 'Leitura da Bíblia',
  FAÇA_MELHOR: 'Faça Seu Melhor',
  ESTUDO_BIBLICO: 'Estudo Bíblico',
  VIDA_CRISTA_1: 'Vida Cristã 1',
  VIDA_CRISTA_2: 'Vida Cristã 2',
  ESTUDO_LIVRO: 'Estudo de Livro',
  LEITOR_LIVRO: 'Leitor do Livro',
  ORACAO_FINAL: 'Oração Final',
  MECANICA_A: 'Áudio / Mecânica',
  INDICADOR_A: 'Indicador',
  MICROFONE_A: 'Microfone',
};

interface StatusPdfPrintRouteProps {
  weekId: string | null;
  secret: string | null;
}

export function StatusPdfPrintRoute({ weekId, secret }: StatusPdfPrintRouteProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parts, setParts] = useState<WorkbookPart[]>([]);
  const [publishersMap, setPublishersMap] = useState<Record<string, { phone?: string; rawName?: string }>>({});

  useEffect(() => {
    async function loadData() {
      if (!weekId) {
        setError('weekId é obrigatório');
        setLoading(false);
        return;
      }
      if (!secret || secret !== import.meta.env.VITE_PRINT_SECRET) {
        setError("Unauthorized");
        setLoading(false);
        return;
      }

      try {
        // 1. Buscar partes da semana
        const { data: partsData, error: partsErr } = await supabase
          .from('workbook_parts')
          .select('*')
          .eq('week_id', weekId)
          .in('status', ['DESIGNADA', 'PROPOSTA'])
          .order('seq', { ascending: true });

        if (partsErr) throw partsErr;
        const weekParts = (partsData || []).map(mapDbToWorkbookPart);
        setParts(weekParts);

        // 2. Extrair publishers
        const pubIds = new Set<string>();
        weekParts.forEach(p => {
          if (p.resolvedPublisherId) pubIds.add(p.resolvedPublisherId);
          if (p.resolvedAssistantId) pubIds.add(p.resolvedAssistantId);
        });

        const { data: pubsData, error: pubsErr } = await supabase
          .from('publishers')
          .select('id, data')
          .in('id', Array.from(pubIds));

        if (pubsErr) throw pubsErr;

        const map: Record<string, { phone?: string; rawName?: string }> = {};
        pubsData?.forEach(p => {
          map[p.id] = {
            phone: p.data?.phone || p.data?.contact_phone || '',
            rawName: p.data?.name || ''
          };
        });
        setPublishersMap(map);

        await document.fonts.ready;
      } catch (err: any) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [weekId, secret]);

  if (loading) return <div id="s89-loading" style={{ padding: '20px' }}>Rendering PDF...</div>;
  if (error) return <div style={{ color: 'red', padding: '20px' }}>Erro: {error}</div>;

  const getPhoneDisplay = (pubId?: string, rawName?: string) => {
    if (!pubId) return null;
    const pub = publishersMap[pubId];
    if (!pub || !pub.phone) return null;
    
    // Zap link
    let clearPhone = pub.phone.replace(/\D/g, '');
    if (clearPhone.length <= 11) clearPhone = '55' + clearPhone;
    
    return (
      <a href={`https://wa.me/${clearPhone}`} style={{ color: '#25D366', textDecoration: 'none', marginLeft: '8px', fontWeight: 'bold' }}>
        📞 {pub.phone}
      </a>
    );
  };

  const getNameDisplay = (pubId?: string, rawName?: string) => {
    if (pubId && publishersMap[pubId]) return publishersMap[pubId].rawName || rawName || 'Não designado';
    return rawName || 'Não designado';
  };

  return (
    <div id="status-pdf-root" style={{ width: '800px', padding: '40px', fontFamily: 'sans-serif', color: '#111827', background: '#fff' }}>
       <h1 style={{ textAlign: 'center', borderBottom: '2px solid #e5e7eb', paddingBottom: '10px', marginBottom: '30px' }}>
         Atualização de Status de parte(s) da semana {weekId}
       </h1>
       <p style={{ textAlign: 'center', color: '#4b5563', marginBottom: '30px' }}>
         Click no número para ligar/zap para contato
       </p>

       <table style={{ width: '100%', borderCollapse: 'collapse' }}>
         <thead>
           <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
             <th style={{ padding: '12px', borderBottom: '1px solid #d1d5db' }}>Parte</th>
             <th style={{ padding: '12px', borderBottom: '1px solid #d1d5db' }}>Designado(s)</th>
             <th style={{ padding: '12px', borderBottom: '1px solid #d1d5db' }}>Status</th>
           </tr>
         </thead>
         <tbody>
           {parts.map(part => (
             <tr key={part.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
               <td style={{ padding: '12px', fontWeight: 500 }}>{PART_LABELS[part.partType as keyof typeof PART_LABELS] || part.partType}</td>
               <td style={{ padding: '12px' }}>
                 <div>
                   {getNameDisplay(part.resolvedPublisherId, part.rawPublisherName)}
                   {getPhoneDisplay(part.resolvedPublisherId)}
                 </div>
                 {part.resolvedAssistantId || part.rawAssistantName ? (
                   <div style={{ marginTop: '6px', color: '#4b5563', fontSize: '0.9em' }}>
                     Ajudante: {getNameDisplay(part.resolvedAssistantId, part.rawAssistantName)}
                     {getPhoneDisplay(part.resolvedAssistantId)}
                   </div>
                 ) : null}
               </td>
               <td style={{ padding: '12px' }}>
                 <span style={{ 
                   display: 'inline-block', 
                   padding: '4px 8px', 
                   borderRadius: '4px', 
                   fontSize: '0.85em', 
                   fontWeight: 'bold',
                   background: part.status === 'DESIGNADA' ? '#dcfce7' : '#fef9c3',
                   color: part.status === 'DESIGNADA' ? '#166534' : '#854d0e'
                 }}>
                   {part.status}
                 </span>
               </td>
             </tr>
           ))}
         </tbody>
       </table>
    </div>
  );
}
