const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors, Plants } = require('../utils/constants');
const {
    getOrCreateUser,
    setReferral,
    getReferralStats,
    incrementUser,
    addItemToInventory
} = require('../utils/database');
const { getInteractionLanguage, t } = require('../utils/i18n');


module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('referral')
        .setDescription('Invite friends and earn rewards!')
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Check your referral code and stats')
        )
        .addSubcommand(sub =>
            sub.setName('use')
                .setDescription("Use a friend's referral code to get starter rewards")
                .addStringOption(opt =>
                    opt.setName('code')
                        .setDescription("Your friend's referral code (their User ID)")
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const language = getInteractionLanguage(interaction);

        // Ensure user is in DB
        getOrCreateUser(userId);

        if (sub === 'info') {
            const count = getReferralStats(userId);
            
            const embed = new EmbedBuilder()
                .setColor(Colors.STUDY)
                .setTitle('🤝 Referral Program')
                .setDescription('Invite friends to PomoBot and earn rewards when they use your code!')
                .addFields(
                    { name: 'Your Code', value: `\`\`\`${userId}\`\`\``, inline: true },
                    { name: 'Total Referrals', value: `**${count}** friends`, inline: true },
                    { name: 'Rewards', value: 'You get **+100 XP** & **1 Random Fruit** per friend!\nThey get **+50 XP** & **+10 💧**', inline: false }
                )
                .setFooter({ text: 'Share your code with friends who are new to PomoBot!' });

            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'use') {
            const code = interaction.options.getString('code').trim();
            
            const result = setReferral(userId, code);
            
            if (!result.success) {
                let errorMsg = 'Invalid code.';
                if (result.reason === 'already_referred') errorMsg = 'You have already used a referral code. You can only use one code per account.';
                if (result.reason === 'self_referral') errorMsg = 'You cannot use your own referral code!';
                if (result.reason === 'invalid_referrer') errorMsg = 'This referral code does not exist. Make sure your friend has registered with PomoBot.';
                
                return interaction.reply({
                    content: `❌ **Error:** ${errorMsg}`,
                    flags: 64
                });
            }

            // --- Rewards ---
            
            // 1. Invitee (The person who used the command)
            incrementUser(userId, 'water', 10);
            incrementUser(userId, 'xp', 50);
            
            // 2. Inviter (The person whose code was used)
            const plantKeys = Object.keys(Plants);
            const randomFruit = plantKeys[Math.floor(Math.random() * plantKeys.length)];
            const fruitInfo = Plants[randomFruit];
            
            addItemToInventory(code, randomFruit, 1);
            incrementUser(code, 'xp', 100);
            
            // Notify inviter via DM
            try {
                const inviterDiscordUser = await interaction.client.users.fetch(code);
                if (inviterDiscordUser) {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(Colors.STUDY)
                        .setTitle('🤝 Someone used your referral code!')
                        .setDescription(`**${interaction.user.username}** just used your referral code!\n\nYou earned:\n✨ **+100 XP**\n${fruitInfo.emoji} **1x ${fruitInfo.name}**`);
                    
                    await inviterDiscordUser.send({ embeds: [dmEmbed] }).catch(() => {});
                }
            } catch (err) {
                // Ignore DM errors silently
            }

            const successEmbed = new EmbedBuilder()
                .setColor(Colors.SUCCESS)
                .setTitle('🎉 Referral Successful!')
                .setDescription('You have successfully used a referral code and claimed your starter rewards.')
                .addFields({
                    name: 'Your Rewards',
                    value: '✨ **+50 XP**\n💧 **+10 Water**'
                });

            return interaction.reply({ embeds: [successEmbed] });
        }
    }
};
