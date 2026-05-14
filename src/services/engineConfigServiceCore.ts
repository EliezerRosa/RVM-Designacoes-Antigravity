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
            // Shape canônico é PLANO (chaves runtime do motor) — merge raso é
            // suficiente. Ver `EngineConfig` em `types.ts`.
            const currentConfig = dependencies.getCurrentConfig();
            const mergedConfig: EngineConfig = {
                ...currentConfig,
                ...settings,
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