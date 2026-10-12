const { spawn } = require('child_process');

let voiceModule = null;
let ffmpegBin = null;

try {
    voiceModule = require('@discordjs/voice');
} catch (e) {
    console.log('[AUDIO] @discordjs/voice not installed. Audio features are disabled.');
}

// Find FFmpeg: prefer system, fallback to ffmpeg-static
try {
    const { execSync } = require('child_process');
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegBin = 'ffmpeg';
    console.log('[AUDIO] Using system FFmpeg ✓');
} catch (_) {
    try {
        ffmpegBin = require('ffmpeg-static');
        console.log(`[AUDIO] Using bundled ffmpeg at: ${ffmpegBin}`);
    } catch (__) {
        console.warn('[AUDIO] ⚠️  FFmpeg not found! Install ffmpeg: sudo apt install ffmpeg');
    }
}

// Check for opus encoder
let hasOpus = false;
try {
    require('@discordjs/opus');
    hasOpus = true;
    console.log('[AUDIO] Opus encoder: @discordjs/opus ✓');
} catch (_) {
    try {
        require('opusscript');
        hasOpus = true;
        console.log('[AUDIO] Opus encoder: opusscript ✓');
    } catch (__) {
        console.warn('[AUDIO] ⚠️  No Opus encoder found! Run: npm install @discordjs/opus');
    }
}

// Stream URLs
const STREAM_URLS = [
    'https://streams.ilovemusic.de/iloveradio17.mp3',
    'http://icecast.radiofrance.fr/fip-midfi.mp3',
    'https://listen.moe/stream',
    'http://hi5.streamtheworld.com/KGBYAAC_SC',
];

const guildPlayers = new Map();
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 8000;

/**
 * Spawn FFmpeg manually with reconnect flags and pipe its output to Discord.
 * This is the reliable way to stream internet radio — it bypasses prism-media's
 * PATH lookup and adds proper reconnect behaviour for live streams.
 */
function spawnFFmpegStream(url) {
    const args = [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '30',
        '-i', url,
        '-analyzeduration', '0',
        '-loglevel', 'error',
        '-f', 's16le',    // Raw PCM
        '-ar', '48000',   // 48kHz (Discord requirement)
        '-ac', '2',       // Stereo
        'pipe:1',
    ];

    return spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

function createResourceFromUrl(url) {
    const { createAudioResource, StreamType } = voiceModule;
    const ffmpegProcess = spawnFFmpegStream(url);

    ffmpegProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        // Ignore harmless pipe-close errors that happen during normal stop
        if (!msg) return;
        if (msg.includes('Connection reset by peer')) return;
        if (msg.includes('Error writing trailer')) return;
        if (msg.includes('Error closing file')) return;
        if (msg.includes('Task finished with error code: -104')) return;
        if (msg.includes('Terminating thread with return code -104')) return;
        if (msg.includes('Error muxing a packet')) return;
        console.error(`[AUDIO][FFmpeg] ${msg}`);
    });

    const resource = createAudioResource(ffmpegProcess.stdout, {
        inputType: StreamType.Raw,
    });

    // Attach the process so we can kill it on stop
    resource._ffmpegProcess = ffmpegProcess;
    return resource;
}

async function playLofi(guild, channelId) {
    if (!voiceModule) return { success: false, reason: 'not_installed' };
    if (!hasOpus)     return { success: false, reason: 'no_opus' };
    if (!ffmpegBin)   return { success: false, reason: 'no_ffmpeg' };

    if (guildPlayers.has(guild.id)) stopLofi(guild.id);

    try {
        const connection = voiceModule.joinVoiceChannel({
            channelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        const player = voiceModule.createAudioPlayer({
            behaviors: { noSubscriber: voiceModule.NoSubscriberBehavior.Play },
        });

        let urlIndex = 0;
        let retryCount = 0;
        let retryTimer = null;
        let currentProcess = null;
        let stopped = false;

        const playNext = (idx) => {
            const url = STREAM_URLS[idx % STREAM_URLS.length];
            const resource = createResourceFromUrl(url);
            currentProcess = resource._ffmpegProcess;
            player.play(resource);
        };

        playNext(urlIndex);
        connection.subscribe(player);

        guildPlayers.set(guild.id, {
            connection, player,
            get retryTimer() { return retryTimer; },
            get currentProcess() { return currentProcess; },
        });

        player.on(voiceModule.AudioPlayerStatus.Idle, () => {
            if (stopped || !guildPlayers.has(guild.id)) return;

            if (retryCount >= MAX_RETRIES) {
                console.log(`[AUDIO] Max retries reached for guild ${guild.id}. Stopping.`);
                stopLofi(guild.id);
                return;
            }

            retryCount++;
            urlIndex++;
            const nextUrl = STREAM_URLS[urlIndex % STREAM_URLS.length];
            console.log(`[AUDIO] Stream ended in ${guild.id}. Retry ${retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS / 1000}s → ${nextUrl}`);

            retryTimer = setTimeout(() => {
                if (stopped || !guildPlayers.has(guild.id)) return;
                try {
                    playNext(urlIndex);
                    retryCount = 0;
                } catch (e) {
                    console.error(`[AUDIO] Retry failed for ${guild.id}:`, e.message);
                }
            }, RETRY_DELAY_MS);
        });

        player.on('error', error => {
            console.error(`[AUDIO] Player error in ${guild.id}:`, error.message);
        });

        connection.on(voiceModule.VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    voiceModule.entersState(connection, voiceModule.VoiceConnectionStatus.Signalling, 5_000),
                    voiceModule.entersState(connection, voiceModule.VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                stopped = true;
                stopLofi(guild.id);
            }
        });

        return { success: true };
    } catch (error) {
        console.error('[AUDIO] playLofi error:', error);
        return { success: false, reason: 'error', error };
    }
}

function stopLofi(guildId) {
    if (!voiceModule) return;
    const session = guildPlayers.get(guildId);
    if (session) {
        if (session.retryTimer) clearTimeout(session.retryTimer);
        try { session.currentProcess?.kill(); } catch (_) {}
        try { session.player.stop(true); } catch (_) {}
        try { session.connection.destroy(); } catch (_) {}
        guildPlayers.delete(guildId);
    }
}

function isPlayingLofi(guildId) {
    return guildPlayers.has(guildId);
}

module.exports = {
    playLofi,
    stopLofi,
    isPlayingLofi,
    isAudioAvailable: () => !!(voiceModule && hasOpus && ffmpegBin),
};
