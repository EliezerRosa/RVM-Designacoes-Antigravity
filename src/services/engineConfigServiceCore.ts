import type { EngineConfig } from '../types';

interface EngineConfigDependencies {
    getCurrentConfig: () => EngineConfig;
    persistConfig: (config: EngineConfig) => Promise<void>;
    applyRuntimeConfig: (settings: Partial<EngineConfig>) => void;
}

export interface UpdateEngineConfigResult {
    mergedConfig: EngineConfig;
    appliedSettings: Partial<EngineConfig>;
}

export function createEngineConfigService(dependencies: EngineConfigDependencies) {
    return {
        async updateEngineConfig(settings: Partial<EngineConfig>): Promise<UpdateEngineConfigResult> {
            const currentConfig = dependencies.getCurrentConfig();
            const mergedConfig: EngineConfig = {
                ...currentConfig,
                ...settings,
                weights: { ...currentConfig.weights, ...settings.weights },
                cooldown: { ...currentConfig.cooldown, ...settings.cooldown },
                bonuses: { ...currentConfig.bonuses, ...settings.bonuses },
                pairing: { ...currentConfig.pairing, ...settings.pairing },
            };

            await dependencies.persistConfig(mergedConfig);
            dependencies.applyRuntimeConfig(settings);

            return {
                mergedConfig,
                appliedSettings: settings,
            };
        }
    };
}