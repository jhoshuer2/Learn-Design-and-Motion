import type { MetadataRoute } from "next";

/** Shared work is not for search engines until that is a deliberate decision. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: ["/p/", "/u/", "/api/", "/community", "/portfolio", "/profile", "/learn", "/review", "/dashboard"] }] };
}
