/**
 * Embed builder helpers for consistent styling across the bot.
 */

const { EmbedBuilder } = require('discord.js');
const { Colors } = require('./constants');

/**
 * Creates a success embed.
 */
function successEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Creates an error embed.
 */
function errorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.ERROR)
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Creates an info embed.
 */
function infoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Creates a warning embed.
 */
function warningEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.WARNING)
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Creates a study-themed embed.
 */
function studyEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle(`📚 ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Creates a garden-themed embed.
 */
function gardenEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.GARDEN)
        .setTitle(`🌱 ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Creates a market-themed embed.
 */
function marketEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.MARKET)
        .setTitle(`🏪 ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Creates a profile-themed embed.
 */
function profileEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.PROFILE)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Generates an emoji-based progress bar.
 * Uses custom Discord emojis if set via env vars (EMOJI_BAR_*),
 * otherwise falls back to unicode block characters.
 * @param {number} current - Current value
 * @param {number} max - Maximum value
 * @param {number} length - Bar segment count (default 10)
 * @returns {string} Progress bar string
 */
function progressBar(current, max, length = 10) {
    const { EmojiBar } = require('./constants');
    const percentage = Math.min(current / max, 1);
    const filled = Math.round(percentage * length);

    let bar = '';
    for (let i = 0; i < length; i++) {
        const isFilled = i < filled;
        if (i === 0) {
            bar += isFilled ? EmojiBar.START_FULL : EmojiBar.START_EMPTY;
        } else if (i === length - 1) {
            bar += isFilled ? EmojiBar.END_FULL : EmojiBar.END_EMPTY;
        } else {
            bar += isFilled ? EmojiBar.MID_FULL : EmojiBar.MID_EMPTY;
        }
    }

    return `${bar} ${Math.round(percentage * 100)}%`;
}

/**
 * Formats minutes into a human-readable time string.
 * @param {number} minutes
 * @returns {string}
 */
function formatTime(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

module.exports = {
    successEmbed,
    errorEmbed,
    infoEmbed,
    warningEmbed,
    studyEmbed,
    gardenEmbed,
    marketEmbed,
    profileEmbed,
    progressBar,
    formatTime,
};
