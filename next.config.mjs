/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Only over HTTPS in production; sending it on http://localhost would pin browsers to HTTPS for a dev host.
  ...(isProd && process.env.ENABLE_HSTS === "true" ? [{ key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" }] : []),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Submissions carry up to 4 images of 8 MB each through a server action.
  experimental: {
    serverActions: { bodySizeLimit: "34mb" },
    // Files read at request time must be bundled with the serverless function.
    outputFileTracingIncludes: {
      "/": ["./content/outcomes/*.yaml"],
      "/learn/lesson/[lessonId]": ["./public/lessons/*.vtt"],
      "/learn/outcome/[slug]": ["./content/outcomes/*.yaml", "./content/competencies.yaml", "./public/lessons/*.vtt"],
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
