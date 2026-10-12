/**
 * Deploy slash commands to Discord.
 * Run this script once to register all commands:
 *   node deploy-commands.js
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { applySlashLocalizations } = require('./utils/slashLocalizations');
const { applyInstallContexts } = require('./utils/interactionContext');

const commands = [];
// Owner-only commands are registered only in the owner's server so regular
// servers never see them in the slash menu.
const ownerCommands = [];
const OWNER_GUILD_ID = process.env.OWNER_GUILD_ID || process.env.PREMIUM_GUILD_ID;
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command) {
            const json = applySlashLocalizations(command.data.toJSON());
            if (command.ownerOnly && OWNER_GUILD_ID) {
                ownerCommands.push(json);
                console.log(`[DEPLOY] Queued (owner server only): /${command.data.name}`);
            } else {
                const deployed = applyInstallContexts(json);
                commands.push(deployed);
                console.log(`[DEPLOY] Queued: /${command.data.name}${deployed.integration_types ? ' (+ user install)' : ''}`);
            }
        }
    }
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        // Fetch existing commands to preserve Entry Point / Activity commands
        const existingCommands = await rest.get(
            Routes.applicationCommands(process.env.CLIENT_ID),
        );

        // Keep any Entry Point commands (type 4) that Discord requires
        const entryPointCommands = existingCommands.filter(cmd => cmd.type === 4);
        if (entryPointCommands.length > 0) {
            for (const ep of entryPointCommands) {
                console.log(`[DEPLOY] Preserving entry point: ${ep.name}`);
                commands.push(ep);
            }
        }

        console.log(`[DEPLOY] Registering ${commands.length} command(s)...`);

        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`[DEPLOY] ✅ Successfully registered ${data.length} command(s).`);

        if (OWNER_GUILD_ID) {
            const ownerData = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, OWNER_GUILD_ID),
                { body: ownerCommands },
            );
            console.log(`[DEPLOY] ✅ Registered ${ownerData.length} owner command(s) in server ${OWNER_GUILD_ID}.`);
        } else {
            console.warn('[DEPLOY] OWNER_GUILD_ID / PREMIUM_GUILD_ID not set: owner commands stay global.');
        }
    } catch (error) {
        console.error('[DEPLOY] ❌ Failed to register commands:', error);
    }
})();
