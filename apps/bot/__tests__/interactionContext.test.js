const fs = require('fs');
const path = require('path');
const {
    USER_INSTALL_COMMANDS,
    applyInstallContexts,
    isForeignGuild,
    needsDmTimer,
    botGuildId,
} = require('../utils/interactionContext');
const { getUserInstallUrl } = require('../utils/invite');

describe('user install helpers', () => {
    test('only listed commands get user-install contexts', () => {
        const study = applyInstallContexts({ name: 'study' });
        expect(study.integration_types).toEqual([0, 1]);
        expect(study.contexts).toEqual([0, 1, 2]);

        const setup = applyInstallContexts({ name: 'setup' });
        expect(setup.integration_types).toBeUndefined();
        expect(setup.contexts).toBeUndefined();
    });

    test('every user-install command exists and never depends on server-only data', () => {
        for (const name of USER_INSTALL_COMMANDS) {
            const file = path.join(__dirname, '..', 'commands', `${name}.js`);
            expect(fs.existsSync(file)).toBe(true);
            const source = fs.readFileSync(file, 'utf8');
            expect(source).not.toMatch(/setDMPermission\(false\)/);
            expect(source).not.toMatch(/interaction\.member\b/);
        }
    });

    test('detects servers the bot has not joined', () => {
        expect(isForeignGuild({ guildId: 'g1', guild: null })).toBe(true);
        expect(isForeignGuild({ guildId: 'g1', guild: { id: 'g1' } })).toBe(false);
        expect(isForeignGuild({ guildId: null, guild: null })).toBe(false);

        expect(botGuildId({ guildId: 'g1', guild: null })).toBeNull();
        expect(botGuildId({ guildId: 'g1', guild: { id: 'g1' } })).toBe('g1');
    });

    test('timers move to DMs in foreign servers and group DMs only', () => {
        expect(needsDmTimer({ guildId: 'g1', guild: null, context: 0 })).toBe(true);
        expect(needsDmTimer({ guildId: null, guild: null, context: 2 })).toBe(true);
        expect(needsDmTimer({ guildId: null, guild: null, context: 1 })).toBe(false);
        expect(needsDmTimer({ guildId: 'g1', guild: { id: 'g1' }, context: 0 })).toBe(false);
    });

    test('user-install link needs no bot scope or permissions', () => {
        const url = new URL(getUserInstallUrl('123'));
        expect(url.searchParams.get('integration_type')).toBe('1');
        expect(url.searchParams.get('scope')).toBe('applications.commands');
        expect(url.searchParams.get('permissions')).toBeNull();
    });
});
