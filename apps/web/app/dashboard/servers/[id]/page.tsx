import { Metadata } from "next";
import ServerSettingsClient from "./ServerSettingsClient";

export const metadata: Metadata = {
  title: "Server Settings | Pomo 2.0",
};

export default async function ServerSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 16: dynamic route params are a Promise.
  const p = await params;
  return <ServerSettingsClient guildId={p.id} />;
}
