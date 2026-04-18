import test from 'node:test';
import assert from 'node:assert/strict';
import type { EngineConfig } from '../types';
import { createEngineConfigService } from './engineConfigServiceCore';

const baseConfig: EngineConfig = {
    weights: { teaching: 1, student: 0.5, helper: 0.1 },
    cooldown: { samePartWeeks: 6, sameSectionWeeks: 2, penaltyPoints: 500 },
    bonuses: { neverParticipated: 1000 },
    pairing: { preferSameGender: true, preferFamily: true },
};

test('updateEngineConfig merges nested settings, persists merged config and applies runtime delta', async () => {
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
        cooldown: { samePartWeeks: 8 },
        pairing: { preferFamily: false },
    } as Partial<EngineConfig>);

    assert.equal(result.mergedConfig.cooldown.samePartWeeks, 8);
    assert.equal(result.mergedConfig.cooldown.sameSectionWeeks, 2);
    assert.equal(result.mergedConfig.pairing.preferFamily, false);
    assert.equal(result.mergedConfig.pairing.preferSameGender, true);
    assert.deepEqual(persistedConfig, result.mergedConfig);
    assert.deepEqual(appliedSettings, {
        cooldown: { samePartWeeks: 8 },
        pairing: { preferFamily: false },
    });
});