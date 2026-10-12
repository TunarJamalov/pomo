const DISCORD_CLIENT_ID =
  process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || "1443523945599860816";

export const BOT_PERMISSION_BITS = "274878286912";

export const BOT_INVITE_URL =
  `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}` +
  `&permissions=${BOT_PERMISSION_BITS}&integration_type=0&scope=bot+applications.commands`;

export const SUPPORT_SERVER_URL = "https://discord.gg/XEubrrkBmB";

export const DONATION_URL = process.env.NEXT_PUBLIC_DONATION_URL || "https://boosty.to/pomobot";
export const HAS_DONATION_URL = true;

export const DESKTOP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL || "/downloads/Pomo-Focus-Setup.exe";

export const MICROSOFT_STORE_URL =
  process.env.NEXT_PUBLIC_MICROSOFT_STORE_URL || "https://apps.microsoft.com/detail/9PDMHQ05QR55";

// Adds Pomo to a user's own Discord account (no server or admin rights needed)
export const USER_INSTALL_URL =
  `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&integration_type=1&scope=applications.commands`;

export const TOPGG_URL = "https://top.gg/bot/1443523945599860816";

export const AZEDEV_URL = "https://azedev.com";
