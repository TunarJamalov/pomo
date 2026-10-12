const fs = require('fs');
const path = require('path');
const { applySlashLocalizations } = require('../utils/slashLocalizations');

describe('slash command localizations', () => {
    test('all command descriptions and choices include supported localizations', () => {
        const commandsPath = path.join(__dirname, '..', 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        const missingDescriptions = [];
        const missingChoices = [];

        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            if (!command.data) continue;

            const json = applySlashLocalizations(command.data.toJSON());
            collectMissing(json, json.name, missingDescriptions, missingChoices);
        }

        expect(missingDescriptions).toEqual([]);
        expect(missingChoices).toEqual([]);
    });
});

function collectMissing(node, pathKey, missingDescriptions, missingChoices) {
    if (node.description) {
        const localizations = node.description_localizations || {};
        if (!localizations.fr || !localizations['es-ES'] || !localizations['es-419'] || !localizations['pt-BR']) {
            missingDescriptions.push(pathKey);
        }
    }

    for (const choice of node.choices || []) {
        const localizations = choice.name_localizations || {};
        if (!localizations.fr || !localizations['es-ES'] || !localizations['es-419'] || !localizations['pt-BR']) {
            missingChoices.push(`${pathKey}.${choice.value}`);
        }
    }

    for (const option of node.options || []) {
        collectMissing(option, `${pathKey}.${option.name}`, missingDescriptions, missingChoices);
    }
}
