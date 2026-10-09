import test from 'node:test';
import assert from 'node:assert/strict';
import type { EngineConfig } from '../types';
import { createEngineConfigService } from './engineConfigServiceCore';

const baseConfig: EngineConfig = {
    MAX_LOOKBACK_WEEKS: 52,
    HEAVY_ROLE_RADIUS: 4,
    ROLE_ALTERNATION_WINDOW_WEEKS: 4,
    PAIR_REPETITION_WINDOW_WEEKS: 4,
    ENABLE_SECTION_ROTATION_GATE: true,
    PRESIDENCY_CYCLE_WINDOW_WEEKS: 52,
    STUDENT_PART_GUARANTEE_WEEKS: 13,
    STUDENT_GUARANTEE_MAX_PER_WEEK: 2,
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
        HEAVY_ROLE_RADIUS: 5,
        STUDENT_GUARANTEE_MAX_PER_WEEK: 1,
    });

    assert.equal(result.mergedConfig.HEAVY_ROLE_RADIUS, 5);
    assert.equal(result.mergedConfig.STUDENT_GUARANTEE_MAX_PER_WEEK, 1);
    assert.equal(result.mergedConfig.PRESIDENCY_CYCLE_WINDOW_WEEKS, 52);
    assert.equal(result.mergedConfig.MAX_LOOKBACK_WEEKS, 52);
    assert.deepEqual(persistedConfig, result.mergedConfig);
    assert.deepEqual(appliedSettings, {
        HEAVY_ROLE_RADIUS: 5,
        STUDENT_GUARANTEE_MAX_PER_WEEK: 1,
    });
});