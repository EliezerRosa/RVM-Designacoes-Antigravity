import { MidweekWeekSchedule, MidweekDiffAction } from '../types.js';

export interface HgWeekScheduleCurrent {
  weekId: string;
  chairman?: number;
  openprayer?: number;
  closeprayer?: number;
  cbs_reader?: number;
  cbs?: number;
  cbsPartId?: number;
  tgw?: Array<{ id: number; assignee: number; assistant?: number; part: number }>;
  fm?: Array<{ id: number; assignee: number; assistant: number; part: number }>;
  lac?: Array<{ id: number; assignee: number; assistant?: number; part: number }>;
}

export function computeMidweekDiff(
  rvmSchedule: MidweekWeekSchedule,
  hgCurrent: HgWeekScheduleCurrent | null,
  knownPublishersMap: Map<number, string>
): MidweekDiffAction[] {
  const diffs: MidweekDiffAction[] = [];
  const weekId = rvmSchedule.weekId;

  const getName = (id?: number) => {
    if (!id || id === 0) return null;
    return { name: knownPublishersMap.get(id) || `ID ${id}`, hgId: id };
  };

  // Helper para comparar slot simples
  const compareSimpleSlot = (
    slotKey: string,
    slotLabel: string,
    rvmHgId?: number,
    hgCurrentId?: number,
    partId?: number,
    rvmAssigneeName?: string
  ) => {
    const curId = hgCurrentId || 0;
    const newId = rvmHgId || 0;

    // Se há um nome atribuído no RVM mas o hg_id não pôde ser resolvido (ex: orador visitante / SC),
    // nunca apagar (clear) o que já estiver no Hourglass.
    if (newId === 0 && rvmAssigneeName && rvmAssigneeName.trim().length > 0) {
      diffs.push({
        weekId,
        slotKey,
        slotLabel,
        partId,
        action: 'noop',
        previousAssignee: getName(curId),
        newAssignee: { name: rvmAssigneeName.trim(), hgId: 0 },
        reason: 'Designado externo/sem hg_id no Hourglass (preservado)'
      });
      return;
    }

    if (newId === curId) {
      diffs.push({
        weekId,
        slotKey,
        slotLabel,
        partId,
        action: 'noop',
        previousAssignee: getName(curId),
        newAssignee: getName(newId),
        reason: 'Já sincronizado e idêntico'
      });
      return;
    }

    if (newId > 0 && curId === 0) {
      diffs.push({
        weekId,
        slotKey,
        slotLabel,
        partId,
        action: 'insert',
        previousAssignee: null,
        newAssignee: getName(newId),
        reason: 'Nova designação no RVM'
      });
      return;
    }

    if (newId > 0 && curId > 0 && newId !== curId) {
      diffs.push({
        weekId,
        slotKey,
        slotLabel,
        partId,
        action: 'update',
        previousAssignee: getName(curId),
        newAssignee: getName(newId),
        reason: 'Substituição / alteração no RVM'
      });
      return;
    }

    if (newId === 0 && curId > 0) {
      diffs.push({
        weekId,
        slotKey,
        slotLabel,
        partId,
        action: 'clear',
        previousAssignee: getName(curId),
        newAssignee: null,
        reason: 'Removido no RVM (RVM prevalece)'
      });
    }
  };

  // 1. Core Slots (incluindo Dirigente do EBC quando presente)
  compareSimpleSlot('chairman', 'Presidente', rvmSchedule.slots['chairman']?.assigneeHgId, hgCurrent?.chairman, undefined, rvmSchedule.slots['chairman']?.assigneeName);
  compareSimpleSlot('openprayer', 'Oração Inicial', rvmSchedule.slots['openprayer']?.assigneeHgId, hgCurrent?.openprayer, undefined, rvmSchedule.slots['openprayer']?.assigneeName);
  compareSimpleSlot('closeprayer', 'Oração Final', rvmSchedule.slots['closeprayer']?.assigneeHgId, hgCurrent?.closeprayer, undefined, rvmSchedule.slots['closeprayer']?.assigneeName);
  compareSimpleSlot('cbs_reader', 'Leitor do EBC', rvmSchedule.slots['cbs_reader']?.assigneeHgId, hgCurrent?.cbs_reader, undefined, rvmSchedule.slots['cbs_reader']?.assigneeName);
  if (rvmSchedule.slots['cbs'] || hgCurrent?.cbs) {
    compareSimpleSlot('cbs', 'Dirigente do EBC', rvmSchedule.slots['cbs']?.assigneeHgId, hgCurrent?.cbs, undefined, rvmSchedule.slots['cbs']?.assigneeName);
  }

  // 2. TGW Slots
  const hgTgw = hgCurrent?.tgw || [];
  for (let i = 0; i < 3; i++) {
    const rvmSlot = rvmSchedule.slots[`tgw_${i}`];
    const hgSlot = hgTgw[i];
    const slotLabel = rvmSlot?.partTitle || `Tesouros da Palavra #${i + 1}`;
    compareSimpleSlot(`tgw_${i}`, slotLabel, rvmSlot?.assigneeHgId, hgSlot?.assignee, hgSlot?.id, rvmSlot?.assigneeName);
  }

  // 3. FM Slots (Ministério)
  const hgFm = hgCurrent?.fm || [];
  for (let i = 0; i < Math.max(4, hgFm.length); i++) {
    const rvmTitular = rvmSchedule.slots[`fm_${i}_assignee`];
    const rvmAjudante = rvmSchedule.slots[`fm_${i}_assistant`];
    const hgSlot = hgFm[i];

    if (rvmTitular || hgSlot?.assignee) {
      compareSimpleSlot(
        `fm_${i}_assignee`,
        `Ministério #${i + 1} (Titular): ${rvmTitular?.partTitle || ''}`,
        rvmTitular?.assigneeHgId,
        hgSlot?.assignee,
        hgSlot?.id,
        rvmTitular?.assigneeName
      );
    }
    if (rvmAjudante || hgSlot?.assistant) {
      compareSimpleSlot(
        `fm_${i}_assistant`,
        `Ministério #${i + 1} (Ajudante): ${rvmAjudante?.partTitle || ''}`,
        rvmAjudante?.assigneeHgId,
        hgSlot?.assistant,
        hgSlot?.id,
        rvmAjudante?.assigneeName
      );
    }
  }

  // 4. LAC Slots (Vida Cristã)
  const hgLac = hgCurrent?.lac || [];
  for (let i = 0; i < Math.max(2, hgLac.length); i++) {
    const rvmSlot = rvmSchedule.slots[`lac_${i}`];
    const hgSlot = hgLac[i];
    if (rvmSlot || hgSlot?.assignee) {
      compareSimpleSlot(
        `lac_${i}`,
        `Vida Cristã #${i + 1}: ${rvmSlot?.partTitle || ''}`,
        rvmSlot?.assigneeHgId,
        hgSlot?.assignee,
        hgSlot?.id,
        rvmSlot?.assigneeName
      );
    }
  }

  return diffs;
}
