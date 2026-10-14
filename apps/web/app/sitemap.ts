import type { MetadataRoute } from "next";

const BASE_URL = "https://pomofocus.online";

// Public pages only; keep in sync when adding tutorials or landing pages.
const PAGES: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }> = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/tutorials", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tutorials/getting-started", priority: 0.9, changeFrequency: "monthly" },
  { path: "/tutorials/commands", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tutorials/habits", priority: 0.7, changeFrequency: "monthly" },
  { path: "/tutorials/team-sessions", priority: 0.6, changeFrequency: "monthly" },
  { path: "/tutorials/study-buddy", priority: 0.6, changeFrequency: "monthly" },
  { path: "/tutorials/economy", priority: 0.5, changeFrequency: "monthly" },
  { path: "/tutorials/garden", priority: 0.5, changeFrequency: "monthly" },
  { path: "/tutorials/pets-market", priority: 0.5, changeFrequency: "monthly" },
  { path: "/tutorials/clans", priority: 0.5, changeFrequency: "monthly" },
  { path: "/desktop", priority: 0.7, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.4, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}
