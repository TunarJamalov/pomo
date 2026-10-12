const fs = require('fs');
const path = require('path');
const { AmbientSounds } = require('../utils/constants');
const { handleAmbientSelect, SAFE_ATTACHMENT_BYTES } = require('../commands/ambient');

describe('/ambient selection', () => {
    test('ambient emojis and files are valid', () => {
        for (const sound of Object.values(AmbientSounds)) {
            expect(sound.emoji).not.toMatch(/[ÃÂâð]/);
            expect(fs.existsSync(path.join(__dirname, '..', 'assets', 'ambient', sound.file))).toBe(true);
        }
    });

    test('large audio uses a browser link instead of a Discord attachment', async () => {
        const interaction = {
            values: ['forest'],
            deferUpdate: jest.fn().mockResolvedValue(undefined),
            followUp: jest.fn().mockResolvedValue(undefined),
        };

        const forestPath = path.join(__dirname, '..', 'assets', 'ambient', AmbientSounds.forest.file);
        expect(fs.statSync(forestPath).size).toBeGreaterThan(SAFE_ATTACHMENT_BYTES);

        await handleAmbientSelect(interaction);

        const payload = interaction.followUp.mock.calls[0][0];
        expect(payload.files).toBeUndefined();
        expect(payload.flags).toBe(64);
        const button = payload.components[0].toJSON().components[0];
        expect(button.url).toBe('https://pomofocus.online/audio/forest.mp3');
    });

    test('small audio remains a Discord attachment', async () => {
        const interaction = {
            values: ['rain'],
            deferUpdate: jest.fn().mockResolvedValue(undefined),
            followUp: jest.fn().mockResolvedValue(undefined),
        };

        await handleAmbientSelect(interaction);

        const payload = interaction.followUp.mock.calls[0][0];
        expect(payload.files).toHaveLength(1);
        expect(payload.components).toBeUndefined();
    });
});
