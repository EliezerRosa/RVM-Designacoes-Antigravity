import test from 'node:test';
import assert from 'node:assert/strict';
import type { EngineConfig } from '../types';
import { createEngineConfigService } from './engineConfigServiceCore';

const baseConfig: EngineConfig = {
    BASE_SCORE: 100,
    TIME_POWER: 1.5,
    TIME_FACTOR: 8,
    RECENT_PARTICIPATION_PENALTY: 50,
    COOLDOWN_PENALTY: 1500,
    ELDER_BONUS: 5,
    SISTER_DEMO_PRIORITY: 50,
    FSM_TITULAR_PROMOTION_BONUS: 80,
    MAX_LOOKBACK_WEEKS: 52,
};

test('updateEngineConfig shallow-merges flat settings, persists merged config and applies runtime delta', async () => {
    let persistedConfig: EngineConfig | null = null;
    let appliedSettings: Partial<EngineConfig> | null = null;
    const service = createEngineConfigService({
        getCurrentConfig: () => baseConfig,
        persistConfig: async config => {
            persistedConfig = config;
        },
        applyRuntimeConfig: settings => {
            appliedSettings = settings;
        },
    });

    const result = await service.updateEngineConfig({
        COOLDOWN_PENALTY: 2000,
        ELDER_BONUS: 10,
    });

    assert.equal(result.mergedConfig.COOLDOWN_PENALTY, 2000);
    assert.equal(result.mergedConfig.ELDER_BONUS, 10);
    assert.equal(result.mergedConfig.BASE_SCORE, 100);
    assert.equal(result.mergedConfig.MAX_LOOKBACK_WEEKS, 52);
    assert.deepEqual(persistedConfig, result.mergedConfig);
    assert.deepEqual(appliedSettings, {
        COOLDOWN_PENALTY: 2000,
        ELDER_BONUS: 10,
    });
});