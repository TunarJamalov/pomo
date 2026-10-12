import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import AuthProvider from "@/components/AuthProvider";

const display = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", variable: "--font-display-face" });
const body = Figtree({ subsets: ["latin"], display: "swap", variable: "--font-body" });
const code = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-code" });

export const metadata: Metadata = {
  metadataBase: new URL("https://pomofocus.online"),
  title: {
    default: "Pomo: Discord Pomodoro & Study Bot with Focus Timers, Pets and Streaks",
    template: "%s | Pomo Discord Bot",
  },
  description: "Free Discord study bot with Pomodoro timers, automatic voice study tracking, streaks, leaderboards, study pets and a virtual garden. Add Pomo to your server or your own Discord account in one click.",
  keywords: [
    "discord pomodoro bot",
    "discord study bot",
    "study timer discord",
    "pomodoro timer",
    "focus timer",
    "study with me discord",
    "voice study tracking",
    "study streaks",
    "study leaderboard",
    "productivity discord bot",
  ],
  authors: [{ name: "Jamalov Tunar" }],
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Pomo: Discord Pomodoro & Study Bot with Focus Timers, Pets and Streaks",
    description: "Free Discord study bot with Pomodoro timers, automatic voice study tracking, streaks, leaderboards, study pets and a virtual garden. Add Pomo to your server or your own Discord account in one click.",
    url: "https://pomofocus.online",
    siteName: "Pomo",
    images: [
      {
        url: "/logo.png",
        width: 800,
        height: 600,
        alt: "Pomo Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pomo: Discord Pomodoro & Study Bot with Focus Timers, Pets and Streaks",
    description: "Pomodoro timers, study streaks, pets and leaderboards inside Discord.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${display.variable} ${body.variable} ${code.variable}`}>
      <body className="antialiased selection:bg-[var(--blurple)] selection:text-white">
        <AuthProvider>
          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
