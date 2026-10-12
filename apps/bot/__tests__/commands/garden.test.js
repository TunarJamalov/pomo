const { _test } = require('../../commands/garden');

describe('garden watering helpers', () => {
    const plant = { waterPerStage: 5 };

    test('uses enough water to reach the next stage when balance allows it', () => {
        const plot = { stage: 1, water_used: 6 };
        expect(_test.calculateWaterToNextStage(plot, plant, 100)).toBe(4);
    });

    test('uses all available water when balance is below the next stage requirement', () => {
        const plot = { stage: 1, water_used: 6 };
        expect(_test.calculateWaterToNextStage(plot, plant, 2)).toBe(2);
    });

    test('does not water ripe plants', () => {
        const plot = { stage: 3, water_used: 15 };
        expect(_test.calculateWaterToNextStage(plot, plant, 100)).toBe(0);
    });

    test('does not water when user has no water', () => {
        const plot = { stage: 0, water_used: 0 };
        expect(_test.calculateWaterToNextStage(plot, plant, 0)).toBe(0);
    });
});
