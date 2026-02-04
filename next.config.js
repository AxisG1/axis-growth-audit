/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['docx', 'archiver', 'pdf-parse'],
  },
}
module.exports = nextConfig
