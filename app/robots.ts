import type { MetadataRoute } from "next";
import { getCanonicalSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Admin, API, auth callbacks and per-user pages carry no public content.
      disallow: ["/admin", "/api/", "/auth/", "/profil", "/bildirimler", "/sifre-yenile"],
    },
    sitemap: `${getCanonicalSiteUrl()}/sitemap.xml`,
  };
}
