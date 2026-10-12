const help = require('../commands/help');
const { SUPPORT_SERVER_URL } = require('../utils/constants');

describe('/help menu', () => {
    test('uses valid Unicode emojis for every select option', () => {
        const row = help.buildCategoryRow().toJSON();
        const options = row.components[0].options;

        // The owner category is not shown in the public /help menu
        expect(options).toHaveLength(6);
        expect(options.map(option => option.emoji.name)).toEqual([
            '\uD83D\uDCDA',
            '\u2694\uFE0F',
            '\uD83C\uDF31',
            '\uD83D\uDC65',
            '\uD83C\uDFEA',
            '\u2699\uFE0F',
        ]);

        for (const option of options) {
            expect(option.emoji.name).not.toMatch(/[ÃÂâð]/);
        }
    });

    test('marks only the selected category as default', () => {
        const row = help.buildCategoryRow('garden').toJSON();
        const defaults = row.components[0].options.filter(option => option.default);

        expect(defaults).toHaveLength(1);
        expect(defaults[0].value).toBe('garden');
    });
});

describe('/help links', () => {
    test('links to the website, support server and GitHub', () => {
        const urls = help.buildLinksRow('en').toJSON().components.map(button => button.url);
        expect(urls).toEqual([
            'https://pomofocus.online',
            SUPPORT_SERVER_URL,
            'https://github.com/TunarJamalov/pomo',
        ]);
    });
});
