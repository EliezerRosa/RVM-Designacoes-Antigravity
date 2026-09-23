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
    <div id="status-pdf-root" style={{ width: '800px', padding: '20px', fontFamily: 'sans-serif', color: '#111827', background: '#fff' }}>
       <h1 style={{ textAlign: 'center', borderBottom: '2px solid #e5e7eb', paddingBottom: '5px', marginBottom: '10px', fontSize: '24px' }}>
         Atualização de Status de parte(s) da semana {weekId}
       </h1>
       <p style={{ textAlign: 'center', color: '#4b5563', marginBottom: '15px', fontSize: '13px' }}>
         Click no número para ligar/zap para contato
       </p>

       <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #d1d5db' }}>
         <thead>
           <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
             <th style={{ padding: '6px 10px', borderBottom: '2px solid #93c5fd', borderRight: '1px solid #e2e8f0', width: '40%', fontSize: '13px' }}>Parte</th>
             <th style={{ padding: '6px 10px', borderBottom: '2px solid #93c5fd', borderRight: '1px solid #e2e8f0', width: '30%', fontSize: '13px' }}>Publicador</th>
             <th style={{ padding: '6px 10px', borderBottom: '2px solid #93c5fd', borderRight: '1px solid #e2e8f0', width: '15%', textAlign: 'center', fontSize: '13px' }}>Status</th>
             <th style={{ padding: '6px 10px', borderBottom: '2px solid #93c5fd', width: '15%', fontSize: '13px' }}>Atualizado</th>
           </tr>
         </thead>
         <tbody>
           {parts.filter(p => p.tipoParte !== 'Elogios e Conselhos').map(part => {
             // Formatação da Parte
             const mainTitle = part.tipoParte || part.partType || 'Designação';
             const subTitle = part.tituloParte || part.descricaoParte;
             const isAjud = part.funcao === 'Ajudante';
             
             // Formatação do Publicador
             const pubName = getNameDisplay(part.resolvedPublisherId, part.rawPublisherName);
             const pubPhone = getPhoneDisplay(part.resolvedPublisherId);

             // Formatação do Status
             let statusBg = '#fef9c3';
             let statusColor = '#854d0e';
             let statusIcon = '⌛';
             let statusText = 'AGUARDANDO';
             
             if (part.status === 'DESIGNADA' || part.status === 'CONFIRMADA' || part.status === 'CONCLUIDA') {
               statusBg = '#10b981';
               statusColor = '#ffffff';
               statusIcon = '✓';
               statusText = 'ACEITA';
             } else if (part.status === 'RECUSADA') {
               statusBg = '#ef4444';
               statusColor = '#ffffff';
               statusIcon = '❌';
               statusText = 'RECUSADA';
             } else if (part.status === 'SUBSTITUIDA') {
               statusBg = '#f59e0b';
               statusColor = '#ffffff';
               statusIcon = '🔄';
               statusText = 'SUBSTITUIÇÃO';
             }

             // Formatação da Data
             const dateObj = part.updatedAt || part.createdAt ? new Date(part.updatedAt || part.createdAt) : null;
             const dateStr = dateObj ? `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth()+1).toString().padStart(2, '0')}, ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}` : '--';

             return (
               <tr key={part.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                 <td style={{ padding: '6px 10px', borderRight: '1px solid #e5e7eb' }}>
                   <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{mainTitle}</div>
                   {subTitle && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{subTitle}{isAjud ? ' - Ajudante' : ''}</div>}
                 </td>
                 <td style={{ padding: '6px 10px', borderRight: '1px solid #e5e7eb' }}>
                   <div style={{ display: 'flex', alignItems: 'center' }}>
                     <span style={{ fontSize: '13px' }}>{pubName}</span>
                     {isAjud && <span style={{ fontSize: '11px', color: '#3b82f6', marginLeft: '4px' }}>(Ajud.)</span>}
                   </div>
                   <div style={{ marginTop: '2px', fontSize: '13px' }}>{pubPhone}</div>
                 </td>
                 <td style={{ padding: '6px 10px', borderRight: '1px solid #e5e7eb', textAlign: 'center' }}>
                   <span style={{ 
                     display: 'inline-flex',
                     alignItems: 'center',
                     gap: '4px',
                     padding: '4px 8px', 
                     borderRadius: '9999px', 
                     fontSize: '11px', 
                     fontWeight: 'bold',
                     background: statusBg,
                     color: statusColor,
                     boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                   }}>
                     <span>{statusIcon}</span> {statusText}
                   </span>
                 </td>
                 <td style={{ padding: '6px 10px', color: '#4b5563', fontSize: '12px' }}>
                   {dateStr}
                 </td>
               </tr>
             );
           })}
         </tbody>
       </table>
    </div>
  );
}
