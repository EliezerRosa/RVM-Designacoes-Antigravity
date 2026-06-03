import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { markManualSelection } from './manualSelectionTracker';
import { getPermissions, createPermissionGate } from './permissionService';

import { generationService } from './generationService';
import { undoService } from './undoService';
import { explainScoreForAgent, calculateScore, getRotationConfig } from './unifiedRotationService';
import { ELIGIBILITY_RULES_VERSION } from './eligibilityService';
import { isBlocked, getParticipationCategory, COOLDOWN_WEEKS, COOLDOWN_WEEKS_HELPER } from './cooldownService';
import { getRankedEligibleForPart } from './rankedEligibleService';
import { communicationService } from './communicationService';
import { dataDiscoveryService } from './dataDiscoveryService';
import { auditService } from './auditService';
import { localNeedsService } from './localNeedsService';
import { participationAnalyticsService } from './participationAnalyticsService';
import { importWorkbookFromJwOrg, fetchWorkbookFromJwOrg, importMultipleWeeks } from './jwOrgService';
import { publisherMutationService } from './publisherMutationService';
import { publisherAvailabilityService } from './publisherAvailabilityService';
import { withAvailabilityAuthor } from './availabilityAuthor';
import { workbookLifecycleService } from './workbookLifecycleService';
import { engineConfigService } from './engineConfigService';
import { workbookManagementService } from './workbookManagementService';
import { specialEventManagementService } from './specialEventManagementService';
import { permissionPolicyService } from './permissionPolicyService';
import { isManuallyAssignable } from '../constants/s140Template';
import { toLocalISODate } from '../utils/dateUtils';

export type AgentActionType =
    | 'GENERATE_WEEK'
    | 'ASSIGN_PART'
    | 'APPROVE_PROPOSAL'
    | 'REJECT_PROPOSAL'
    | 'COMPLETE_PART'
    | 'UNDO_COMPLETE_PART'
    | 'UNDO_LAST'
    | 'NAVIGATE_WEEK'
    | 'VIEW_S140'
    | 'SHARE_S140_WHATSAPP'
    | 'CHECK_SCORE'
    | 'EXPLAIN_SCORE'
    | 'EXPLAIN_PART'
    | 'EXPLAIN_RANKING'
    | 'GET_ENGINE_RULES'
    | 'GET_ELIGIBILITY_VERSION'
    | 'CLEAR_WEEK'
    | 'CLEAR_RANGE'
    | 'UPDATE_PUBLISHER'
    | 'UPDATE_AVAILABILITY'
    | 'UPDATE_ENGINE_RULES'
    | 'MANAGE_SPECIAL_EVENT'
    | 'SEND_S140'
    | 'SEND_S89'
    | 'FETCH_DATA'
    | 'SIMULATE_ASSIGNMENT'
    | 'NOTIFY_REFUSAL'
    | 'SHOW_MODAL'
    | 'MANAGE_LOCAL_NEEDS'
    | 'GET_ANALYTICS'
    | 'IMPORT_WORKBOOK'
    | 'MANAGE_WORKBOOK_PART'
    | 'MANAGE_WORKBOOK_WEEK'
    | 'MANAGE_PERMISSIONS'
    | 'QUERY_PUBLISHER_ASSIGNMENTS'
    | 'QUERY_WEEK_ASSIGNMENTS'
    | 'QUERY_VACANT_PARTS'
    | 'QUERY_ELIGIBILITY'
    | 'QUERY_PUBLISHER_PROFILE'
    | 'QUERY_PUBLISHER_LIST'
    | 'QUERY_COOLDOWN_STATUS'
    | 'QUERY_LAST_PARTICIPATION'
    | 'QUERY_PENDING_WEEKS'
    | 'QUERY_ANALYTICS';

export interface AgentAction {
    type: AgentActionType;
    params: Record<string, any>;
    description: string;
}

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
    actionType?: AgentActionType;
}

// Service implementation
export const agentActionService = {

    // Parse response to find the FIRST action (backwards compat)
    detectAction(responseContent: string): AgentAction | null {
        const all = agentActionService.detectAllActions(responseContent);
        return all.length > 0 ? all[0] : null;
    },

    // Parse response to find ALL action blocks (multi-action support)
    detectAllActions(responseContent: string): AgentAction[] {
        const actions: AgentAction[] = [];

        // Match all ```json ... ``` blocks globally
        const blockRegex = /```json\s*([\s\S]*?)\s*```/g;
        let match: RegExpExecArray | null;

        while ((match = blockRegex.exec(responseContent)) !== null) {
            try {
                const data = JSON.parse(match[1]);
                if (data.type) {
                    actions.push({
                        type: data.type,
                        params: data.params || {},
                        description: data.description || 'Ação sugerida pelo agente'
                    });
                }
            } catch (e) {
                console.warn('[AgentAction] Failed to parse action JSON block:', e);
            }
        }

        // Fallback: try to extract JSON by finding the first { and matching braces
        if (actions.length === 0) {
            const extractObject = (text: string): string | null => {
                const startIdx = text.indexOf('{');
                if (startIdx === -1) return null;

                let braceCount = 0;
                let inString = false;
                let escape = false;

                for (let i = startIdx; i < text.length; i++) {
                    const char = text[i];

                    if (escape) {
                        escape = false;
                        continue;
                    }
                    if (char === '\\') {
                        escape = true;
                        continue;
                    }
                    if (char === '"') {
                        inString = !inString;
                        // Don't continue here, just flip the state, so we don't count braces inside strings
                    }

                    if (!inString) {
                        if (char === '{') braceCount++;
                        else if (char === '}') braceCount--;

                        if (braceCount === 0 && char === '}') {
                            return text.substring(startIdx, i + 1);
                        }
                    }
                }
                return null;
            };

            const jsonStr = extractObject(responseContent);
            if (jsonStr) {
                try {
                    const data = JSON.parse(jsonStr);
                    if (data.type) {
                        actions.push({
                            type: data.type,
                            params: data.params || {},
                            description: data.description || 'Ação sugerida pelo agente'
                        });
                    }
                } catch (e) {
                    console.error('[AgentAction] Failed to parse inline action JSON:', e, 'Raw string:', jsonStr);
                }
            }
        }

        return actions;
    },

    // Execute the action directly (Authorized User Mode)
    async executeAction(
        action: AgentAction,
        parts: WorkbookPart[],
        publishers: Publisher[],
        history: HistoryRecord[] = [],
        contextWeekId?: string
    ): Promise<ActionResult> {
        console.log('[AgentAction] Executing:', action);

        // Permission gate: check if the current user can perform this action
        const perms = getPermissions();
        const gate = createPermissionGate(perms);
        if (!gate.canAgentAction(action.type)) {
            return {
                success: false,
                message: `Ação "${action.type}" não permitida para seu perfil de permissão.`,
                actionType: action.type
            };
        }

        try {
            switch (action.type) {
                case 'SHOW_MODAL': {
                    return {
                        success: true,
                        message: 'Modal aberto pelo orquestrador.',
                        data: { modal: action.params?.modal },
                        actionType: 'SHOW_MODAL'
                    };
                }

                case 'CHECK_SCORE': {
                    const { partType, date } = action.params;
                    // Mapeamento defensivo: o agente de IA pode enviar nomes informais
                    // (ex: "Presidente da Reunião" em vez do tipoParte oficial "Presidente",
                    // ou nomes de modalidade direto como "Aconselhamento").
                    // Aliases cobrem TANTO tipoParte quanto modalidade já resolvida.
                    const MODALIDADE_ALIASES: Record<string, string> = {
                        // Presidência
                        'Presidente': 'Presidência',
                        'Presidente da Reunião': 'Presidência',
                        'Presidente da Reuniao': 'Presidência',
                        'Comentários Iniciais': 'Presidência',
                        'Comentarios Iniciais': 'Presidência',
                        'Comentários Finais': 'Presidência',
                        'Comentarios Finais': 'Presidência',
                        // Oração
                        'Oração': 'Oração',
                        'Oração Inicial': 'Oração',
                        'Oração Final': 'Oração',
                        // Discurso de Ensino
                        'Discurso na Tesouros': 'Discurso de Ensino',
                        'Discurso Tesouros': 'Discurso de Ensino',
                        'Joias Espirituais': 'Discurso de Ensino',
                        'Parte na Vida Cristã': 'Discurso de Ensino',
                        // Aconselhamento
                        'Elogios e Conselhos': 'Aconselhamento',
                        // Estudante / Demonstração
                        'Leitura da Bíblia': 'Leitura de Estudante',
                        'Leitura': 'Leitura de Estudante',
                        'Iniciando Conversas': 'Demonstração',
                        'Cultivando o Interesse': 'Demonstração',
                        'Fazendo Discípulos': 'Demonstração',
                        'Iniciando Conversas (Ajudante)': 'Demonstração',
                        'Cultivando o Interesse (Ajudante)': 'Demonstração',
                        'Fazendo Discípulos (Ajudante)': 'Demonstração',
                        'Discurso': 'Discurso de Estudante',
                        'Estudo Bíblico': 'Demonstração',
                        'Primeira Conversa': 'Demonstração',
                        'Revisita': 'Demonstração',
                        // EBC / Necessidades
                        'Dirigente do EBC': 'Dirigente de EBC',
                        'Dirigente EBC': 'Dirigente de EBC',
                        'Leitor do EBC': 'Leitor de EBC',
                        'Leitor EBC': 'Leitor de EBC',
                        'Necessidades Locais': 'Necessidades Locais',
                    };
                    const resolvedModalidade = MODALIDADE_ALIASES[partType] || partType;

                    // Lookup tolerante (case-insensitive, normaliza diacríticos, contains
                    // bidirecional) para achar uma parte representativa que sirva de contexto.
                    // Prefere match EXATO em tipoParte > tituloParte > modalidade > fuzzy.
                    const norm = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const ptNorm = norm(partType);
                    const modNorm = norm(resolvedModalidade);
                    const sameWeek = parts.filter(p => date ? p.weekId === date || p.date === date : true);
                    const targetPart =
                        sameWeek.find(p => norm(p.tipoParte) === ptNorm)
                        || sameWeek.find(p => norm(p.tituloParte) === ptNorm)
                        || sameWeek.find(p => norm(p.modalidade) === modNorm)
                        || sameWeek.find(p => {
                            const tipo = norm(p.tipoParte); const titulo = norm(p.tituloParte);
                            return tipo.includes(ptNorm) || ptNorm.includes(tipo) || titulo.includes(ptNorm);
                        });
                    const weekParts = targetPart ? parts.filter(p => p.weekId === targetPart.weekId) : [];

                    if (!targetPart) {
                        return { success: false, message: `Nenhuma parte representativa encontrada para ${partType}.` };
                    }

                    const rankedResult = getRankedEligibleForPart(targetPart, weekParts, publishers, history, {
                        applyEngineRules: true,
                        excludeAssignedInSameWeek: true,
                    });
                    const sorted = rankedResult.eligibleCandidates;

                    if (sorted.length === 0) {
                        const resolvedContext = targetPart.modalidade || resolvedModalidade || targetPart.tipoParte;
                        return { success: false, message: `Nenhum publicador elegível encontrado para ${partType} (modalidade resolvida: ${resolvedContext}).` };
                    }
                    const topList = sorted.slice(0, 10).map((cand, i) => {
                        const tags: string[] = [];
                        if (cand.blocked) tags.push('⏸ em cooldown');
                        const otherPart = cand.inOtherPartSameWeek;
                        if (otherPart) tags.push(`⚠️ já em "${otherPart}" nesta semana`);
                        const tagStr = tags.length ? ` ${tags.map(t => `[${t}]`).join(' ')}` : '';
                        return `${i + 1}. ${explainScoreForAgent(cand)}${tagStr}`;
                    }).join('\n');

                    return {
                        success: true,
                        message: `**Análise do Cérebro (Top 10) — fonte canônica única:**\nPara: ${partType} (Ref: ${date || targetPart.weekId || 'Hoje'})\n\n${topList}\n\nℹ️ O ranking já reflete snapshot vivo da semana, estado do publicador e regras bloqueantes do motor. Cooldown permanece sinalizado; a escolha automática usa o primeiro não bloqueado e cai em fallback apenas se todos estiverem bloqueados.`,
                        data: { sorted, alreadyInWeek: Object.fromEntries(rankedResult.inWeekMap) },
                        actionType: 'CHECK_SCORE'
                    };
                }

                case 'EXPLAIN_SCORE': {
                    // Determinístico: explica POR QUE um publicador tem o score X numa parte/semana,
                    // com aritmética literal (Base + TimeBonus - FreqPenalty - Cooldown) e a janela
                    // de cooldown materializada (lista de participações MAIN nas últimas N semanas).
                    // Substitui o LLM como fonte de verdade para "por que X tem score Y / está bloqueado".
                    const { publisherName, partType: ptHint, weekId: wHint, partId } = action.params;

                    const norm = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const pubNorm = norm(publisherName);
                    const publisher = publishers.find(p => norm(p.name) === pubNorm)
                        || publishers.find(p => norm(p.name).includes(pubNorm) || pubNorm.includes(norm(p.name)));
                    if (!publisher) {
                        return { success: false, message: `Publicador "${publisherName}" não encontrado.`, actionType: 'EXPLAIN_SCORE' };
                    }

                    // Resolver targetPart: (1) partId; (2) partType+weekId; (3) designação atual do publicador na semana indicada; (4) próxima designação dele.
                    let targetPart: WorkbookPart | undefined;
                    if (partId) {
                        targetPart = parts.find(p => p.id === partId);
                    } else if (ptHint && wHint) {
                        const ptN = norm(ptHint);
                        targetPart = parts.find(p => p.weekId === wHint && (norm(p.tipoParte) === ptN || norm(p.tituloParte) === ptN || norm(p.tipoParte).includes(ptN)));
                    } else if (wHint) {
                        targetPart = parts.find(p => p.weekId === wHint && ((publisher?.id && p.resolvedPublisherId === publisher.id) || p.resolvedPublisherName === publisher.name || p.rawPublisherName === publisher.name));
                    } else if (ptHint) {
                        const ptN = norm(ptHint);
                        targetPart = parts.find(p => norm(p.tipoParte) === ptN || norm(p.tipoParte).includes(ptN));
                    }
                    // Fallback: próxima designação do publicador a partir de hoje
                    if (!targetPart) {
                        const todayStr = toLocalISODate();
                        const futureAssigned = parts
                            .filter(p => ((publisher?.id && p.resolvedPublisherId === publisher.id) || p.resolvedPublisherName === publisher.name || p.rawPublisherName === publisher.name) && (p.date || p.weekId) >= todayStr)
                            .sort((a, b) => (a.date || a.weekId).localeCompare(b.date || b.weekId));
                        targetPart = futureAssigned[0];
                    }

                    if (!targetPart) {
                        return { success: false, message: `Não consegui localizar a parte para calcular o score de ${publisher.name}. Forneça partType + weekId ou partId.`, actionType: 'EXPLAIN_SCORE' };
                    }

                    const weekParts = parts.filter(p => p.weekId === targetPart!.weekId);
                    const rankedResult = getRankedEligibleForPart(targetPart, weekParts, publishers, history, {
                        applyEngineRules: true,
                        excludeAssignedInSameWeek: true,
                    });
                    const candidateSnapshot = rankedResult.allCandidates.find(candidate => candidate.publisher.id === publisher.id);
                    const refDateStr = targetPart.date || targetPart.weekId;
                    const refDate = rankedResult.referenceDate;
                    const historyForScoring = rankedResult.historyForScoring;
                    const scoringPartType = rankedResult.scoringPartType;
                    const sd = candidateSnapshot?.scoreData
                        || calculateScore(publisher, scoringPartType, historyForScoring, refDate, rankedResult.currentPresident);
                    const blocked = candidateSnapshot?.blocked
                        || isBlocked(publisher.name, historyForScoring, refDate, publisher.id);
                    const isHelperPart = (targetPart.funcao || '').toLowerCase() === 'ajudante';
                    const cooldownWeeks = isHelperPart ? COOLDOWN_WEEKS_HELPER : COOLDOWN_WEEKS;

                    // Janela de cooldown
                    const windowEnd = new Date(refDate);
                    const windowStart = new Date(refDate);
                    windowStart.setDate(windowStart.getDate() - cooldownWeeks * 7);
                    const wStartStr = toLocalISODate(windowStart);
                    const wEndStr = toLocalISODate(windowEnd);

                    // Participações MAIN do publicador dentro da janela
                    const mainInWindow = historyForScoring.filter(h => {
                        const isThis = (publisher?.id && h.resolvedPublisherId === publisher.id) || h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name;
                        if (!isThis) return false;
                        if (!h.date || h.date < wStartStr || h.date >= wEndStr) return false;
                        const cat = getParticipationCategory(h.tipoParte || '', h.funcao || '');
                        return cat === 'MAIN';
                    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

                    // Frequência: usamos o recentCount AUTORITATIVO do motor (calculateScore),
                    // que conta a janela ±12 semanas (passadas E futuras) com TODAS as partes
                    // exceto oração, INCLUINDO Ajudante. (Antes recalculávamos aqui só passado/MAIN,
                    // o que excluía ajudante e o futuro — divergindo do score real.)

                    const fmtDate = (s: string) => {
                        try { return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return s; }
                    };

                    const lines: string[] = [];
                    lines.push(`**Score determinístico (motor oficial — sem LLM):**`);
                    lines.push(`Publicador: **${publisher.name}**`);
                    lines.push(`Parte: *${targetPart.tituloParte || targetPart.tipoParte}* — Semana ${targetPart.weekId}`);
                    lines.push(`Tipo de parte usado para scoring: \`${scoringPartType}\``);
                    if (candidateSnapshot) {
                        lines.push(`Elegibilidade canônica atual: **${candidateSnapshot.eligible ? 'sim' : `não (${candidateSnapshot.reason})`}**`);
                    }
                    lines.push('');
                    lines.push(`**Aritmética literal:**`);
                    lines.push(`\`${sd.details.base} (Base) + ${sd.details.timeBonus} (Time Bonus) − ${sd.details.frequencyPenalty} (Frequency Penalty) ${sd.details.roleBonus !== 0 ? `+ ${sd.details.roleBonus} (Bônus função) ` : ''}− ${sd.details.heavyProximityPenalty} (Heavy Proximity) = **${sd.score}**\``);
                    lines.push('');
                    lines.push(`**Time Bonus** (semanas desde a última vez nesta MESMA parte): ${sd.weeksSinceLast} semana(s) → ${sd.details.timeBonus} pts.`);
                    if (sd.lastDate) lines.push(`Última vez em "${scoringPartType}": ${fmtDate(sd.lastDate)}.`);
                    lines.push('');
                    const freqPerPart = sd.details.recentCount > 0 ? Math.round(sd.details.frequencyPenalty / sd.details.recentCount) : getRotationConfig().RECENT_PARTICIPATION_PENALTY;
                    lines.push(`**Frequency Penalty** (±12 semanas — passadas E futuras; todas as partes exceto oração, incl. Ajudante): ${sd.details.recentCount} participação(ões) × ${freqPerPart} = ${sd.details.frequencyPenalty} pts.`);
                    lines.push('');
                    lines.push(`**Heavy Proximity Penalty** (±4 semanas, papéis pesados: Presidente, EBC, Discurso):`);
                    if (sd.details.heavyProximityPenalty > 0) {
                        lines.push(`Penalidade total: **−${sd.details.heavyProximityPenalty} pts** (soma de ocorrências em gradiente 4000×(radius−weeks)/radius).`);
                        const heavyInWindow = history.filter(h => {
                            const isThis = (publisher?.id && h.resolvedPublisherId === publisher.id) || h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name;
                            if (!isThis) return false;
                            const d = h.date || '';
                            if (!d || d === refDateStr) return false;
                            const refMs = refDate.getTime();
                            const hwMs = 4 * 7 * 24 * 60 * 60 * 1000;
                            const hwStart = new Date(refMs - hwMs).toISOString().split('T')[0];
                            const hwEnd = new Date(refMs + hwMs).toISOString().split('T')[0];
                            if (d < hwStart || d > hwEnd) return false;
                            const hType = (h.tipoParte || '').toLowerCase();
                            return ['presidente','dirigente ebc','dirigente do ebc','discurso tesouros','discurso na tesouros','discurso vida crista','discurso na vida crista','leitor ebc','leitor do ebc'].some(k => hType.includes(k));
                        });
                        heavyInWindow.forEach(h => {
                            const diffMs = Math.abs(new Date((h.date||'') + 'T12:00:00').getTime() - refDate.getTime());
                            const w = (diffMs / (7 * 24 * 60 * 60 * 1000)).toFixed(1);
                            lines.push(`  • ${fmtDate(h.date||'')} — ${h.tipoParte} (${w} semanas de distância)`);
                        });
                    } else {
                        lines.push(`Sem papéis pesados no período ±4 semanas — penalidade = 0.`);
                    }
                    lines.push('');
                    lines.push(`**Cooldown visual** (indicador ⏳, não deduz do score, ${cooldownWeeks} semanas):`);
                    lines.push(`Janela: ${fmtDate(wStartStr)} → ${fmtDate(wEndStr)}.`);
                    if (blocked) {
                        lines.push(`Status visual: **BLOQUEADO** (⏳ intervalo ativo — não penaliza o score, apenas indica sobrecarga recente).`);
                        if (mainInWindow.length > 0) {
                            lines.push(`Participações MAIN que dispararam o bloqueio:`);
                            mainInWindow.forEach(h => {
                                lines.push(`  • ${fmtDate(h.date)} — ${h.tipoParte || h.tituloParte} (${h.funcao || 'Titular'})`);
                            });
                        } else {
                            lines.push(`⚠️ Inconsistência: cooldown ativo mas nenhuma participação MAIN encontrada na janela. Verifique o histórico.`);
                        }
                    } else {
                        lines.push(`Status: livre (sem participação MAIN na janela).`);
                    }
                    if (sd.details.specificAdjustments.length > 0) {
                        lines.push('');
                        lines.push(`Ajustes específicos: ${sd.details.specificAdjustments.join(', ')}.`);
                    }

                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { publisher: publisher.name, partId: targetPart.id, score: sd.score, breakdown: sd.details, mainInWindow, blocked, cooldownWeeks, windowStart: wStartStr, windowEnd: wEndStr },
                        actionType: 'EXPLAIN_SCORE',
                    };
                }

                case 'EXPLAIN_PART': {
                    // Mesma fonte (eligibilityService + cooldownService + unifiedRotationService) usada
                    // pela coluna "Controle & Explicações" (ActionControlPanel). Garante consistência.
                    const { partId, partType: ptHint, weekId: wHint, publisherName } = action.params;
                    const targetPart = partId
                        ? parts.find(p => p.id === partId)
                        : parts.find(p =>
                            (ptHint ? (p.tipoParte === ptHint || p.tituloParte?.includes(ptHint)) : false)
                            && (wHint ? p.weekId === wHint : true)
                        );
                    if (!targetPart) {
                        return { success: false, message: 'Parte não encontrada para explicação.' };
                    }
                    const partType = targetPart.tipoParte || targetPart.tituloParte || '';
                    const weekParts = parts.filter(p => p.weekId === targetPart.weekId);
                    const rankedResult = getRankedEligibleForPart(targetPart, weekParts, publishers, history, {
                        applyEngineRules: true,
                        excludeAssignedInSameWeek: true,
                    });
                    const sorted = rankedResult.eligibleCandidates;

                    const assignedName = targetPart.resolvedPublisherName || '';
                    const assignedPub = assignedName ? publishers.find(p => p.name === assignedName) : null;
                    const focusName = publisherName || assignedName;
                    const focusPub = focusName ? publishers.find(p => p.name === focusName) : null;
                    const assignedSnapshot = assignedPub ? rankedResult.allCandidates.find(candidate => candidate.publisher.id === assignedPub.id) : null;
                    const focusSnapshot = focusPub ? rankedResult.allCandidates.find(candidate => candidate.publisher.id === focusPub.id) : null;

                    const lines: string[] = [];
                    lines.push(`**Explicação oficial (mesma fonte canônica de Motor, Agente e Dropdown):**`);
                    lines.push(`Parte: *${targetPart.tituloParte || partType}* — Semana ${targetPart.weekId}`);
                    if (assignedPub) {
                        lines.push(`\nDesignado atual: **${assignedPub.name}** — Elegível: ${assignedSnapshot?.eligible ? 'sim' : `não (${assignedSnapshot?.reason || 'fora da lista canônica atual'})`}`);
                        if (assignedSnapshot) {
                            lines.push(`Score: ${assignedSnapshot.scoreData.score} — ${assignedSnapshot.scoreData.explanation}`);
                        }
                    } else {
                        // FIX A (2026-04-29): label inequívoco. Antes "— (vago)" era ambíguo;
                        // o LLM podia narrar que outro nome da semana "estava" nessa parte.
                        lines.push(`\n🟥 **Designado atual: VAGA (parte SEM designado no banco de dados).** NÃO atribua nenhum nome a esta parte com base em outras linhas da semana.`);
                    }

                    if (focusPub && (!assignedPub || focusPub.id !== assignedPub.id)) {
                        lines.push(`\nFoco: **${focusPub.name}** — Elegível: ${focusSnapshot?.eligible ? 'sim' : `não (${focusSnapshot?.reason || 'fora da lista canônica atual'})`}`);
                        if (focusSnapshot) lines.push(`Score: ${focusSnapshot.scoreData.score} — ${focusSnapshot.scoreData.explanation}`);
                    }

                    lines.push(`\n**Top 5 candidatos pelo motor (fonte determinística):**`);
                    sorted.slice(0, 5).forEach((c, i) => {
                        const tags: string[] = [];
                        if (c.blocked) tags.push('⏸ cooldown');
                        const otherPart = c.inOtherPartSameWeek;
                        if (otherPart) tags.push(`⚠️ já em "${otherPart}" nesta semana`);
                        const tagStr = tags.length ? ` ${tags.map(t => `[${t}]`).join(' ')}` : '';
                        lines.push(`${i + 1}. ${explainScoreForAgent(c)}${tagStr}`);
                    });
                    lines.push(`\nℹ️ Este ranking já incorpora o snapshot vivo da semana, as regras do motor e a exclusão de partes abertas já ocupadas. Cooldown continua apenas como tag de seleção/fallback.`);

                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { partId: targetPart.id, sorted, assignedName, focusName, alreadyInWeek: Object.fromEntries(rankedResult.inWeekMap) },
                        actionType: 'EXPLAIN_PART',
                    };
                }

                case 'EXPLAIN_RANKING': {
                    // GET-only: ranking determinístico top-N para uma parte, sem narrativa
                    // de elegibilidade do designado/focado. Útil quando o agente só precisa
                    // do "quem o motor recomenda?" sem contexto de comparação.
                    const { partId, partType: ptHint, weekId: wHint, topN } = action.params;
                    const targetPart = partId
                        ? parts.find(p => p.id === partId)
                        : parts.find(p =>
                            (ptHint ? (p.tipoParte === ptHint || p.tituloParte?.includes(ptHint)) : false)
                            && (wHint ? p.weekId === wHint : true)
                        );
                    if (!targetPart) {
                        return { success: false, message: 'Parte não encontrada para ranking.' };
                    }
                    const limit = Math.max(1, Math.min(50, Number(topN) || 10));
                    const weekParts = parts.filter(p => p.weekId === targetPart.weekId);
                    const partType = targetPart.tipoParte || targetPart.tituloParte || '';
                    const rankedResult = getRankedEligibleForPart(targetPart, weekParts, publishers, history, {
                        applyEngineRules: true,
                        excludeAssignedInSameWeek: true,
                    });
                    const top = rankedResult.eligibleCandidates.slice(0, limit).map((c, i) => ({
                        rank: i + 1,
                        name: c.publisher.name,
                        score: c.scoreData.score,
                        weeksSinceLast: c.scoreData.weeksSinceLast,
                        isInCooldown: c.blocked,
                        explanation: c.scoreData.explanation,
                    }));
                    const lines = [`**Ranking determinístico — Top ${limit}** para *${targetPart.tituloParte || partType}* (semana ${targetPart.weekId}):`];
                    top.forEach(t => {
                        const cd = t.isInCooldown ? ' [⏸ cooldown]' : '';
                        lines.push(`${t.rank}. ${t.name} — Score ${t.score}${cd} — ${t.explanation}`);
                    });
                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { partId: targetPart.id, partType, top, totalEligible: rankedResult.eligibleCandidates.length },
                        actionType: 'EXPLAIN_RANKING',
                    };
                }

                case 'GET_ENGINE_RULES': {
                    // GET-only: snapshot atual da configuração do motor (pesos, penalidades, bônus).
                    // Fonte única: getRotationConfig() — runtime mutável via UPDATE_ENGINE_RULES.
                    const config = getRotationConfig();
                    const lines = [
                        `**Configuração ATUAL do motor de rotação** (snapshot runtime):`,
                        '',
                        '| Chave | Valor |',
                        '|---|---|',
                    ];
                    for (const [k, v] of Object.entries(config)) {
                        lines.push(`| \`${k}\` | ${JSON.stringify(v)} |`);
                    }
                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { engineConfig: config },
                        actionType: 'GET_ENGINE_RULES',
                    };
                }

                case 'GET_ELIGIBILITY_VERSION': {
                    // GET-only: versão das regras de elegibilidade + constantes de cooldown.
                    // Útil para o agente declarar com qual conjunto de regras está raciocinando.
                    const info = {
                        eligibilityRulesVersion: ELIGIBILITY_RULES_VERSION,
                        cooldownWeeksMain: COOLDOWN_WEEKS,
                        cooldownWeeksHelper: COOLDOWN_WEEKS_HELPER,
                    };
                    const lines = [
                        `**Versão das regras de elegibilidade:** \`${info.eligibilityRulesVersion}\``,
                        `**Cooldown TITULAR:** ${info.cooldownWeeksMain} semanas`,
                        `**Cooldown AJUDANTE:** ${info.cooldownWeeksHelper} semanas`,
                    ];
                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: info,
                        actionType: 'GET_ELIGIBILITY_VERSION',
                    };
                }

                case 'GENERATE_WEEK': {
                    const { weekId } = action.params;
                    if (!weekId) return { success: false, message: 'Semana não especificada.' };

                    const partsInWeek = parts.filter(p => p.weekId === weekId);
                    undoService.captureBatch(partsInWeek, `Agente: Gerar Semana ${weekId}`);

                    const result = await generationService.generateDesignations(parts, publishers, {
                        generationWeeks: [weekId],
                        isDryRun: false
                    });

                    return {
                        success: result.success,
                        message: result.message || (result.success ? 'Geração concluída com sucesso.' : 'Falha na geração.'),
                        data: result,
                        actionType: 'GENERATE_WEEK'
                    };
                }

                case 'APPROVE_PROPOSAL': {
                    const { partId, elderId } = action.params;
                    if (!partId || !elderId) {
                        return { success: false, message: 'Faltam parâmetros: partId e elderId.' };
                    }

                    const proposalPart = parts.find(p => p.id === partId);
                    if (proposalPart && !isManuallyAssignable(proposalPart.tipoParte)) {
                        return { success: false, message: `"${proposalPart.tituloParte || proposalPart.tipoParte}" é uma parte automática/não-designável; não passa por aprovação.` };
                    }

                    const approvedPart = await workbookLifecycleService.approveProposal(partId, elderId);
                    return {
                        success: true,
                        message: `Proposta aprovada para ${approvedPart.tipoParte}.`,
                        data: { part: approvedPart },
                        actionType: 'APPROVE_PROPOSAL'
                    };
                }

                case 'REJECT_PROPOSAL': {
                    const { partId, reason } = action.params;
                    if (!partId || !reason) {
                        return { success: false, message: 'Faltam parâmetros: partId e reason.' };
                    }

                    const rejectedPart = await workbookLifecycleService.rejectProposal(partId, reason);
                    return {
                        success: true,
                        message: `Proposta rejeitada para ${rejectedPart.tipoParte}.`,
                        data: { part: rejectedPart },
                        actionType: 'REJECT_PROPOSAL'
                    };
                }

                case 'COMPLETE_PART': {
                    const { partId } = action.params;
                    if (!partId) {
                        return { success: false, message: 'Falta o parâmetro partId.' };
                    }

                    const completePartCheck = parts.find(p => p.id === partId);
                    if (completePartCheck && !isManuallyAssignable(completePartCheck.tipoParte)) {
                        return { success: false, message: `"${completePartCheck.tituloParte || completePartCheck.tipoParte}" é automática/não-designável; não requer marcação de conclusão.` };
                    }

                    const completedPart = await workbookLifecycleService.completePart(partId);
                    return {
                        success: true,
                        message: `Parte marcada como concluída${completedPart ? `: ${completedPart.tipoParte}` : ''}.`,
                        data: { part: completedPart },
                        actionType: 'COMPLETE_PART'
                    };
                }

                case 'UNDO_COMPLETE_PART': {
                    const { partId } = action.params;
                    if (!partId) {
                        return { success: false, message: 'Falta o parâmetro partId.' };
                    }

                    const restoredPart = await workbookLifecycleService.undoCompletePart(partId);
                    return {
                        success: true,
                        message: `Conclusão desfeita para ${restoredPart.tipoParte}.`,
                        data: { part: restoredPart },
                        actionType: 'UNDO_COMPLETE_PART'
                    };
                }

                case 'UNDO_LAST': {
                    const result = await undoService.undo();
                    return {
                        success: result.success,
                        message: result.success ? `Ação desfeita: ${result.description || 'Desconhecida'}` : 'Não há ações para desfazer.',
                        actionType: 'UNDO_LAST'
                    };
                }

                case 'CLEAR_WEEK': {
                    const { weekId: clearWeekId } = action.params;
                    if (!clearWeekId) return { success: false, message: 'Semana não especificada.' };

                    const weekPartsToClean = parts.filter(p => p.weekId === clearWeekId);
                    if (weekPartsToClean.length === 0) {
                        return { success: false, message: 'Nenhuma parte encontrada para esta semana.' };
                    }

                    undoService.captureBatch(weekPartsToClean, `Agente: Limpar Semana ${clearWeekId}`);
                    const { clearedCount } = await workbookManagementService.clearWeek(weekPartsToClean);

                    return {
                        success: true,
                        message: `${clearedCount} designações removidas da semana ${clearWeekId}.`,
                        actionType: 'CLEAR_WEEK'
                    };
                }

                case 'CLEAR_RANGE': {
                    const { fromWeekId, toWeekId } = action.params;
                    if (!fromWeekId || !toWeekId) return { success: false, message: 'Faltam parâmetros: fromWeekId e toWeekId.' };

                    // Collect all week IDs in range
                    const allWeekIds = [...new Set(parts.map(p => p.weekId))].sort();
                    const rangeWeekIds = allWeekIds.filter(wid => wid >= fromWeekId && wid <= toWeekId);

                    if (rangeWeekIds.length === 0) {
                        return { success: false, message: `Nenhuma semana encontrada no intervalo ${fromWeekId} a ${toWeekId}.` };
                    }

                    const results: string[] = [];
                    let totalCleared = 0;

                    for (const weekId of rangeWeekIds) {
                        const weekParts = parts.filter(p => p.weekId === weekId);
                        if (weekParts.length === 0) continue;

                        undoService.captureBatch(weekParts, `Agente: Limpar Semana ${weekId}`);
                        const { clearedCount } = await workbookManagementService.clearWeek(weekParts);
                        totalCleared += clearedCount;
                        results.push(`${weekId}: ${clearedCount} removidas`);
                    }

                    return {
                        success: true,
                        message: `${totalCleared} designações removidas de ${rangeWeekIds.length} semanas (${fromWeekId} a ${toWeekId}).\n${results.map(r => `• ${r}`).join('\n')}`,
                        actionType: 'CLEAR_RANGE'
                    };
                }

                case 'UPDATE_PUBLISHER': {
                    let { publisherName, updates, ...directUpdates } = action.params;

                    if (!updates && Object.keys(directUpdates).length > 0) {
                        updates = directUpdates;
                    }

                    if (!publisherName || !updates) {
                        return { success: false, message: 'Faltam parâmetros: publisherName ou updates.' };
                    }

                    if ('isQualified' in updates) {
                        updates.isNotQualified = !updates.isQualified;
                        delete updates.isQualified;
                    }

                    const pub = publishers.find(p => p.name.toLowerCase().includes(publisherName.toLowerCase().trim()));
                    if (!pub) {
                        return { success: false, message: `Publicador "${publisherName}" não encontrado na base de dados.` };
                    }

                    try {
                        const updatedPub = { ...pub, ...updates };
                        const mutationResult = await publisherMutationService.savePublisherWithPropagation(updatedPub, pub);

                        await auditService.logAction({
                            table_name: 'publishers',
                            operation: 'AGENT_INTENT',
                            record_id: mutationResult.publisher.id,
                            new_data: mutationResult.publisher,
                            description: `Agente atualizou publicador: ${action.description}`
                        });

                        const propagationSummary = mutationResult.renamed
                            ? ` Rename propagado para ${mutationResult.propagatedParts} parte(s).`
                            : '';

                        return {
                            success: true,
                            message: `**Atualização Concluída:** Os dados de **${pub.name}** foram alterados. Status: ${updates.isNotQualified ? '[INAPTO]' : '[APTO]'}. Motivo: ${updates.notQualifiedReason || 'N/A'}.${propagationSummary}`,
                            data: {
                                publisher: mutationResult.publisher,
                                propagatedParts: mutationResult.propagatedParts,
                                renamed: mutationResult.renamed,
                            },
                            actionType: 'UPDATE_PUBLISHER'
                        };
                    } catch (e) {
                        console.error('[AgentAction] Fail to update publisher', e);
                        return { success: false, message: `Erro ao atualizar publicador: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'UPDATE_AVAILABILITY': {
                    const { publisherName, unavailableDates } = action.params;
                    if (!publisherName || !unavailableDates || !Array.isArray(unavailableDates)) {
                        return { success: false, message: 'Faltam parâmetros: publisherName ou unavailableDates (Array de strings).' };
                    }

                    const pub = publishers.find(p => p.name.toLowerCase().includes(publisherName.toLowerCase().trim()));
                    if (!pub) {
                        return { success: false, message: `Publicador "${publisherName}" não encontrado para bloquear as datas.` };
                    }

                    try {
                        // Merge: adicionar novas datas às existentes (sem duplicar) — sob o
                        // contexto de autoria 'admin_agent' para que availability_history
                        // registre o Agente como autor da mudança.
                        const result = await withAvailabilityAuthor(
                            { source: 'admin_agent', authorLabel: 'Agente', authorId: null },
                            () => publisherAvailabilityService.updateAvailability(pub, unavailableDates),
                        );

                        await auditService.logAction({
                            table_name: 'publishers',
                            operation: 'AGENT_INTENT',
                            record_id: result.publisher.id,
                            new_data: result.publisher,
                            description: `Agente bloqueou datas de disponibilidade: ${action.description}`
                        });

                        return {
                            success: true,
                            message: `**Agenda Atualizada:** As datas **(${unavailableDates.join(', ')})** foram adicionadas às indisponibilidades de **${pub.name}** (total: ${result.totalBlockedDates} datas bloqueadas).`,
                            data: result.publisher,
                            actionType: 'UPDATE_AVAILABILITY'
                        };
                    } catch (e) {
                        console.error('[AgentAction] Fail to update availability', e);
                        return { success: false, message: `Erro ao ajustar agenda: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'UPDATE_ENGINE_RULES': {
                    const { settings } = action.params;
                    if (!settings || typeof settings !== 'object') {
                        return { success: false, message: 'Faltam os parâmetros de configuração (objeto settings).' };
                    }

                    try {
                        const result = await engineConfigService.updateEngineConfig(settings);

                        await auditService.logAction({
                            table_name: 'settings',
                            operation: 'AGENT_INTENT',
                            record_id: 'engine_config',
                            new_data: result.mergedConfig,
                            description: `Agente alterou regras do motor: ${action.description}`
                        });

                        return {
                            success: true,
                            message: `**Configurações do Motor Atualizadas:** As novas regras foram aplicadas com sucesso e persistidas no banco.`,
                            data: result.mergedConfig,
                            actionType: 'UPDATE_ENGINE_RULES'
                        };
                    } catch (e) {
                        console.error('[AgentAction] Fail to update engine rules', e);
                        return { success: false, message: `Erro ao atualizar regras do motor: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'SEND_S140': {
                    const { weekId } = action.params;
                    if (!weekId) return { success: false, message: 'Semana não especificada.' };

                    try {
                        const weekParts = parts.filter(p => p.weekId === weekId);
                        const message = await communicationService.prepareS140Message(weekId, weekParts);

                        await communicationService.logNotification({
                            type: 'S140',
                            recipient_name: 'Grupo de Anciãos e Servos',
                            title: `Programação da Semana ${weekId}`,
                            content: message,
                            status: 'PREPARED',
                            metadata: { weekId },
                            action_url: communicationService.generateWhatsAppUrl('', message)
                        });

                        return {
                            success: true,
                            message: `**Programação da Semana ${weekId}**: Abrindo ferramenta de envio...`,
                            data: { weekId, openModal: true },
                            actionType: 'SEND_S140'
                        };
                    } catch (e) {
                        return { success: false, message: `Erro ao preparar S-140: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'SEND_S89': {
                    const { weekId } = action.params;
                    if (!weekId) return { success: false, message: 'Semana não especificada.' };

                    try {
                        const weekParts = parts.filter(p => p.weekId === weekId && (p.resolvedPublisherName || p.rawPublisherName));

                        let count = 0;
                        for (const part of weekParts) {
                            // Parte derivada do presidente: auto-atribuída ao mesmo publicador.
                            // Nenhum cartão S-89 deve ser emitido para essas partes — o
                            // presidente já recebe o cartão da designação "Presidente" (seq=1).
                            if (part.isChairmanDerived === true) continue;

                            const pType = (part.tipoParte || '').toLowerCase();
                            const pSection = (part.section || '').toLowerCase();

                            // Pular partes automáticas (cânticos, comentários) — mas NÃO presidente
                            const isAutoAdminPart =
                                pType.includes('cântico') ||
                                pType.includes('cantico') ||
                                pType.includes('comentários') ||
                                pType.includes('comentarios');

                            const isFinalPrayer = pType.includes('oração final') || pType.includes('oracao final');

                            if (isAutoAdminPart && !isFinalPrayer) continue;

                            const isStudent = pSection.includes('ministério') ||
                                pSection.includes('ministerio') ||
                                pType.includes('leitura') ||
                                pType.includes('conversa') ||
                                pType.includes('revisita') ||
                                pType.includes('estudo');

                            const { content, phone } = await communicationService.prepareS89Message(part, publishers, weekParts);

                            await communicationService.logNotification({
                                type: 'S89',
                                recipient_name: part.resolvedPublisherName || part.rawPublisherName,
                                recipient_phone: phone,
                                title: `S-89: ${part.tipoParte}`,
                                content: content,
                                status: 'PREPARED',
                                metadata: {
                                    weekId,
                                    partId: part.id,
                                    isStudent: isStudent
                                },
                                action_url: phone ? communicationService.generateWhatsAppUrl(phone, content) : undefined
                            });
                            count++;
                        }

                        return {
                            success: true,
                            message: `**Designações da Semana ${weekId}**: Abrindo ferramenta de cartões...`,
                            data: { weekId, openModal: true },
                            actionType: 'SEND_S89'
                        };
                    } catch (e) {
                        return { success: false, message: `Erro ao preparar S-89: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'FETCH_DATA': {
                    const { table, select, filters, limit, order, context } = action.params;

                    try {
                        let tablesToQuery = [table];
                        if (context) {
                            tablesToQuery = dataDiscoveryService.getTableFromContext(context);
                        }

                        if (!tablesToQuery[0] && !table) {
                            return { success: false, message: 'Tabela ou Contexto não especificado para FETCH_DATA.' };
                        }

                        const results: Record<string, any[]> = {};
                        for (const t of tablesToQuery) {
                            results[t] = await dataDiscoveryService.fetchData({
                                table: t,
                                select,
                                filters,
                                limit: limit || 50,
                                order
                            });
                        }

                        return {
                            success: true,
                            message: `**Consulta Realizada**: Dados obtidos dos contextos: ${Object.keys(results).join(', ')}.`,
                            data: results,
                            actionType: 'FETCH_DATA'
                        };
                    } catch (e: any) {
                        console.error('[AgentAction] Fail to fetch data', e);
                        const errMsg = e instanceof Error ? e.message : e?.message || 'Desconhecido';
                        return { success: false, message: `Erro ao buscar dados: ${errMsg}` };
                    }
                }

                case 'MANAGE_SPECIAL_EVENT': {
                    const { action: subAction, eventData, eventId } = action.params;

                    try {
                        if (subAction === 'CREATE_AND_APPLY') {
                            if (!eventData || !eventData.week || !eventData.templateId) {
                                return { success: false, message: 'Faltam dados do evento (week, templateId).' };
                            }

                            const result = await specialEventManagementService.createAndApply(eventData);
                            if (result.affected > 0) {
                                return {
                                    success: true,
                                    message: `**Evento Criado e Aplicado:** "${result.event.theme || result.event.templateId}" na semana ${eventData.week}. ${result.affected} partes foram impactadas.`,
                                    data: { event: result.event, affected: result.affected },
                                    actionType: 'MANAGE_SPECIAL_EVENT'
                                };
                            }

                            return {
                                success: true,
                                message: `**Evento Criado:** "${result.event.theme || result.event.templateId}" para a semana ${eventData.week}. Nota: Nenhuma parte da apostila encontrada para esta semana para aplicar o impacto imediato.`,
                                data: { event: result.event, affected: 0 },
                                actionType: 'MANAGE_SPECIAL_EVENT'
                            };
                        }

                        if (subAction === 'DELETE') {
                            if (!eventId) return { success: false, message: 'Falta o ID do evento para deletar.' };
                            await specialEventManagementService.deleteWithRevert(eventId);
                            return {
                                success: true,
                                message: `**Evento Removido:** O evento foi deletado e seus impactos na apostila foram revertidos.`,
                                actionType: 'MANAGE_SPECIAL_EVENT'
                            };
                        }

                        return { success: false, message: `Sub-ação "${subAction}" não implementada para MANAGE_SPECIAL_EVENT.` };

                    } catch (e) {
                        console.error('[AgentAction] Fail to manage special event', e);
                        return { success: false, message: `Erro ao gerenciar evento especial: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'SIMULATE_ASSIGNMENT': {
                    // Dry-run: simula a designação sem gravar no banco
                    const simPartId = action.params.partId;
                    const simPubName = action.params.publisherName;
                    const simWeekId = action.params.weekId || contextWeekId;
                    const simPart = parts.find(p => p.id === simPartId) ||
                        parts.filter(p => p.weekId === simWeekId).find(p =>
                            (p.tituloParte || '').toLowerCase().includes((simPartId || '').toLowerCase())
                        );
                    if (!simPart) {
                        return { success: false, message: `Parte não encontrada para simulação (ID: ${simPartId})` };
                    }
                    if (!isManuallyAssignable(simPart.tipoParte)) {
                        return { success: false, message: `"${simPart.tituloParte || simPart.tipoParte}" é uma parte automática/não-designável; não pode ser simulada.` };
                    }
                    const simPub = publishers.find(p => p.name.toLowerCase().includes((simPubName || '').toLowerCase().trim()));
                    if (!simPub && simPubName) {
                        return { success: false, message: `Publicador '${simPubName}' não encontrado para simulação.` };
                    }
                    return {
                        success: true,
                        message: `**Simulação:** ${simPub?.name || simPubName} seria designado(a) para "${simPart.tituloParte}" na semana ${simWeekId}. Nenhuma alteração foi salva.`,
                        data: { partId: simPart.id, simulatedAssignee: simPub?.name || simPubName, weekId: simWeekId },
                        actionType: 'SIMULATE_ASSIGNMENT'
                    };
                }

                case 'ASSIGN_PART': {
                    let { partId, publisherId, publisherName, weekId, partName } = action.params;
                    let targetPart = parts.find(p => p.id === partId);

                    // Se não encontrou por ID, mas partId parece um nome/título, tratar como tal
                    if (!targetPart && partId && !partName) {
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partId);
                        if (!isUUID) {
                            partName = partId;
                            if (!weekId) weekId = contextWeekId;
                        }
                    }

                    if (!targetPart && weekId && partName) {
                        const candidates = parts.filter(p => p.weekId === weekId);
                        const qName = partName.toLowerCase().trim();

                        const PART_ALIASES: Record<string, string[]> = {
                            'presidente da reunião': ['presidente', 'chairman', 'chairperson'],
                            'oração final': ['oração', 'oracao final', 'oracao'],
                            'comentários iniciais': ['comentarios iniciais'],
                            'comentários finais': ['comentarios finais'],
                        };

                        let expandedNames = [qName];
                        for (const [canonical, aliases] of Object.entries(PART_ALIASES)) {
                            if (aliases.includes(qName) || qName === canonical) {
                                expandedNames = [canonical, ...aliases, qName];
                                break;
                            }
                        }

                        targetPart = candidates.find(p => {
                            const pTitle = (p.tituloParte || '').toLowerCase();
                            const pType = (p.tipoParte || '').toLowerCase();
                            const pSection = (p.section || '').toLowerCase();

                            for (const query of expandedNames) {
                                // Match exato ou parcial no título (ex: "4. Iniciando conversas")
                                if (pTitle && pTitle.includes(query)) return true;
                                if (pType && pType.includes(query)) return true;

                                // Match numérico (ex: usuário diz "parte 4")
                                const numMatch = query.match(/(\d+)/);
                                if (numMatch) {
                                    const num = numMatch[1];
                                    if (pTitle.startsWith(num + '.') || pTitle.includes(' ' + num + ' ')) return true;
                                }

                                if (pType && pType === query) return true;
                                if (pTitle && pTitle.length > 3 && query.includes(pTitle)) return true;
                                if (pType && pType.length > 3 && query.includes(pType)) return true;
                                if (pSection && pSection.toLowerCase().includes(query)) return true;
                            }
                            return false;
                        });
                    }

                    if (!targetPart) {
                        return { success: false, message: `Parte não encontrada (ID: ${partId} | Nome: ${partName})` };
                    }

                    if (!isManuallyAssignable(targetPart.tipoParte)) {
                        return { success: false, message: `"${targetPart.tituloParte || targetPart.tipoParte}" é uma parte automática/não-designável (ex.: cânticos, orações, comentários do presidente). Não pode ser designada manualmente.` };
                    }

                    // === RESOLUÇÃO DE PUBLICADOR (UUID-first) ===
                    let resolvedName = publisherName;

                    if (publisherName === null || publisherName === undefined || publisherName === '') {
                        // Remover designação
                        resolvedName = '';
                    } else if (publisherId) {
                        // Nível 1: UUID direto fornecido — busca no array pelo ID
                        const pubById = publishers.find(p => p.id === publisherId);
                        if (pubById) {
                            console.log(`[ASSIGN_PART] Resolução por publisherId (UUID): ${pubById.name}`);
                            resolvedName = pubById.name;
                        } else {
                            console.warn(`[ASSIGN_PART] publisherId ${publisherId} não encontrado no array local, tentando nome`);
                            // Fallback: usa o nome
                        }
                    }

                    if (resolvedName && resolvedName !== '' && !publisherId) {
                        // Nível 2: Sem UUID — normaliza nome (remove acentos, lowercase) e faz match
                        const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                        const qNorm = normalize(publisherName!);

                        // Match exato normalizado
                        let pub = publishers.find(p => normalize(p.name) === qNorm);

                        // Match startsWith (nome parcial, ex: "Eliezer" → "Eliezer Rosa")
                        if (!pub) pub = publishers.find(p => normalize(p.name).startsWith(qNorm));

                        // Match contains (último recurso)
                        if (!pub) pub = publishers.find(p => normalize(p.name).includes(qNorm));

                        if (pub) {
                            console.log(`[ASSIGN_PART] Resolução por nome normalizado: "${publisherName}" → "${pub.name}" (${pub.id})`);
                            resolvedName = pub.name;
                        } else {
                            return { success: false, message: `Publicador '${publisherName}' não encontrado (nome normalizado: '${qNorm}').` };
                        }
                    }

                    if (resolvedName) {
                        undoService.captureSingle(targetPart, `Agente: Designar ${resolvedName}`);
                    }

                    const { unifiedActionService } = await import('./unifiedActionService');
                    let actionResult;
                    if (resolvedName) {
                        actionResult = await unifiedActionService.executeDesignation(
                            targetPart.id,
                            resolvedName,
                            'AGENT',
                            'Solicitado via Chat',
                            publisherId // Passa o ID se disponível
                        );
                    } else {
                        actionResult = await unifiedActionService.revertDesignation(
                            targetPart.id,
                            'AGENT',
                            'Solicitado via Chat (Remover)'
                        );
                    }

                    if (!actionResult.success) {
                        const errMsg = actionResult.error || 'Erro na designação';
                        return {
                            success: false,
                            message: `❌ Designação NÃO efetivada para "${targetPart.tituloParte || targetPart.tipoParte}". Motivo: ${errMsg}`
                        };
                    }

                    if (resolvedName) {
                        try {
                            await markManualSelection(
                                resolvedName,
                                targetPart.tipoParte,
                                targetPart.weekId,
                                targetPart.date
                            );
                        } catch (e) {
                            console.warn('[AgentAction] Erro ao marcar seleção manual:', e);
                        }
                    }

                    // POST-VERIFY: refetch a parte do banco e confirma que o nome bate.
                    // Evita que o agente narre sucesso quando o write silenciosamente
                    // não persistiu (race condition, RLS, etc.).
                    let persistedName: string | null = null;
                    try {
                        const { supabase } = await import('../lib/supabase');
                        const { data: row } = await supabase
                            .from('workbook_parts')
                            .select('resolved_publisher_name, status')
                            .eq('id', targetPart.id)
                            .maybeSingle();
                        persistedName = row?.resolved_publisher_name || null;
                        if (resolvedName && persistedName !== resolvedName) {
                            console.warn(`[ASSIGN_PART] Post-verify mismatch: esperado="${resolvedName}" persistido="${persistedName}"`);
                            return {
                                success: false,
                                message: `⚠️ Designação reportou sucesso mas o banco mostra "${persistedName || '(vazio)'}" em vez de "${resolvedName}". Verifique a parte manualmente.`
                            };
                        }
                    } catch (verifyErr) {
                        console.warn('[ASSIGN_PART] Post-verify falhou (não bloqueante):', verifyErr);
                    }

                    const warnsText = actionResult.warnings && actionResult.warnings.length > 0
                        ? ` (avisos: ${actionResult.warnings.join('; ')})`
                        : '';

                    return {
                        success: true,
                        message: resolvedName
                            ? `✅ Designação efetivada: "${targetPart.tituloParte || targetPart.tipoParte}" → ${resolvedName}${warnsText}`
                            : '✅ Designação removida.',
                        data: { partId: targetPart.id, assignedTo: resolvedName, persistedName },
                        actionType: 'ASSIGN_PART'
                    };
                }

                case 'NAVIGATE_WEEK': {
                    const { weekId } = action.params;
                    // 2026-05-25: validate weekId exists in loaded workbook — without this,
                    // the action always "succeeds" but S-140 carousel never updates (weekOrder.indexOf = -1).
                    const weekExists = parts.some(p => p.weekId === weekId);
                    if (!weekExists) {
                        const weeks = [...new Set(parts.map(p => p.weekId))].sort();
                        const first = weeks[0] ?? '?';
                        const last = weeks[weeks.length - 1] ?? '?';
                        return {
                            success: false,
                            message: `Semana "${weekId}" não está na apostila carregada (${first} → ${last}). Verifique se a semana existe ou recarregue a apostila.`,
                            actionType: 'NAVIGATE_WEEK'
                        };
                    }
                    return {
                        success: true,
                        message: `Navegando para semana ${weekId}`,
                        data: { weekId },
                        actionType: 'NAVIGATE_WEEK'
                    };
                }

                case 'VIEW_S140':
                case 'SHARE_S140_WHATSAPP': {
                    const { weekId } = action.params;
                    return {
                        success: true,
                        message: action.type === 'VIEW_S140'
                            ? `Visualizando S-140 da semana ${weekId}`
                            : `Compartilhando S-140 da semana ${weekId}`,
                        data: { weekId },
                        actionType: action.type
                    };
                }

                case 'NOTIFY_REFUSAL': {
                    let { partId, weekId, partName, reason } = action.params;
                    let targetPart = parts.find(p => p.id === partId);

                    if (!targetPart && (partId || partName)) {
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partId || '');
                        if (!isUUID) {
                            partName = partId || partName;
                            if (!weekId) weekId = contextWeekId;
                        }

                        if (weekId && partName) {
                            const candidates = parts.filter(p => p.weekId === weekId);
                            const qName = partName.toLowerCase().trim();
                            targetPart = candidates.find(p => {
                                const pTitle = (p.tituloParte || '').toLowerCase();
                                const pType = (p.tipoParte || '').toLowerCase();
                                return pTitle.includes(qName) || pType.includes(qName);
                            });
                        }
                    }

                    if (!targetPart) {
                        return { success: false, message: `Parte não encontrada para notificação de recusa.` };
                    }

                    try {
                        await communicationService.notifyOverseerOfRefusal(targetPart, reason || 'Não informado via Agente');

                        return {
                            success: true,
                            message: `**Alerta Enviado:** O Superintendente (Edmardo) foi notificado sobre a recusa da parte "${targetPart.tipoParte}" e recebeu o link para selecionar um substituto.`,
                            data: { partId: targetPart.id },
                            actionType: 'NOTIFY_REFUSAL'
                        };
                    } catch (e) {
                        console.error('[AgentAction] Fail to notify refusal', e);
                        return { success: false, message: `Erro ao enviar alerta de recusa: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'MANAGE_LOCAL_NEEDS': {
                    const { subAction, theme, assigneeName, targetWeek, preassignmentId, newPosition } = action.params;

                    try {
                        switch (subAction) {
                            case 'LIST': {
                                const queue = await localNeedsService.getPendingQueue();
                                const history = await localNeedsService.getAssignedHistory();
                                const queueText = queue.length > 0
                                    ? queue.map((ln, i) => `${i + 1}. **${ln.theme}** → ${ln.assigneeName}${ln.targetWeek ? ` (Semana: ${ln.targetWeek})` : ''}`).join('\n')
                                    : 'Fila vazia.';
                                const histText = history.length > 0
                                    ? history.slice(0, 10).map(ln => `- ${ln.theme} → ${ln.assigneeName} (${ln.assignedAt?.split('T')[0] || '?'})`).join('\n')
                                    : 'Nenhum histórico.';
                                return {
                                    success: true,
                                    message: `**Fila Pendente (${queue.length}):**\n${queueText}\n\n**Histórico Recente:**\n${histText}`,
                                    data: { queue, history: history.slice(0, 10) },
                                    actionType: 'MANAGE_LOCAL_NEEDS'
                                };
                            }
                            case 'ADD': {
                                if (!theme || !assigneeName) {
                                    return { success: false, message: 'Faltam parâmetros: theme e assigneeName são obrigatórios.' };
                                }
                                const newItem = await localNeedsService.addToQueue(theme, assigneeName, targetWeek || null);
                                return {
                                    success: true,
                                    message: `**Adicionado à fila:** "${theme}" → ${assigneeName} (posição #${newItem.orderPosition})`,
                                    data: newItem,
                                    actionType: 'MANAGE_LOCAL_NEEDS'
                                };
                            }
                            case 'REMOVE': {
                                if (!preassignmentId) {
                                    return { success: false, message: 'Faltam parâmetros: preassignmentId.' };
                                }
                                await localNeedsService.remove(preassignmentId);
                                return {
                                    success: true,
                                    message: `**Removido da fila** com sucesso.`,
                                    actionType: 'MANAGE_LOCAL_NEEDS'
                                };
                            }
                            case 'REORDER': {
                                if (!preassignmentId || newPosition === undefined) {
                                    return { success: false, message: 'Faltam parâmetros: preassignmentId e newPosition.' };
                                }
                                await localNeedsService.reorder(preassignmentId, newPosition);
                                return {
                                    success: true,
                                    message: `**Fila reordenada:** Item movido para posição #${newPosition}.`,
                                    actionType: 'MANAGE_LOCAL_NEEDS'
                                };
                            }
                            default:
                                return { success: false, message: `Sub-ação desconhecida para MANAGE_LOCAL_NEEDS: ${subAction}. Use LIST, ADD, REMOVE ou REORDER.` };
                        }
                    } catch (e: any) {
                        console.error('[AgentAction] Fail to manage local needs', e);
                        return { success: false, message: `Erro ao gerenciar necessidades locais: ${e?.message || 'Desconhecido'}` };
                    }
                }

                case 'GET_ANALYTICS': {
                    const { publisherName, startDate, endDate, tipoParte, compare } = action.params;

                    try {
                        if (compare && Array.isArray(compare) && compare.length > 0) {
                            const data = await participationAnalyticsService.comparePublishers(compare, {
                                startDate, endDate, tipoParte
                            });
                            const rows = data.publishers.map(p =>
                                `| ${p.name} | ${p.totalParticipations} | ${p.asTitular} | ${p.asAjudante} | ${p.lastParticipation || 'Nunca'} |`
                            ).join('\n');
                            return {
                                success: true,
                                message: `**Comparação (${data.periodStart} a ${data.periodEnd}):**\n\n| Nome | Total | Titular | Ajudante | Última |\n|------|-------|---------|----------|--------|\n${rows}`,
                                data,
                                actionType: 'GET_ANALYTICS'
                            };
                        }

                        if (publisherName) {
                            const stats = await participationAnalyticsService.getPublisherStats(publisherName, {
                                startDate, endDate, tipoParte
                            });
                            const tipoBreakdown = Object.entries(stats.byTipoParte)
                                .sort((a, b) => b[1] - a[1])
                                .map(([tipo, count]) => `- ${tipo}: ${count}x`)
                                .join('\n');
                            return {
                                success: true,
                                message: `**Estatísticas de ${stats.name}:**\n- Total: ${stats.totalParticipations} (${stats.asTitular} Titular, ${stats.asAjudante} Ajudante)\n- Última participação: ${stats.lastParticipation || 'Nunca'}\n\n**Por tipo de parte:**\n${tipoBreakdown || 'Nenhuma participação registrada.'}`,
                                data: stats,
                                actionType: 'GET_ANALYTICS'
                            };
                        }

                        // General: list distinct publishers, modalidades, tipos
                        const [distinctPubs, distinctTipos] = await Promise.all([
                            participationAnalyticsService.getDistinctPublishers(),
                            participationAnalyticsService.getDistinctTiposParte()
                        ]);
                        return {
                            success: true,
                            message: `**Dados disponíveis para analytics:**\n- ${distinctPubs.length} publicadores com participações\n- ${distinctTipos.length} tipos de parte: ${distinctTipos.slice(0, 15).join(', ')}${distinctTipos.length > 15 ? '...' : ''}\n\nUse com publisherName ou compare para ver detalhes.`,
                            data: { totalPublishers: distinctPubs.length, tiposParte: distinctTipos },
                            actionType: 'GET_ANALYTICS'
                        };
                    } catch (e: any) {
                        console.error('[AgentAction] Fail to get analytics', e);
                        return { success: false, message: `Erro ao buscar analytics: ${e?.message || 'Desconhecido'}` };
                    }
                }

                case 'IMPORT_WORKBOOK': {
                    try {
                        const subAction = action.params.subAction || 'IMPORT';
                        const weekDateStr = action.params.weekDate; // YYYY-MM-DD
                        const weeksCount = action.params.weeks || 1;

                        if (!weekDateStr) {
                            return { success: false, message: 'Parâmetro weekDate (YYYY-MM-DD) é obrigatório.' };
                        }

                        const weekDate = new Date(weekDateStr + 'T12:00:00');
                        if (isNaN(weekDate.getTime())) {
                            return { success: false, message: `Data inválida: ${weekDateStr}` };
                        }

                        if (subAction === 'PREVIEW') {
                            // Apenas busca e mostra sem salvar
                            const result = await fetchWorkbookFromJwOrg(weekDate);
                            if (!result.success) {
                                return { success: false, message: `Erro ao buscar apostila: ${result.error}` };
                            }
                            const summary = result.parts
                                .filter(p => p.funcao === 'Titular')
                                .map(p => `- **${p.tipoParte}**: ${p.tituloParte} (${p.duracao} min)`)
                                .join('\n');
                            return {
                                success: true,
                                message: `**Prévia da Apostila — ${result.weekDisplay}**\n${result.totalParts} partes encontradas:\n\n${summary}\n\nDeseja que eu importe essas partes para o banco?`,
                                data: { parts: result.parts, weekId: result.weekId, weekDisplay: result.weekDisplay, preview: true },
                                actionType: 'IMPORT_WORKBOOK'
                            };
                        }

                        if (weeksCount > 1) {
                            // Import múltiplas semanas
                            const results = await importMultipleWeeks(weekDate, weeksCount);
                            const successes = results.filter(r => r.success);
                            const failures = results.filter(r => !r.success);
                            let msg = `**Importação de ${results.length} semanas:**\n`;
                            successes.forEach(r => { msg += `\n✅ ${r.weekDisplay}: ${r.totalParts} partes`; });
                            failures.forEach(r => { msg += `\n❌ ${r.weekDisplay || 'Semana'}: ${r.error}`; });
                            return {
                                success: successes.length > 0,
                                message: msg,
                                data: { results, totalImported: successes.reduce((a, r) => a + r.totalParts, 0) },
                                actionType: 'IMPORT_WORKBOOK'
                            };
                        }

                        // Import single week
                        const result = await importWorkbookFromJwOrg(weekDate);
                        return {
                            success: result.success,
                            message: result.message,
                            data: { weekId: result.weekId, weekDisplay: result.weekDisplay, totalParts: result.totalParts },
                            actionType: 'IMPORT_WORKBOOK'
                        };
                    } catch (e: any) {
                        console.error('[AgentAction] IMPORT_WORKBOOK error:', e);
                        return { success: false, message: `Erro ao importar apostila: ${e?.message || 'Desconhecido'}` };
                    }
                }

                // ===== CRUD DE PARTES DA APOSTILA =====
                case 'MANAGE_WORKBOOK_PART': {
                    try {
                        const subAction = (action.params.subAction || '').toUpperCase();
                        const partId = action.params.partId;

                        if (!partId) {
                            return { success: false, message: 'Parâmetro partId é obrigatório.' };
                        }

                        const part = await workbookManagementService.getPart(partId);
                        if (!part) {
                            return { success: false, message: `Parte não encontrada: ${partId}` };
                        }

                        switch (subAction) {
                            case 'UPDATE': {
                                const updates: Record<string, any> = {};
                                if (action.params.tipoParte !== undefined) updates.tipoParte = action.params.tipoParte;
                                if (action.params.tituloParte !== undefined) updates.tituloParte = action.params.tituloParte;
                                if (action.params.descricaoParte !== undefined) updates.descricaoParte = action.params.descricaoParte;
                                if (action.params.duracao !== undefined) updates.duracao = action.params.duracao;
                                if (action.params.status !== undefined) updates.status = action.params.status;
                                if (action.params.rawPublisherName !== undefined) updates.rawPublisherName = action.params.rawPublisherName;

                                if (Object.keys(updates).length === 0) {
                                    return { success: false, message: 'Nenhum campo para atualizar.' };
                                }

                                const updated = await workbookManagementService.updatePart(partId, updates);
                                return {
                                    success: true,
                                    message: `✅ Parte "${part.tipoParte}" (seq ${part.seq}) atualizada.`,
                                    data: { part: updated },
                                    actionType: 'MANAGE_WORKBOOK_PART'
                                };
                            }
                            case 'DELETE': {
                                await workbookManagementService.deletePart(partId);
                                return {
                                    success: true,
                                    message: `✅ Parte "${part.tipoParte}" (seq ${part.seq}) excluída.`,
                                    actionType: 'MANAGE_WORKBOOK_PART'
                                };
                            }
                            case 'CANCEL': {
                                const cancelled = await workbookManagementService.cancelPart(partId, action.params.reason || 'Cancelada pelo agente');
                                return {
                                    success: true,
                                    message: `✅ Parte "${part.tipoParte}" marcada como CANCELADA.`,
                                    data: { part: cancelled },
                                    actionType: 'MANAGE_WORKBOOK_PART'
                                };
                            }
                            case 'GET': {
                                return {
                                    success: true,
                                    message: `**${part.tipoParte}** (${part.funcao})\n- Título: ${part.tituloParte || '—'}\n- Seção: ${part.section}\n- Duração: ${part.duracao} min\n- Status: ${part.status}\n- Designado: ${part.resolvedPublisherName || part.rawPublisherName || '—'}`,
                                    data: { part },
                                    actionType: 'MANAGE_WORKBOOK_PART'
                                };
                            }
                            default:
                                return { success: false, message: `subAction inválida: "${subAction}". Use UPDATE, DELETE, CANCEL ou GET.` };
                        }
                    } catch (e: any) {
                        console.error('[AgentAction] MANAGE_WORKBOOK_PART error:', e);
                        return { success: false, message: `Erro ao gerenciar parte: ${e?.message || 'Desconhecido'}` };
                    }
                }

                case 'MANAGE_WORKBOOK_WEEK': {
                    try {
                        const subAction = (action.params.subAction || '').toUpperCase();
                        const weekId = action.params.weekId;

                        if (!weekId) {
                            return { success: false, message: 'Parâmetro weekId (YYYY-MM-DD) é obrigatório.' };
                        }

                        switch (subAction) {
                            case 'LIST': {
                                const weekParts = await workbookManagementService.listWeekParts(weekId);
                                if (weekParts.length === 0) {
                                    return { success: true, message: `Nenhuma parte encontrada para semana ${weekId}.`, data: { parts: [] }, actionType: 'MANAGE_WORKBOOK_WEEK' };
                                }
                                const titulares = weekParts.filter(p => p.funcao === 'Titular');
                                const ajudantes = weekParts.filter(p => p.funcao === 'Ajudante');
                                const summarizePart = (p: WorkbookPart) =>
                                    `- **${p.tipoParte}**: ${p.tituloParte || '—'} | ${p.resolvedPublisherName || p.rawPublisherName || '🟥 VAGA'} | ${p.status}`;
                                const summaryTitulares = titulares.map(summarizePart).join('\n');
                                const summaryAjudantes = ajudantes.length > 0
                                    ? `\n\n**Ajudantes (${ajudantes.length}):**\n` + ajudantes.map(summarizePart).join('\n')
                                    : '';
                                const summary = summaryTitulares + summaryAjudantes;
                                return {
                                    success: true,
                                    message: `**Semana ${weekId}** — ${weekParts.length} partes (${titulares.length} titulares, ${ajudantes.length} ajudantes):\n\n${summary}`,
                                    data: { parts: weekParts, totalParts: weekParts.length },
                                    actionType: 'MANAGE_WORKBOOK_WEEK'
                                };
                            }
                            case 'DELETE_WEEK': {
                                const result = await workbookManagementService.deleteWeek(weekId);
                                if (result.parts.length === 0) {
                                    return { success: false, message: `Nenhuma parte encontrada para semana ${weekId}.` };
                                }
                                return {
                                    success: true,
                                    message: `✅ ${result.deletedCount} partes da semana ${weekId} excluídas.`,
                                    data: { deletedCount: result.deletedCount },
                                    actionType: 'MANAGE_WORKBOOK_WEEK'
                                };
                            }
                            case 'CANCEL_WEEK': {
                                await workbookManagementService.cancelWeek(weekId);
                                return {
                                    success: true,
                                    message: `✅ Todas as partes da semana ${weekId} marcadas como CANCELADA.`,
                                    actionType: 'MANAGE_WORKBOOK_WEEK'
                                };
                            }
                            case 'RESET_WEEK': {
                                await workbookManagementService.resetWeek(weekId);
                                return {
                                    success: true,
                                    message: `✅ Semana ${weekId} resetada para PENDENTE (designações removidas).`,
                                    actionType: 'MANAGE_WORKBOOK_WEEK'
                                };
                            }
                            case 'REIMPORT': {
                                const result = await workbookManagementService.reimportWeek(weekId);
                                return {
                                    success: result.importResult.success,
                                    message: result.importResult.success
                                        ? `✅ Semana ${weekId} reimportada: ${result.deletedCount} partes antigas excluídas, ${result.importResult.totalParts} novas importadas.`
                                        : `Erro ao reimportar: ${result.importResult.error}`,
                                    data: { deletedCount: result.deletedCount, importedCount: result.importResult.totalParts },
                                    actionType: 'MANAGE_WORKBOOK_WEEK'
                                };
                            }
                            default:
                                return { success: false, message: `subAction inválida: "${subAction}". Use LIST, DELETE_WEEK, CANCEL_WEEK, RESET_WEEK ou REIMPORT.` };
                        }
                    } catch (e: any) {
                        console.error('[AgentAction] MANAGE_WORKBOOK_WEEK error:', e);
                        return { success: false, message: `Erro ao gerenciar semana: ${e?.message || 'Desconhecido'}` };
                    }
                }

                case 'MANAGE_PERMISSIONS': {
                    // Defesa em profundidade: somente Admin pode gerenciar permissões via chat
                    if (!gate.isFullAdmin()) {
                        return { success: false, message: 'Apenas o Administrador pode gerenciar políticas e overrides de permissões.' };
                    }

                    const { target, subAction, id, profileEmail, payload } = action.params || {};
                    const t = String(target || '').toLowerCase();
                    const sub = String(subAction || '').toUpperCase();

                    try {
                        // ===== POLICIES =====
                        if (t === 'policy' || t === 'policies') {
                            switch (sub) {
                                case 'LIST': {
                                    const list = await permissionPolicyService.listPolicies();
                                    const summary = list.map(p =>
                                        `• [${p.is_active ? 'ativa' : 'inativa'}] (#${p.priority}) ${p.target_condition || '*'} / ${p.target_funcao || '*'} → tabs:[${p.allowed_tabs.join(',') || '∅'}] actions:[${p.allowed_agent_actions.length}] blocked:[${p.blocked_agent_actions.length}] data:${p.data_access_level}${p.can_see_sensitive_data ? ' +sensitive' : ''}  · id=${p.id}`
                                    ).join('\n');
                                    return {
                                        success: true,
                                        message: `**Políticas de Permissão (${list.length}):**\n${summary || '(nenhuma política cadastrada)'}`,
                                        data: { policies: list },
                                        actionType: 'MANAGE_PERMISSIONS'
                                    };
                                }
                                case 'GET': {
                                    if (!id) return { success: false, message: 'Falta o id da política.' };
                                    const p = await permissionPolicyService.getPolicy(id);
                                    if (!p) return { success: false, message: `Política ${id} não encontrada.` };
                                    return { success: true, message: `Política ${id} obtida.`, data: { policy: p }, actionType: 'MANAGE_PERMISSIONS' };
                                }
                                case 'CREATE': {
                                    if (!payload || typeof payload !== 'object') return { success: false, message: 'Falta o payload da política.' };
                                    const created = await permissionPolicyService.createPolicy(payload);
                                    await auditService.logAction({
                                        table_name: 'permission_policies',
                                        record_id: created.id,
                                        operation: 'AGENT_INTENT',
                                        new_data: created as any,
                                        description: `CREATE policy ${created.target_condition || '*'}/${created.target_funcao || '*'}`
                                    });
                                    return {
                                        success: true,
                                        message: `**Política criada** (id=${created.id}, prio=${created.priority}) — alvo: ${created.target_condition || '*'} / ${created.target_funcao || '*'}.`,
                                        data: { policy: created },
                                        actionType: 'MANAGE_PERMISSIONS'
                                    };
                                }
                                case 'UPDATE': {
                                    if (!id) return { success: false, message: 'Falta o id da política.' };
                                    if (!payload || typeof payload !== 'object') return { success: false, message: 'Falta o payload com alterações.' };
                                    const before = await permissionPolicyService.getPolicy(id);
                                    if (!before) return { success: false, message: `Política ${id} não encontrada.` };
                                    const updated = await permissionPolicyService.updatePolicy(id, payload);
                                    await auditService.logAction({
                                        table_name: 'permission_policies',
                                        record_id: id,
                                        operation: 'AGENT_INTENT',
                                        new_data: { before, after: updated } as any,
                                        description: 'UPDATE policy'
                                    });
                                    return {
                                        success: true,
                                        message: `**Política atualizada** (id=${id}).`,
                                        data: { policy: updated },
                                        actionType: 'MANAGE_PERMISSIONS'
                                    };
                                }
                                case 'DELETE': {
                                    if (!id) return { success: false, message: 'Falta o id da política.' };
                                    const before = await permissionPolicyService.getPolicy(id);
                                    if (!before) return { success: false, message: `Política ${id} não encontrada.` };
                                    await permissionPolicyService.deletePolicy(id);
                                    await auditService.logAction({
                                        table_name: 'permission_policies',
                                        record_id: id,
                                        operation: 'AGENT_INTENT',
                                        new_data: { deleted: before } as any,
                                        description: 'DELETE policy'
                                    });
                                    return {
                                        success: true,
                                        message: `**Política removida** (id=${id}).`,
                                        actionType: 'MANAGE_PERMISSIONS'
                                    };
                                }
                                case 'TOGGLE_ACTIVE':
                                case 'TOGGLE': {
                                    if (!id) return { success: false, message: 'Falta o id da política.' };
                                    const updated = await permissionPolicyService.togglePolicy(id);
                                    await auditService.logAction({
                                        table_name: 'permission_policies',
                                        record_id: id,
                                        operation: 'AGENT_INTENT',
                                        new_data: { is_active: updated.is_active } as any,
                                        description: `TOGGLE policy → ${updated.is_active ? 'ATIVA' : 'INATIVA'}`
                                    });
                                    return {
                                        success: true,
                                        message: `Política ${id} agora está **${updated.is_active ? 'ATIVA' : 'INATIVA'}**.`,
                                        data: { policy: updated },
                                        actionType: 'MANAGE_PERMISSIONS'
                                    };
                                }
                                default:
                                    return { success: false, message: `subAction inválida para policies: "${sub}". Use LIST, GET, CREATE, UPDATE, DELETE ou TOGGLE_ACTIVE.` };
                            }
                        }

                        // ===== OVERRIDES =====
                        if (t === 'override' || t === 'overrides') {
                            switch (sub) {
                                case 'LIST': {
                                    const list = await permissionPolicyService.listOverrides();
                                    const summary = list.map(o =>
                                        `• [${o.is_active ? 'ativo' : 'inativo'}] profile=${o.profile_id} tabs:[${(o.allowed_tabs || []).join(',') || '—'}] +actions:[${(o.allowed_agent_actions || []).length}] −actions:[${(o.blocked_agent_actions || []).length}] data:${o.data_access_level || '—'} · id=${o.id}`
                                    ).join('\n');
                                    return {
                                        success: true,
                                        message: `**Overrides de Permissão (${list.length}):**\n${summary || '(nenhum override cadastrado)'}`,
                                        data: { overrides: list },
                                        actionType: 'MANAGE_PERMISSIONS'
                                    };
                                }
                                case 'GET': {
                                    if (!id) return { success: false, message: 'Falta o id do override.' };
                                    const o = await permissionPolicyService.getOverride(id);
                                    if (!o) return { success: false, message: `Override ${id} não encontrado.` };
                                    return { success: true, message: `Override ${id} obtido.`, data: { override: o }, actionType: 'MANAGE_PERMISSIONS' };
                                }
                                case 'CREATE': {
                                    if (!payload || typeof payload !== 'object') return { success: false, message: 'Falta o payload do override.' };
                                    let profileId: string | undefined = payload.profile_id;
                                    if (!profileId && profileEmail) {
                                        const prof = await permissionPolicyService.findProfileByEmail(String(profileEmail));
                                        if (!prof) return { success: false, message: `Perfil com email "${profileEmail}" não encontrado.` };
                                        profileId = prof.id;
                                    }
                                    if (!profileId) return { success: false, message: 'Forneça profile_id no payload ou profileEmail no params.' };
                                    const created = await permissionPolicyService.createOverride({ ...payload, profile_id: profileId });
                                    await auditService.logAction({
                                        table_name: 'user_permission_overrides',
                                        record_id: created.id,
                                        operation: 'AGENT_INTENT',
                                        new_data: created as any,
                                        description: `CREATE override for ${profileId}`
                                    });
                                    return {
                                        success: true,
                                        message: `**Override criado** para profile_id=${profileId} (id=${created.id}).`,
                                        data: { override: created },
                                        actionType: 'MANAGE_PERMISSIONS'
                                    };
                                }
                                case 'UPDATE': {
                                    if (!id) return { success: false, message: 'Falta o id do override.' };
                                    if (!payload || typeof payload !== 'object') return { success: false, message: 'Falta o payload com alterações.' };
                                    const before = await permissionPolicyService.getOverride(id);
                                    if (!before) return { success: false, message: `Override ${id} não encontrado.` };
                                    const updated = await permissionPolicyService.updateOverride(id, payload);
                                    await auditService.logAction({
                                        table_name: 'user_permission_overrides',
                                        record_id: id,
                                        operation: 'AGENT_INTENT',
                                        new_data: { before, after: updated } as any,
                                        description: 'UPDATE override'
                                    });
                                    return {
                                        success: true,
                                        message: `**Override atualizado** (id=${id}).`,
                                        data: { override: updated },
                                        actionType: 'MANAGE_PERMISSIONS'
                                    };
                                }
                                case 'DELETE': {
                                    if (!id) return { success: false, message: 'Falta o id do override.' };
                                    const before = await permissionPolicyService.getOverride(id);
                                    if (!before) return { success: false, message: `Override ${id} não encontrado.` };
                                    await permissionPolicyService.deleteOverride(id);
                                    await auditService.logAction({
                                        table_name: 'user_permission_overrides',
                                        record_id: id,
                                        operation: 'AGENT_INTENT',
                                        new_data: { deleted: before } as any,
                                        description: 'DELETE override'
                                    });
                                    return {
                                        success: true,
                                        message: `**Override removido** (id=${id}).`,
                                        actionType: 'MANAGE_PERMISSIONS'
                                    };
                                }
                                default:
                                    return { success: false, message: `subAction inválida para overrides: "${sub}". Use LIST, GET, CREATE, UPDATE ou DELETE.` };
                            }
                        }

                        return { success: false, message: `target inválido: "${target}". Use "policy" ou "override".` };
                    } catch (e: any) {
                        console.error('[AgentAction] MANAGE_PERMISSIONS error:', e);
                        return { success: false, message: `Erro ao gerenciar permissões: ${e?.message || 'Desconhecido'}` };
                    }
                }

                // ─────────────────────────────────────────────────────────────────────────
                // QUERY ACTIONS — purely in-memory, no LLM inference, no DB calls
                // ─────────────────────────────────────────────────────────────────────────

                case 'QUERY_PUBLISHER_ASSIGNMENTS': {
                    const { publisherName, fromWeekId, toWeekId, status } = action.params;
                    if (!publisherName) {
                        return { success: false, message: 'Parâmetro publisherName é obrigatório.', actionType: 'QUERY_PUBLISHER_ASSIGNMENTS' };
                    }
                    const norm = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const pubNorm = norm(publisherName);
                    const pub = publishers.find(p => norm(p.name) === pubNorm)
                        || publishers.find(p => norm(p.name).includes(pubNorm) || pubNorm.includes(norm(p.name)));
                    const resolvedName = pub?.name || publisherName;

                    let assigned = parts.filter(p => {
                        // Match por ID (fonte da verdade, captura órfãs e ajudantes sem name)
                        if (pub?.id && p.resolvedPublisherId === pub.id) return true;
                        const pName = p.resolvedPublisherName || p.rawPublisherName || '';
                        return norm(pName) === norm(resolvedName) || norm(pName) === pubNorm;
                    });
                    if (fromWeekId) assigned = assigned.filter(p => (p.weekId || '') >= fromWeekId);
                    if (toWeekId) assigned = assigned.filter(p => (p.weekId || '') <= toWeekId);
                    if (status) assigned = assigned.filter(p => (p.status || '').toUpperCase() === status.toUpperCase());
                    assigned.sort((a, b) => (a.weekId || '').localeCompare(b.weekId || ''));

                    if (assigned.length === 0) {
                        const range = (fromWeekId || toWeekId) ? ` no período ${fromWeekId || '?'}–${toWeekId || '?'}` : '';
                        return {
                            success: true,
                            message: `**Designações de ${resolvedName}:** Nenhuma encontrada${range}.`,
                            data: { publisherName: resolvedName, assignments: [], total: 0 },
                            actionType: 'QUERY_PUBLISHER_ASSIGNMENTS'
                        };
                    }

                    const today = toLocalISODate();
                    const fmtDate = (s: string) => { try { return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return s; } };
                    const secShort = (s: string) => (s || '').replace('Tesouros da Palavra de Deus', 'Tesouros').replace('Faça Seu Melhor no Ministério', 'FSM').replace('Nossa Vida Cristã', 'NVC');

                    const rows = assigned.map(p => {
                        const d = p.date || p.weekId || '';
                        const mark = d < today ? '🕐' : d === today ? '📅' : '📌';
                        const fn = p.funcao === 'Ajudante' ? '🤝 Ajudante' : '⭐ Titular';
                        return `| ${mark} ${fmtDate(d)} | ${fn} | ${secShort(p.section)} | ${p.tituloParte || p.tipoParte} | ${p.status} |`;
                    });

                    const past = assigned.filter(p => (p.date || p.weekId || '') < today).length;
                    const future = assigned.length - past;
                    const lines = [
                        `**Designações de ${resolvedName}** — total: **${assigned.length}** (${past} passadas · ${future} futuras):`,
                        '',
                        '| Data | Função | Seção | Parte | Status |',
                        '|------|--------|-------|-------|--------|',
                        ...rows
                    ];

                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { publisherName: resolvedName, assignments: assigned, total: assigned.length },
                        actionType: 'QUERY_PUBLISHER_ASSIGNMENTS'
                    };
                }

                case 'QUERY_WEEK_ASSIGNMENTS': {
                    const { weekId: wkParam } = action.params;
                    const targetWeekId = wkParam || contextWeekId;
                    if (!targetWeekId) {
                        return { success: false, message: 'Parâmetro weekId é obrigatório.', actionType: 'QUERY_WEEK_ASSIGNMENTS' };
                    }

                    const weekParts = parts.filter(p => p.weekId === targetWeekId);
                    if (weekParts.length === 0) {
                        return {
                            success: true,
                            message: `**Semana ${targetWeekId}:** Nenhuma parte encontrada. A semana pode não ter sido importada ainda.`,
                            data: { weekId: targetWeekId, parts: [], total: 0 },
                            actionType: 'QUERY_WEEK_ASSIGNMENTS'
                        };
                    }

                    const fmtWeekDate = (s: string) => { try { return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return s; } };
                    const secShort2 = (s: string) => (s || '').replace('Tesouros da Palavra de Deus', 'Tesouros').replace('Faça Seu Melhor no Ministério', 'FSM').replace('Nossa Vida Cristã', 'NVC');
                    const statusIcon = (s: string) => {
                        const u = (s || '').toUpperCase();
                        if (u === 'COMPLETA') return '✅';
                        if (u === 'APROVADA') return '✔️';
                        if (u === 'PROPOSTA') return '🔵';
                        if (u === 'CANCELADA') return '❌';
                        return '🔲';
                    };

                    const sections = ['Tesouros da Palavra de Deus', 'Faça Seu Melhor no Ministério', 'Nossa Vida Cristã'];
                    const grouped = new Map<string, WorkbookPart[]>();
                    for (const sec of [...sections, 'Outros']) grouped.set(sec, []);

                    for (const p of weekParts.sort((a, b) => (a.seq || 0) - (b.seq || 0))) {
                        const secKey = sections.find(s => p.section === s) || 'Outros';
                        grouped.get(secKey)!.push(p);
                    }

                    let totalParts = 0;
                    let filled = 0;
                    let pendingCount = 0;
                    const lines: string[] = [];

                    for (const [sec, sparts] of grouped.entries()) {
                        if (sparts.length === 0) continue;
                        const titulares = sparts.filter(p => p.funcao !== 'Ajudante');
                        const ajudantes = sparts.filter(p => p.funcao === 'Ajudante');

                        lines.push(`### ${secShort2(sec)}`);
                        lines.push('| # | Parte | Designado | Ajudante | Status |');
                        lines.push('|---|-------|-----------|---------|--------|');

                        for (const t of titulares) {
                            totalParts++;
                            const aj = ajudantes.find(a => Math.abs((a.seq || 0) - (t.seq || 0)) <= 1);
                            const designado = t.resolvedPublisherName || t.rawPublisherName || '🔲 VAGA';
                            const ajudante = aj ? (aj.resolvedPublisherName || aj.rawPublisherName || '🔲 VAGA') : '—';
                            if (!t.resolvedPublisherName && !t.rawPublisherName) pendingCount++;
                            else filled++;
                            lines.push(`| ${t.seq || ''} | ${t.tituloParte || t.tipoParte} | ${statusIcon(t.status)} ${designado} | ${ajudante} | ${t.status} |`);
                        }
                        lines.push('');
                    }

                    const summary = `_${filled} de ${totalParts} partes designadas — ${pendingCount} pendentes_`;

                    return {
                        success: true,
                        message: [`**Designações — Semana ${fmtWeekDate(targetWeekId)}:**`, '', summary, '', ...lines].join('\n'),
                        data: { weekId: targetWeekId, parts: weekParts, total: totalParts, filled, pending: pendingCount },
                        actionType: 'QUERY_WEEK_ASSIGNMENTS'
                    };
                }

                case 'QUERY_VACANT_PARTS': {
                    const { weekId: vwkParam, fromWeekId: vFrom, toWeekId: vTo } = action.params;
                    const targetWeekId = vwkParam || ((!vFrom && !vTo) ? contextWeekId : undefined);

                    let vacant = parts.filter(p => {
                        const hasDesignee = !!(p.resolvedPublisherName || p.rawPublisherName);
                        const isActive = !['COMPLETA', 'CANCELADA'].includes((p.status || '').toUpperCase());
                        return !hasDesignee && isActive && p.funcao !== 'Ajudante';
                    });

                    if (targetWeekId && !vFrom) vacant = vacant.filter(p => p.weekId === targetWeekId);
                    if (vFrom) vacant = vacant.filter(p => (p.weekId || '') >= vFrom);
                    if (vTo) vacant = vacant.filter(p => (p.weekId || '') <= vTo);
                    vacant.sort((a, b) => (a.weekId || '').localeCompare(b.weekId || '') || (a.seq || 0) - (b.seq || 0));

                    if (vacant.length === 0) {
                        return {
                            success: true,
                            message: `✅ Nenhuma parte pendente encontrada${targetWeekId ? ` na semana ${targetWeekId}` : ''}.`,
                            data: { vacant: [], total: 0 },
                            actionType: 'QUERY_VACANT_PARTS'
                        };
                    }

                    const fmtVDate = (s: string) => { try { return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return s; } };
                    const secShortV = (s: string) => (s || '').replace('Tesouros da Palavra de Deus', 'Tesouros').replace('Faça Seu Melhor no Ministério', 'FSM').replace('Nossa Vida Cristã', 'NVC');

                    const rows = vacant.map(p => `| ${fmtVDate(p.date || p.weekId || '')} | ${secShortV(p.section)} | ${p.tituloParte || p.tipoParte} | ${p.status} |`);
                    const lines = [
                        `**🔲 Partes pendentes** (${vacant.length} total):`,
                        '',
                        '| Semana | Seção | Parte | Status |',
                        '|--------|-------|-------|--------|',
                        ...rows
                    ];

                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { vacant, total: vacant.length },
                        actionType: 'QUERY_VACANT_PARTS'
                    };
                }

                case 'QUERY_ELIGIBILITY': {
                    const { publisherName: eligPub, partId: eligPartId, partType: eligPartType, weekId: eligWkId } = action.params;
                    if (!eligPub) {
                        return { success: false, message: 'Parâmetro publisherName é obrigatório.', actionType: 'QUERY_ELIGIBILITY' };
                    }

                    const normE = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const pub = publishers.find(p => normE(p.name) === normE(eligPub))
                        || publishers.find(p => normE(p.name).includes(normE(eligPub)) || normE(eligPub).includes(normE(p.name)));

                    if (!pub) {
                        return { success: false, message: `Publicador "${eligPub}" não encontrado.`, actionType: 'QUERY_ELIGIBILITY' };
                    }

                    let part: WorkbookPart | undefined;
                    if (eligPartId) {
                        part = parts.find(p => p.id === eligPartId);
                    } else if (eligPartType) {
                        const targetWk = eligWkId || contextWeekId;
                        const pt = normE(eligPartType);
                        part = parts.find(p =>
                            (!targetWk || p.weekId === targetWk) &&
                            (normE(p.tipoParte) === pt || normE(p.tituloParte || '') === pt)
                        );
                    }

                    if (!part) {
                        return { success: false, message: `Parte não encontrada. Informe partId ou partType (com weekId opcional).`, actionType: 'QUERY_ELIGIBILITY' };
                    }

                    const weekParts = parts.filter(p => p.weekId === part!.weekId);
                    const rankedResult = getRankedEligibleForPart(part, weekParts, publishers, history, {
                        applyEngineRules: true,
                        excludeAssignedInSameWeek: true,
                    });
                    const candidateSnapshot = rankedResult.allCandidates.find(candidate => candidate.publisher.id === pub.id);
                    const elig = {
                        eligible: candidateSnapshot?.eligible ?? false,
                        reason: candidateSnapshot?.reason,
                    };
                    const score = candidateSnapshot?.scoreData
                        || calculateScore(pub, rankedResult.scoringPartType, rankedResult.historyForScoring, rankedResult.referenceDate, rankedResult.currentPresident);

                    const lines = [
                        `**Elegibilidade: ${pub.name} → "${part.tituloParte || part.tipoParte}"**`,
                        '',
                        `${elig.eligible ? '✅' : '❌'} **Elegível:** ${elig.eligible ? 'SIM' : 'NÃO'}`,
                        `**Motivo:** ${elig.reason || '(sem restrição)'}`,
                        `**Score atual:** ${score.score.toFixed(2)}`,
                        `**Semana:** ${part.weekId}  |  **Seção:** ${part.section || '—'}`,
                    ];

                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { publisherName: pub.name, part, eligible: elig.eligible, reason: elig.reason, score },
                        actionType: 'QUERY_ELIGIBILITY'
                    };
                }

                case 'QUERY_PUBLISHER_PROFILE': {
                    const { publisherName: profPub } = action.params;
                    if (!profPub) {
                        return { success: false, message: 'Parâmetro publisherName é obrigatório.', actionType: 'QUERY_PUBLISHER_PROFILE' };
                    }

                    const normP = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const pub = publishers.find(p => normP(p.name) === normP(profPub))
                        || publishers.find(p => normP(p.name).includes(normP(profPub)) || normP(profPub).includes(normP(p.name)));

                    if (!pub) {
                        return { success: false, message: `Publicador "${profPub}" não encontrado.`, actionType: 'QUERY_PUBLISHER_PROFILE' };
                    }

                    const genderLabel = pub.gender === 'brother' ? '👨 Irmão' : '👩 Irmã';
                    const privLines: string[] = [];
                    if (pub.privileges?.canPreside) privLines.push('Presidir');
                    if (pub.privileges?.canPray) privLines.push('Orar');
                    if (pub.privileges?.canGiveTalks) privLines.push('Discursos');
                    if (pub.privileges?.canConductCBS) privLines.push('Dirigir EBC');
                    if (pub.privileges?.canReadCBS) privLines.push('Ler EBC');
                    if (pub.privileges?.canGiveStudentTalks) privLines.push('Discursos de estudante');

                    const restrictions: string[] = [];
                    if (pub.isNotQualified) restrictions.push(`ÑQualificado${pub.notQualifiedReason ? ': ' + pub.notQualifiedReason : ''}`);
                    if (pub.requestedNoParticipation) restrictions.push(`Sem participação${(pub as any).noParticipationReason ? ': ' + (pub as any).noParticipationReason : ''}`);
                    if (pub.isHelperOnly) restrictions.push('Apenas ajudante');
                    if (pub.privilegesBySection?.canParticipateInTreasures === false) restrictions.push('Bloq.Tesouros');
                    if (pub.privilegesBySection?.canParticipateInMinistry === false) restrictions.push('Bloq.FSM');
                    if (pub.privilegesBySection?.canParticipateInLife === false) restrictions.push('Bloq.NVC');

                    const parents = publishers.filter(p => pub.parentIds?.includes(p.id));
                    const children = publishers.filter(p => p.parentIds?.includes(pub.id));
                    const aliases = (pub as any).aliases?.join(', ') || '—';
                    const avMode = (pub.availability as any)?.mode || 'available';
                    const avLabel = avMode === 'always' ? 'Sempre disponível' : avMode === 'never' ? 'Nunca disponível' : `Modo: ${avMode}`;

                    const lines = [
                        `**Perfil: ${pub.name}**`,
                        '',
                        `**Gênero:** ${genderLabel}  |  **Condição:** ${pub.condition || '—'}`,
                        `**Status:** ${pub.isServing === false ? '⏸ Inativo' : '✅ Em serviço'}  |  **Batizado:** ${pub.isBaptized ? 'Sim' : 'Não'}`,
                        `**Telefone:** ${pub.phone || '—'}  |  **Apelidos:** ${aliases}`,
                        '',
                        `**Privilégios:** ${privLines.length > 0 ? privLines.join(', ') : '(nenhum especial)'}`,
                        `**Restrições:** ${restrictions.length > 0 ? restrictions.join(', ') : '(sem restrições)'}`,
                        '',
                        `**Disponibilidade:** ${avLabel}`,
                        `**Pais/Responsáveis:** ${parents.map(p => p.name).join(', ') || '—'}`,
                        `**Filhos/Dependentes:** ${children.map(p => p.name).join(', ') || '—'}`,
                        `**Ajuste de score:** ${(pub as any).scoreAdjustment ?? 0}`,
                    ];

                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { publisher: pub },
                        actionType: 'QUERY_PUBLISHER_PROFILE'
                    };
                }

                case 'QUERY_PUBLISHER_LIST': {
                    const { filter: listFilter } = action.params;
                    const normL = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const f = normL(listFilter || '');

                    let filtered = [...publishers];
                    if (['active', 'ativos', 'ativo'].includes(f)) filtered = filtered.filter(p => p.isServing !== false);
                    else if (['inactive', 'inativos', 'inativo'].includes(f)) filtered = filtered.filter(p => p.isServing === false);
                    else if (['qualified', 'qualificados', 'aptos'].includes(f)) filtered = filtered.filter(p => !p.isNotQualified);
                    else if (['unqualified', 'nao_qualificados', 'inaptos', 'inqualificados'].includes(f)) filtered = filtered.filter(p => p.isNotQualified);
                    else if (['male', 'irmaos', 'irmaos', 'brother'].includes(f)) filtered = filtered.filter(p => p.gender === 'brother');
                    else if (['female', 'irmas', 'irmas', 'sister'].includes(f)) filtered = filtered.filter(p => p.gender === 'sister');
                    else if (['baptized', 'batizados'].includes(f)) filtered = filtered.filter(p => p.isBaptized);
                    else if (['unbaptized', 'nao_batizados', 'sem_batismo'].includes(f)) filtered = filtered.filter(p => !p.isBaptized);
                    else if (['elder', 'anciaos', 'anciao'].includes(f)) filtered = filtered.filter(p => normL(p.condition || '').includes('anciao'));
                    else if (['ministerial_servant', 'servos', 'servo'].includes(f)) filtered = filtered.filter(p => normL(p.condition || '').includes('servo'));
                    else if (['helper_only', 'so_ajudante', 'apenas_ajudante'].includes(f)) filtered = filtered.filter(p => p.isHelperOnly);
                    else if (['no_phone', 'sem_telefone', 'sem telefone'].includes(f)) filtered = filtered.filter(p => !p.phone);

                    filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

                    const listRows = filtered.map(p => {
                        const g = p.gender === 'brother' ? '👨' : '👩';
                        const s = p.isServing === false ? '⏸' : '✅';
                        const r: string[] = [];
                        if (p.isNotQualified) r.push('ÑQualif');
                        if (p.isHelperOnly) r.push('SóAj');
                        if (p.requestedNoParticipation) r.push('SemPartic');
                        return `| ${g} ${p.name} | ${p.condition || '—'} | ${s} | ${p.phone || '—'} | ${r.join(', ') || '—'} |`;
                    });

                    const filterLabel = listFilter ? ` (filtro: "${listFilter}")` : '';
                    const listLines = [
                        `**Publicadores${filterLabel}** — total: **${filtered.length}**`,
                        '',
                        '| Nome | Condição | Status | Telefone | Restrições |',
                        '|------|----------|--------|---------|------------|',
                        ...listRows
                    ];

                    return {
                        success: true,
                        message: listLines.join('\n'),
                        data: { publishers: filtered, total: filtered.length, filter: listFilter },
                        actionType: 'QUERY_PUBLISHER_LIST'
                    };
                }

                case 'QUERY_COOLDOWN_STATUS': {
                    const { publisherName: cdPub, weekId: cdWkId } = action.params;
                    if (!cdPub) {
                        return { success: false, message: 'Parâmetro publisherName é obrigatório.', actionType: 'QUERY_COOLDOWN_STATUS' };
                    }

                    const normC = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const pub = publishers.find(p => normC(p.name) === normC(cdPub))
                        || publishers.find(p => normC(p.name).includes(normC(cdPub)) || normC(cdPub).includes(normC(p.name)));

                    if (!pub) {
                        return { success: false, message: `Publicador "${cdPub}" não encontrado.`, actionType: 'QUERY_COOLDOWN_STATUS' };
                    }

                    const refDate = cdWkId || contextWeekId || toLocalISODate();
                    const blocked = isBlocked(pub.name, history, refDate, pub.id);
                    const cooldownWeeks = COOLDOWN_WEEKS || 4;

                    const refDateObj = new Date(refDate + 'T12:00:00');
                    const fromDateObj = new Date(refDateObj);
                    fromDateObj.setDate(fromDateObj.getDate() - cooldownWeeks * 7);
                    const fromDateStr = fromDateObj.toISOString().substring(0, 10);

                    const recentMain = history
                        .filter(h => h.resolvedPublisherId === pub.id)
                        .filter(h => (h.weekId || h.date || '') >= fromDateStr && (h.weekId || h.date || '') < refDate)
                        .filter(h => h.funcao !== 'Ajudante')
                        .sort((a, b) => (b.weekId || b.date || '').localeCompare(a.weekId || a.date || ''));
                    const category = recentMain[0]
                        ? getParticipationCategory(recentMain[0].tipoParte || '', recentMain[0].funcao || '')
                        : undefined;

                    const fmtCDate = (s: string) => { try { return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return s; } };

                    const lines: string[] = [
                        `**Cooldown de ${pub.name}** (referência: ${refDate}):`,
                        '',
                        `**Status:** ${blocked ? '🔴 BLOQUEADO' : '🟢 LIVRE'}`,
                        `**Categoria:** ${category || '—'}`,
                        `**Janela de cooldown:** ${cooldownWeeks} semanas`,
                        '',
                    ];

                    if (recentMain.length > 0) {
                        lines.push(`**Participações MAIN nas últimas ${cooldownWeeks} semanas:**`);
                        lines.push('| Data | Parte | Função |');
                        lines.push('|------|-------|--------|');
                        for (const h of recentMain) {
                            lines.push(`| ${fmtCDate(h.weekId || h.date || '')} | ${h.tituloParte || h.tipoParte} | ${h.funcao} |`);
                        }
                    } else {
                        lines.push('_Nenhuma participação MAIN na janela de cooldown._');
                    }

                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { publisherName: pub.name, blocked, category, recentMain, cooldownWeeks, refDate },
                        actionType: 'QUERY_COOLDOWN_STATUS'
                    };
                }

                case 'QUERY_LAST_PARTICIPATION': {
                    const { publisherName: lpPub, partType: lpPartType } = action.params;
                    if (!lpPub) {
                        return { success: false, message: 'Parâmetro publisherName é obrigatório.', actionType: 'QUERY_LAST_PARTICIPATION' };
                    }

                    const normLP = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const pub = publishers.find(p => normLP(p.name) === normLP(lpPub))
                        || publishers.find(p => normLP(p.name).includes(normLP(lpPub)) || normLP(lpPub).includes(normLP(p.name)));
                    const resolvedName = pub?.name || lpPub;
                    const ptNorm = lpPartType ? normLP(lpPartType) : null;
                    const today = toLocalISODate();

                    const records = history
                        .filter(h => pub ? h.resolvedPublisherId === pub.id : normLP(h.resolvedPublisherName || h.rawPublisherName || '') === normLP(resolvedName))
                        .filter(h => !ptNorm || normLP(h.tipoParte) === ptNorm || normLP(h.tituloParte || '') === ptNorm)
                        .filter(h => (h.weekId || h.date || '') < today)
                        .sort((a, b) => (b.weekId || b.date || '').localeCompare(a.weekId || a.date || ''));

                    if (records.length === 0) {
                        return {
                            success: true,
                            message: `**Última participação de ${resolvedName}:** Nenhum registro encontrado${lpPartType ? ` para "${lpPartType}"` : ''}.`,
                            data: { publisherName: resolvedName, last: null, total: 0 },
                            actionType: 'QUERY_LAST_PARTICIPATION'
                        };
                    }

                    const fmtLDate = (s: string) => { try { return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return s; } };
                    const last = records[0];

                    const lines: string[] = [
                        `**Últimas participações de ${resolvedName}**${lpPartType ? ` (tipo: "${lpPartType}")` : ''}:`,
                        '',
                        `**Última registrada:** ${fmtLDate(last.weekId || last.date || '')} — ${last.tituloParte || last.tipoParte} (${last.funcao})`,
                        '',
                    ];

                    if (!ptNorm) {
                        // Group by tipoParte, keep the most recent per type
                        const byType = new Map<string, HistoryRecord>();
                        for (const r of records) {
                            const key = r.tipoParte || '';
                            if (!byType.has(key)) byType.set(key, r);
                        }
                        lines.push('**Por tipo de parte (última ocorrência):**');
                        lines.push('| Data | Tipo de Parte | Função |');
                        lines.push('|------|---------------|--------|');
                        for (const [, r] of [...byType.entries()].sort((a, b) =>
                            (b[1].weekId || b[1].date || '').localeCompare(a[1].weekId || a[1].date || ''))) {
                            lines.push(`| ${fmtLDate(r.weekId || r.date || '')} | ${r.tituloParte || r.tipoParte} | ${r.funcao} |`);
                        }
                    } else {
                        lines.push('**Histórico recente (últimas 10):**');
                        lines.push('| Data | Parte | Função |');
                        lines.push('|------|-------|--------|');
                        for (const r of records.slice(0, 10)) {
                            lines.push(`| ${fmtLDate(r.weekId || r.date || '')} | ${r.tituloParte || r.tipoParte} | ${r.funcao} |`);
                        }
                    }

                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { publisherName: resolvedName, last, total: records.length },
                        actionType: 'QUERY_LAST_PARTICIPATION'
                    };
                }

                case 'QUERY_PENDING_WEEKS': {
                    const { fromWeekId: pwFrom, toWeekId: pwTo } = action.params;
                    const today = toLocalISODate();

                    let allVacant = parts.filter(p => {
                        const hasDesignee = !!(p.resolvedPublisherName || p.rawPublisherName);
                        const isActive = !['COMPLETA', 'CANCELADA'].includes((p.status || '').toUpperCase());
                        return !hasDesignee && isActive && p.funcao !== 'Ajudante';
                    });

                    if (pwFrom) allVacant = allVacant.filter(p => (p.weekId || '') >= pwFrom);
                    if (pwTo) allVacant = allVacant.filter(p => (p.weekId || '') <= pwTo);

                    if (allVacant.length === 0) {
                        return {
                            success: true,
                            message: `✅ Todas as semanas estão com designações completas no período consultado.`,
                            data: { weeks: {}, totalPending: 0, weekCount: 0 },
                            actionType: 'QUERY_PENDING_WEEKS'
                        };
                    }

                    const byWeek = new Map<string, WorkbookPart[]>();
                    for (const p of allVacant) {
                        const w = p.weekId || '';
                        if (!byWeek.has(w)) byWeek.set(w, []);
                        byWeek.get(w)!.push(p);
                    }

                    const fmtPDate = (s: string) => { try { return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return s; } };
                    const secShortPW = (s: string) => (s || '').replace('Tesouros da Palavra de Deus', 'Tesouros').replace('Faça Seu Melhor no Ministério', 'FSM').replace('Nossa Vida Cristã', 'NVC');

                    const sortedWeeks = [...byWeek.keys()].sort();
                    const pwRows = sortedWeeks.map(w => {
                        const wParts = byWeek.get(w)!;
                        const mark = w < today ? '🕐' : '📌';
                        const partsShort = wParts.map(p => `${secShortPW(p.section)}: ${p.tituloParte || p.tipoParte}`).join(', ');
                        return `| ${mark} ${fmtPDate(w)} | ${wParts.length} | ${partsShort} |`;
                    });

                    const pwLines = [
                        `**Semanas com partes pendentes** — ${sortedWeeks.length} semanas, ${allVacant.length} partes no total:`,
                        '',
                        '| Semana | Pendentes | Partes |',
                        '|--------|-----------|--------|',
                        ...pwRows
                    ];

                    return {
                        success: true,
                        message: pwLines.join('\n'),
                        data: { weeks: Object.fromEntries(byWeek), totalPending: allVacant.length, weekCount: sortedWeeks.length },
                        actionType: 'QUERY_PENDING_WEEKS'
                    };
                }

                // ─────────────────────────────────────────────────────────────────────────
                // QUERY_ANALYTICS — agregação genérica determinística (camada 2 do tríplice)
                // metric: 'participation_count' (v1)
                // groupBy: 'publisher' | 'section' | 'funcao' | 'week'
                // filters: gender, section, tipoParte, funcao, fromDate, toDate, eligibleOnly, status
                // sortBy: 'value_asc' | 'value_desc' | 'name_asc'
                // highlight: nome a marcar com ◀ na tabela
                // ─────────────────────────────────────────────────────────────────────────
                case 'QUERY_ANALYTICS': {
                    const {
                        metric = 'participation_count',
                        groupBy = 'publisher',
                        filters = {},
                        sortBy = 'value_desc',
                        limit,
                        highlight
                    } = action.params as any;

                    if (metric !== 'participation_count') {
                        return { success: false, message: `Métrica '${metric}' não suportada. Use 'participation_count'.`, actionType: 'QUERY_ANALYTICS' };
                    }
                    const validGroupBy = ['publisher', 'section', 'funcao', 'week'];
                    if (!validGroupBy.includes(groupBy)) {
                        return { success: false, message: `groupBy inválido. Use: ${validGroupBy.join(', ')}.`, actionType: 'QUERY_ANALYTICS' };
                    }

                    const normA = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

                    // 1) Filtra parts conforme filters
                    let filteredParts = [...parts];
                    if (filters.fromDate) filteredParts = filteredParts.filter(p => (p.date || p.weekId || '') >= filters.fromDate);
                    if (filters.toDate)   filteredParts = filteredParts.filter(p => (p.date || p.weekId || '') <= filters.toDate);
                    if (filters.section) {
                        const expand = (raw: string) => {
                            const r = normA(raw);
                            if (r === 'fsm' || r === 'ministerio' || r === 'ministério') return normA('Faça Seu Melhor no Ministério');
                            if (r === 'tesouros') return normA('Tesouros da Palavra de Deus');
                            if (r === 'nvc' || r === 'vida crista' || r === 'vida cristã') return normA('Nossa Vida Cristã');
                            return r;
                        };
                        const target = expand(filters.section);
                        filteredParts = filteredParts.filter(p => normA(p.section) === target);
                    }
                    if (filters.tipoParte) {
                        const tNorm = normA(filters.tipoParte);
                        filteredParts = filteredParts.filter(p => normA(p.tipoParte) === tNorm || normA(p.tituloParte).includes(tNorm));
                    }
                    if (filters.funcao) {
                        filteredParts = filteredParts.filter(p => (p.funcao || '') === filters.funcao);
                    }
                    if (filters.status) {
                        const statuses = (Array.isArray(filters.status) ? filters.status : [filters.status]).map((s: string) => String(s).toUpperCase());
                        filteredParts = filteredParts.filter(p => statuses.includes(String(p.status || '').toUpperCase()));
                    } else {
                        // padrão: ignora CANCELADO/VAZIO
                        filteredParts = filteredParts.filter(p => !['CANCELADO', 'VAZIO'].includes(String(p.status || '').toUpperCase()));
                    }

                    // 2) Universo de publishers (para groupBy=publisher e para filtro de gênero/elegibilidade)
                    const isEligiblePub = (pub: Publisher): boolean => {
                        if (pub.isServing === false) return false;
                        if ((pub as any).requestedNoParticipation === true) return false;
                        if ((pub as any).isNotQualified === true) return false;
                        const cpm = (pub as any)?.privilegesBySection?.canParticipateInMinistry;
                        if (cpm === false) return false;
                        return true;
                    };
                    let universe = [...publishers];
                    if (filters.gender) {
                        const g = String(filters.gender).toLowerCase();
                        universe = universe.filter(p => String((p as any).gender || '').toLowerCase() === g);
                    }
                    if (filters.eligibleOnly !== false) {
                        // default true (queremos só elegíveis em rankings)
                        universe = universe.filter(isEligiblePub);
                    }

                    // 3) Agrupa
                    type Row = { key: string; label: string; titular: number; ajudante: number; total: number };
                    const rowsMap = new Map<string, Row>();

                    if (groupBy === 'publisher') {
                        // Inicializa com o universo (para incluir quem tem 0 participações)
                        for (const pub of universe) {
                            rowsMap.set(pub.id, { key: pub.id, label: pub.name, titular: 0, ajudante: 0, total: 0 });
                        }
                        const universeIds = new Set(universe.map(p => p.id));
                        // Index: nome normalizado → pub. Também token-level (1ª palavra) p/ matchear "Dayse" ↔ "Dayse Campos".
                        const universeByName = new Map<string, Publisher>();
                        const universeByFirstToken = new Map<string, Publisher[]>();
                        for (const pub of universe) {
                            const n = normA(pub.name);
                            universeByName.set(n, pub);
                            const first = n.split(/\s+/)[0];
                            if (first) {
                                const arr = universeByFirstToken.get(first) || [];
                                arr.push(pub);
                                universeByFirstToken.set(first, arr);
                            }
                        }
                        const resolveByName = (raw: string | undefined): string | undefined => {
                            if (!raw) return undefined;
                            const n = normA(raw);
                            if (!n) return undefined;
                            // 1) match exato
                            const exact = universeByName.get(n);
                            if (exact) return exact.id;
                            // 2) substring nos dois lados
                            for (const [pn, pub] of universeByName) {
                                if (pn.includes(n) || n.includes(pn)) return pub.id;
                            }
                            // 3) primeiro token, se único
                            const first = n.split(/\s+/)[0];
                            const tokenMatches = universeByFirstToken.get(first) || [];
                            if (tokenMatches.length === 1) return tokenMatches[0].id;
                            return undefined;
                        };
                        for (const part of filteredParts) {
                            // Resolve para pub do universo: ID primeiro, depois resolvedPublisherName, depois rawPublisherName
                            let pubId: string | undefined = part.resolvedPublisherId || undefined;
                            if (!pubId || !universeIds.has(pubId)) {
                                pubId = resolveByName(part.resolvedPublisherName) || resolveByName(part.rawPublisherName);
                            }
                            if (!pubId || !universeIds.has(pubId)) continue;
                            const row = rowsMap.get(pubId)!;
                            row.total++;
                            if (part.funcao === 'Titular') row.titular++;
                            else if (part.funcao === 'Ajudante') row.ajudante++;
                        }
                    } else {
                        // groupBy = section | funcao | week
                        for (const part of filteredParts) {
                            let key: string;
                            let label: string;
                            if (groupBy === 'section') { key = part.section || '—'; label = key; }
                            else if (groupBy === 'funcao') { key = part.funcao || '—'; label = key; }
                            else /* week */ { key = part.weekId || part.date || '—'; label = key; }
                            let row = rowsMap.get(key);
                            if (!row) { row = { key, label, titular: 0, ajudante: 0, total: 0 }; rowsMap.set(key, row); }
                            row.total++;
                            if (part.funcao === 'Titular') row.titular++;
                            else if (part.funcao === 'Ajudante') row.ajudante++;
                        }
                    }

                    // 4) Ordena
                    let rowsOut = Array.from(rowsMap.values());
                    if (sortBy === 'value_asc')      rowsOut.sort((a, b) => a.total - b.total || a.label.localeCompare(b.label, 'pt-BR'));
                    else if (sortBy === 'name_asc')  rowsOut.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
                    else /* value_desc */            rowsOut.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-BR'));

                    if (typeof limit === 'number' && limit > 0) rowsOut = rowsOut.slice(0, limit);

                    // 5) Renderiza markdown
                    const highlightNorm = highlight ? normA(highlight) : '';
                    const headerCols = groupBy === 'publisher'
                        ? ['#', 'Publicador', 'Titular', 'Ajudante', 'Total']
                        : ['#', groupBy === 'section' ? 'Seção' : groupBy === 'funcao' ? 'Função' : 'Semana', 'Titular', 'Ajudante', 'Total'];

                    let highlightPos: number | null = null;
                    const bodyRows = rowsOut.map((r, i) => {
                        const isH = highlightNorm && normA(r.label).includes(highlightNorm);
                        if (isH && highlightPos === null) highlightPos = i + 1;
                        const label = isH ? `**◀ ${r.label}**` : r.label;
                        return `| ${i + 1} | ${label} | ${r.titular} | ${r.ajudante} | **${r.total}** |`;
                    });

                    const totalParticipations = rowsOut.reduce((s, r) => s + r.total, 0);
                    const filterParts: string[] = [];
                    if (filters.gender) filterParts.push(`gênero=${filters.gender}`);
                    if (filters.section) filterParts.push(`seção=${filters.section}`);
                    if (filters.tipoParte) filterParts.push(`tipoParte=${filters.tipoParte}`);
                    if (filters.funcao) filterParts.push(`função=${filters.funcao}`);
                    if (filters.fromDate) filterParts.push(`desde ${filters.fromDate}`);
                    if (filters.toDate) filterParts.push(`até ${filters.toDate}`);
                    if (filters.eligibleOnly !== false) filterParts.push('elegíveis');
                    const filterDesc = filterParts.length ? ` _(${filterParts.join(' · ')})_` : '';

                    const lines = [
                        `**Análise: participações por ${groupBy === 'publisher' ? 'publicador' : groupBy === 'section' ? 'seção' : groupBy === 'funcao' ? 'função' : 'semana'}**${filterDesc}`,
                        '',
                        `Total: **${rowsOut.length}** ${groupBy === 'publisher' ? 'publicador(es)' : 'grupos'} · **${totalParticipations}** participações${highlightPos ? ` · destaque na posição **${highlightPos}**` : ''}`,
                        '',
                        `| ${headerCols.join(' | ')} |`,
                        `|${headerCols.map(() => '---').join('|')}|`,
                        ...bodyRows
                    ];

                    return {
                        success: true,
                        message: lines.join('\n'),
                        data: { rows: rowsOut, total: totalParticipations, highlightPos, groupBy, metric, filters },
                        actionType: 'QUERY_ANALYTICS'
                    };
                }

                default:
                    return { success: false, message: `Tipo de ação desconhecido: ${action.type}` };
            }
        } catch (e) {
            console.error('[AgentAction] Execution error:', e);
            const errorMsg = e instanceof Error ? e.message : String(e);

            // Handle Vite dynamic import chunk missing error (e.g., after deployment)
            if (errorMsg.includes('Failed to fetch dynamically imported module')) {
                console.warn('[AgentAction] Refreshing page to load new app version...');
                window.location.reload();
                return { success: true, message: 'Nova versão detectada. Atualizando o aplicativo...' };
            }

            return {
                success: false,
                message: errorMsg || 'Erro desconhecido na execução.'
            };
        }
    }
};
