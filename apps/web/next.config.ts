import type { NextConfig } from "next";
import { execSync } from "node:child_process";

function getDeploymentId() {
  if (process.env.NEXT_DEPLOYMENT_ID) return process.env.NEXT_DEPLOYMENT_ID;

  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

const config: NextConfig = {
  deploymentId: getDeploymentId(),
  outputFileTracingRoot: require("path").join(__dirname, "../../"),
  serverExternalPackages: ["better-sqlite3"],
  transpilePackages: ["@pomo/db"],
  async redirects() {
    // The pricing page used to live at /support; old links in DMs, posts and search results keep working
    return [{ source: "/support", destination: "/pricing", permanent: true }];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
      },
    ],
  },
};

export default config;
