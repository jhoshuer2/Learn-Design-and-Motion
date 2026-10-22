/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Submissions carry up to 4 images of 8 MB each through a server action.
  experimental: { serverActions: { bodySizeLimit: "34mb" } },
};
export default nextConfig;
