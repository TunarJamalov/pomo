const { checkAndNotifyQuests } = require('../commands/quests');

describe('Team Late Join & Quest Features', () => {
    test('checkAndNotifyQuests exports properly', () => {
        expect(typeof checkAndNotifyQuests).toBe('function');
    });
});
