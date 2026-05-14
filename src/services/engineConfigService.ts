import { api } from './api';
import { getRotationConfig, updateRotationConfig } from './unifiedRotationService';
import { createEngineConfigService } from './engineConfigServiceCore';

export type { UpdateEngineConfigResult } from './engineConfigServiceCore';

/**
 * Wrapper único: shape do `engine_config` é o PLANO `EngineConfig`
 * (chaves runtime do motor). Ver `types.ts`. UI (`EngineRulesPanel`),
 * agente (`UPDATE_ENGINE_RULES`) e boot loader operam sobre o mesmo
 * objeto — sem conversões.
 */
export const engineConfigService = createEngineConfigService({
    getCurrentConfig: () => getRotationConfig(),
    persistConfig: async config => {
        await api.setSetting('engine_config', config);
    },
    applyRuntimeConfig: settings => {
        updateRotationConfig(settings);
    },
});