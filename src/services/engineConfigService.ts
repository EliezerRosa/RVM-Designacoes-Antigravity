import { api } from './api';
import { getRotationConfig, updateRotationConfig } from './unifiedRotationService';
import { createEngineConfigService } from './engineConfigServiceCore';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '../types';

export type { UpdateEngineConfigResult } from './engineConfigServiceCore';

function toEngineConfig(): EngineConfig {
    const runtimeConfig = getRotationConfig();
    return {
        weights: {
            teaching: runtimeConfig.TIME_FACTOR,
            student: runtimeConfig.TIME_POWER,
            helper: runtimeConfig.BASE_SCORE,
        },
        cooldown: {
            samePartWeeks: runtimeConfig.MAX_LOOKBACK_WEEKS,
            sameSectionWeeks: DEFAULT_ENGINE_CONFIG.cooldown.sameSectionWeeks,
            penaltyPoints: runtimeConfig.COOLDOWN_PENALTY,
        },
        bonuses: {
            neverParticipated: runtimeConfig.ELDER_BONUS,
        },
        pairing: {
            preferSameGender: true,
            preferFamily: true,
        },
    };
}

function toRuntimeConfig(settings: Partial<EngineConfig>) {
    const runtimeSettings: Record<string, number> = {};

    if (settings.weights?.teaching !== undefined) runtimeSettings.TIME_FACTOR = settings.weights.teaching;
    if (settings.weights?.student !== undefined) runtimeSettings.TIME_POWER = settings.weights.student;
    if (settings.weights?.helper !== undefined) runtimeSettings.BASE_SCORE = settings.weights.helper;
    if (settings.cooldown?.samePartWeeks !== undefined) runtimeSettings.MAX_LOOKBACK_WEEKS = settings.cooldown.samePartWeeks;
    if (settings.cooldown?.penaltyPoints !== undefined) runtimeSettings.COOLDOWN_PENALTY = settings.cooldown.penaltyPoints;
    if (settings.bonuses?.neverParticipated !== undefined) runtimeSettings.ELDER_BONUS = settings.bonuses.neverParticipated;

    return runtimeSettings;
}

export const engineConfigService = createEngineConfigService({
    getCurrentConfig: toEngineConfig,
    persistConfig: async config => {
        await api.setSetting('engine_config', config);
    },
    applyRuntimeConfig: settings => {
        updateRotationConfig(toRuntimeConfig(settings));
    },
});