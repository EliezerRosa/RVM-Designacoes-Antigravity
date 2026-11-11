/**
 * PolicyGuard — Adaptador Somente-Leitura de Permissões
 *
 * Mapeia cada intenção para o AgentActionType governante e consulta o
 * PermissionGate canônico do RVM.
 * Fail-closed: se o perfil não tem permissão, a intenção é sumariamente bloqueada.
 */

import type { PermissionGate } from '../../../services/permissionService';
import { getIntentContract } from './intentCatalog';

export interface PolicyCheckResult {
  allowed: boolean;
  actionType: string;
  reason?: string;
}

export function checkIntentPermission(intentId: string, gate: PermissionGate): PolicyCheckResult {
  const contract = getIntentContract(intentId);
  if (!contract) {
    return {
      allowed: false,
      actionType: 'UNKNOWN',
      reason: 'Intenção não catalogada no sistema.',
    };
  }

  const allowed = gate.canAgentAction(contract.actionType);
  if (!allowed) {
    return {
      allowed: false,
      actionType: contract.actionType,
      reason: 'Seu perfil de permissões não possui autorização para esta operação.',
    };
  }

  return {
    allowed: true,
    actionType: contract.actionType,
  };
}

