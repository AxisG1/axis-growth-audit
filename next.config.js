/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['docx', 'archiver'],
  },
}
module.exports = nextConfig
