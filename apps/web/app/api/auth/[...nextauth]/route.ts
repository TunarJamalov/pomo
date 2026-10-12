import NextAuth, { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { refreshJwtIfNeeded } from "@/lib/discordAuth";

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
      // Discord now adds `iss` to the OAuth callback; openid-client rejects it
      // ("issuer must be configured") unless the provider knows its issuer.
      issuer: "https://discord.com",
      authorization: { params: { scope: 'identify guilds' } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.sub = user.id;
      }
      if (account) {
        // Discord OAuth tokens stay inside the encrypted JWT cookie only.
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.discordExpiresAt = typeof account.expires_at === "number"
          ? account.expires_at * 1000
          : Date.now() + 7 * 24 * 60 * 60 * 1000;
        token.authError = undefined;
        return token;
      }
      // Refresh an expired Discord token (Discord access tokens last ~7 days).
      return refreshJwtIfNeeded(token);
    },
    async session({ session, token }) {
      if (session.user) {
        // Embed the discord user id into the session so we can query the SQLite DB.
        // The Discord access/refresh tokens are deliberately NOT exposed here.
        (session.user as any).id = token.sub;
      }
      if (token.authError) {
        // Non-sensitive flag so the UI can prompt the user to sign in again.
        (session as any).error = token.authError;
      }
      return session;
    }
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
