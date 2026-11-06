/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  serverExternalPackages: ["node:sqlite", "pg", "@prisma/client", "@prisma/adapter-pg"],
};

export default nextConfig;
