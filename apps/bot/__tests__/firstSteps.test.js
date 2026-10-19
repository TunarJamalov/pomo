// New servers should only be offered setup that can work there, and /botstats should
// show what they did first (welcome delivered, buttons pressed, results)
const { PermissionFlagsBits } = require('discord.js');
const { initDatabase, db, recordOnboardingEvent, getFirstStepsAnalytics } = require('../utils/database');
const { buildSetupButtonRow, canAutoSetup } = require('../utils/setupWizard');
const { buildWelcomeEmbed } = require('../events/guildCreate');

const guildWith = permissions => ({
    id: '500000000000000001',
    name: 'Study Club',
    members: { me: { permissions: { has: wanted => wanted.every(bit => permissions.includes(bit)) } } },
});
const basic = guildWith([PermissionFlagsBits.SendMessages]);
const manager = guildWith([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles]);
const buttonIds = row => row.toJSON().components.map(button => button.custom_id);

beforeAll(() => initDatabase());

test('1-Click Setup is only offered where Pomo can create channels and roles', () => {
    expect(canAutoSetup(basic)).toBe(false);
    expect(canAutoSetup(manager)).toBe(true);
    expect(canAutoSetup(null)).toBe(true);

    expect(buttonIds(buildSetupButtonRow(null, 'en', basic))).not.toContain('setup_auto');
    expect(buttonIds(buildSetupButtonRow(null, 'en', basic))).toContain('setup_quick');
    expect(buttonIds(buildSetupButtonRow(null, 'en', manager))).toContain('setup_auto');
    expect(buttonIds(buildSetupButtonRow(basic.id, 'en', basic))).not.toContain(`setup_auto_${basic.id}`);
    expect(buttonIds(buildSetupButtonRow(manager.id, 'en', manager))).toContain(`setup_auto_${manager.id}`);
});

test('the welcome message leaves out 1-Click Setup when it would fail', () => {
    expect(buildWelcomeEmbed(basic, 'en').toJSON().fields).toHaveLength(2);
    expect(buildWelcomeEmbed(manager, 'en').toJSON().fields).toHaveLength(3);
});

test('first steps are counted per result for /botstats', () => {
    db.prepare("DELETE FROM onboarding_events WHERE event_type IN ('welcome', 'setup')").run();
    recordOnboardingEvent('g1', 'owner', 'welcome', 'posted');
    recordOnboardingEvent('g2', 'owner', 'welcome', 'no_channel');
    recordOnboardingEvent('g1', 'u1', 'setup', 'auto_click');
    recordOnboardingEvent('g1', 'u1', 'setup', 'auto_no_permission');
    recordOnboardingEvent('g1', 'u1', 'setup', 'quick_click');
    recordOnboardingEvent('g1', 'u1', 'setup', 'quick_done');
    recordOnboardingEvent('g1', 'u1', 'panel_click', 'study');

    expect(getFirstStepsAnalytics(30)).toEqual({
        'welcome:posted': 1,
        'welcome:no_channel': 1,
        'setup:auto_click': 1,
        'setup:auto_no_permission': 1,
        'setup:quick_click': 1,
        'setup:quick_done': 1,
    });
});
