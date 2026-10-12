const {
    buildAnnouncementPayload,
    parseList,
    isSafeHttpUrl,
} = require('../commands/announce');

describe('structured announcements', () => {
    test('turns pipe-separated features into clean bullet items', () => {
        expect(parseList('Advanced stats | - Streak Recovery | Custom profiles'))
            .toEqual(['Advanced stats', 'Streak Recovery', 'Custom profiles']);
    });

    test('builds separate feature and giveaway sections with a link button', () => {
        const payload = buildAnnouncementPayload({
            title: 'Pomo Pro Update',
            message: 'A new update is live.',
            features: 'Advanced analytics | Streak Recovery',
            giveaway: 'Join the support server for a chance to win.',
            buttonUrl: 'https://discord.gg/XEubrrkBmB',
            buttonLabel: 'Join Support Server',
            color: 0xFEE75C,
        });
        const json = payload.embeds[0].toJSON();

        expect(json.description).toBe('A new update is live.');
        expect(json.fields[0]).toEqual({
            name: "What's New",
            value: '- Advanced analytics\n- Streak Recovery',
            inline: false,
        });
        expect(json.fields[1].name).toBe('Pomo Pro Giveaway');
        expect(payload.components[0].components[0].data.url)
            .toBe('https://discord.gg/XEubrrkBmB');
    });

    test('accepts only HTTP link buttons', () => {
        expect(isSafeHttpUrl('https://pomofocus.online')).toBe(true);
        expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    });
});
