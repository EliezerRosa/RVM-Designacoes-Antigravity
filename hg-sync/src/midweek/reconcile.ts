import { MidweekWeekSchedule, MidweekDiffAction } from '../types.js';

export interface HgWeekScheduleCurrent {
  weekId: string;
  chairman?: number;
  openprayer?: number;
  closeprayer?: number;
  cbs_reader?: number;
  cbs?: number;
  tgw?: Array<{ id: number; assignee: number; part: number }>;
  fm?: Array<{ id: number; assignee: number; assistant: number; part: number }>;
  lac?: Array<{ id: number; assignee: number; part: number }>;
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
  const compareSimpleSlot = (slotKey: string, slotLabel: string, rvmHgId?: number, hgCurrentId?: number) => {
    const curId = hgCurrentId || 0;
    const newId = rvmHgId || 0;

    if (newId === curId) {
      diffs.push({
        weekId,
        slotKey,
        slotLabel,
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
        action: 'clear',
        previousAssignee: getName(curId),
        newAssignee: null,
        reason: 'Removido no RVM (RVM prevalece)'
      });
    }
  };

  // 1. Core Slots
  compareSimpleSlot('chairman', 'Presidente', rvmSchedule.slots['chairman']?.assigneeHgId, hgCurrent?.chairman);
  compareSimpleSlot('openprayer', 'Oração Inicial', rvmSchedule.slots['openprayer']?.assigneeHgId, hgCurrent?.openprayer);
  compareSimpleSlot('closeprayer', 'Oração Final', rvmSchedule.slots['closeprayer']?.assigneeHgId, hgCurrent?.closeprayer);
  compareSimpleSlot('cbs_reader', 'Leitor do EBC', rvmSchedule.slots['cbs_reader']?.assigneeHgId, hgCurrent?.cbs_reader);

  // 2. TGW Slots
  const hgTgw = hgCurrent?.tgw || [];
  for (let i = 0; i < 3; i++) {
    const rvmSlot = rvmSchedule.slots[`tgw_${i}`];
    const hgSlot = hgTgw[i];
    const slotLabel = rvmSlot?.partTitle || `Tesouros da Palavra #${i + 1}`;
    compareSimpleSlot(`tgw_${i}`, slotLabel, rvmSlot?.assigneeHgId, hgSlot?.assignee);
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
        hgSlot?.assignee
      );
    }
    if (rvmAjudante || hgSlot?.assistant) {
      compareSimpleSlot(
        `fm_${i}_assistant`,
        `Ministério #${i + 1} (Ajudante): ${rvmAjudante?.partTitle || ''}`,
        rvmAjudante?.assigneeHgId,
        hgSlot?.assistant
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
        hgSlot?.assignee
      );
    }
  }

  return diffs;
}

