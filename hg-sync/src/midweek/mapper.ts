import { RvmWorkbookPart, RvmPublisher } from '../rvm/reader.js';
import { MidweekSlotAssignment, MidweekWeekSchedule } from '../types.js';

export function mapWeekPartsToHgSlots(
  weekId: string,
  parts: RvmWorkbookPart[],
  publishersMap: Map<string, RvmPublisher>,
  isPublished: boolean
): MidweekWeekSchedule {
  const slots: Record<string, MidweekSlotAssignment | null> = {};

  // Partes que ignoramos (cânticos, comentários gerais e elogios não têm assignee no HG)
  const isIgnoredPart = (p: RvmWorkbookPart) => {
    const t = (p.tipo_parte || '').toLowerCase();
    const modal = (p.modalidade || '').toLowerCase();
    return (
      t.includes('cântico') ||
      t.includes('elogios') ||
      t.includes('comentários') ||
      modal.includes('cântico') ||
      modal.includes('aconselhamento')
    );
  };

  // Helper para buscar publisher
  const getPub = (p: RvmWorkbookPart) => {
    if (p.resolved_publisher_id && publishersMap.has(p.resolved_publisher_id)) {
      return publishersMap.get(p.resolved_publisher_id)!;
    }
    // Fallback: busca por nome
    const name = p.resolved_publisher_name || p.raw_publisher_name || '';
    for (const pub of publishersMap.values()) {
      if (pub.name.toLowerCase() === name.toLowerCase()) return pub;
    }
    return null;
  };

  // Ordena por seq
  const sortedParts = [...parts].sort((a, b) => a.seq - b.seq);
  let fmIndex = 0;
  let lacIndex = 0;
  let tgwIndex = 0;

  for (const part of sortedParts) {
    if (isIgnoredPart(part)) continue;
    if (part.status === 'CANCELADA') continue;

    const pub = getPub(part);
    const hgId = pub?.hg_id || 0;
    const name = pub?.name || part.resolved_publisher_name || part.raw_publisher_name || '';

    const slotAssignment: MidweekSlotAssignment = {
      partTitle: part.titulo_parte || part.tipo_parte,
      partType: part.tipo_parte,
      section: part.section,
      role: part.funcao,
      assigneeName: name,
      assigneeHgId: hgId,
      rvmPartId: part.id,
      status: part.status
    };

    const tipo = (part.tipo_parte || '').toLowerCase();
    const modal = (part.modalidade || '').toLowerCase();
    const sec = (part.section || '').toLowerCase();

    // 1. Partes Core de Reunião
    if (tipo.includes('presidente')) {
      slots['chairman'] = slotAssignment;
    } else if (tipo.includes('oração inicial')) {
      slots['openprayer'] = slotAssignment;
    } else if (tipo.includes('oração final')) {
      slots['closeprayer'] = slotAssignment;
    } else if (tipo.includes('leitor ebc') || tipo.includes('leitor do estudo')) {
      slots['cbs_reader'] = slotAssignment;
    } else if (tipo.includes('dirigente ebc') || tipo.includes('estudo bíblico de congregação')) {
      slots['cbs'] = slotAssignment;
    }
    // 2. Tesouros da Palavra de Deus (TGW)
    else if (sec.includes('tesouro')) {
      slots[`tgw_${tgwIndex}`] = slotAssignment;
      tgwIndex++;
    }
    // 3. Faça Seu Melhor no Ministério (FM)
    else if (sec.includes('ministério')) {
      const roleSuffix = part.funcao === 'Ajudante' ? 'assistant' : 'assignee';
      slots[`fm_${fmIndex}_${roleSuffix}`] = slotAssignment;
      if (part.funcao === 'Titular') {
        fmIndex++;
      }
    }
    // 4. Nossa Vida Cristã (LAC)
    else if (sec.includes('vida cristã')) {
      slots[`lac_${lacIndex}`] = slotAssignment;
      lacIndex++;
    }
  }

  const weekDisplay = parts[0]?.date ? `Semana de ${parts[0].date}` : `Semana ${weekId}`;

  return {
    weekId,
    weekDisplay,
    isPublished,
    slots
  };
}

