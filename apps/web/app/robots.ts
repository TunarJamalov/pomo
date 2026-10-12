import type { MetadataRoute } from "next";

// Public pages are crawlable; signed-in areas, APIs and Discord Activity views are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api/", "/activity", "/room/"],
    },
    sitemap: "https://pomofocus.online/sitemap.xml",
  };
}
