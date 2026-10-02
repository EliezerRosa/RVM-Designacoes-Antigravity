import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { WorkbookPart, Publisher } from '../types';
import { mapDbToWorkbookPart } from '../services/workbookService';



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
        // 1. Buscar partes das semanas
        const weekIds = weekId.split(',').map(id => id.trim()).filter(Boolean);
        const { data: partsData, error: partsErr } = await supabase
          .from('workbook_parts')
          .select('*')
          .in('week_id', weekIds)
          .in('status', ['DESIGNADA', 'PROPOSTA', 'REJEITADA', 'VAGA', 'CONCLUIDA'])
          .order('week_id', { ascending: true })
          .order('seq', { ascending: true });

        if (partsErr) throw partsErr;
        const weekParts = (partsData || []).map(mapDbToWorkbookPart);
        setParts(weekParts);

        // 2. Extrair publishers
        const pubIds = new Set<string>();
        weekParts.forEach(p => {
          if (p.resolvedPublisherId) pubIds.add(p.resolvedPublisherId);
          if (p?.assistantId) pubIds.add(p?.assistantId);
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

    const partsByWeek = parts.reduce((acc, part) => {
      const wId = part.weekId || 'Semana Desconhecida';
      if (!acc[wId]) acc[wId] = [];
      acc[wId].push(part);
      return acc;
    }, {} as Record<string, WorkbookPart[]>);

    const weekIds = Object.keys(partsByWeek).sort();

  return (
    <div id="status-pdf-root" style={{ width: '800px', padding: '20px', fontFamily: 'sans-serif', color: '#111827', background: '#fff', minHeight: '100vh' }}>
       {/* Override global body background which is dark */}
       <style>{`
         body { background: #fff !important; }
       `}</style>
       <h1 style={{ textAlign: 'center', borderBottom: '2px solid #e5e7eb', paddingBottom: '5px', marginBottom: '10px', fontSize: '24px' }}>
         Atualização de Status de parte(s)
       </h1>
       <p style={{ textAlign: 'center', color: '#4b5563', marginBottom: '15px', fontSize: '13px' }}>
         Click no número para ligar/zap para contato
       </p>

       {weekIds.map((wId, index) => (
         <div key={wId} style={{ marginBottom: '30px', pageBreakInside: 'avoid' }}>
           <h2 style={{ fontSize: '18px', marginBottom: '10px', color: '#1e3a8a', padding: '5px', backgroundColor: '#f1f5f9', borderRadius: '4px' }}>
             Semana: {wId}
           </h2>

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
           {partsByWeek[wId].filter(p => !['Elogios e Conselhos', 'Oração Inicial', 'Comentários Iniciais', 'Comentários Finais'].includes(p.tipoParte || '')).map(part => {
             // Formatação da Parte
             const mainTitle = part.tipoParte || part?.tipoParte || 'Designação';
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
             
             if (part.status === 'DESIGNADA' || false /* CONFIRMADA is not valid */ || part.status === 'CONCLUIDA') {
               statusBg = '#10b981';
               statusColor = '#ffffff';
               statusIcon = '✓';
               statusText = 'ACEITA';
             } else if (false /* RECUSADA is not valid */ || part.status === 'REJEITADA') {
               statusBg = '#ef4444';
               statusColor = '#ffffff';
               statusIcon = '❌';
               statusText = 'REJEITADA';
             } else if (false /* VAGA is not valid */) {
               statusBg = '#ef4444';
               statusColor = '#ffffff';
               statusIcon = '⚠️';
               statusText = 'VAGA';
             } else if (false /* SUBSTITUIDA is not valid */) {
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
       ))}
    </div>
  );
}
