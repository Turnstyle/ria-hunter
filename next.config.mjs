/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER,
  },
  async rewrites() {
    return [
      // Critical mappings to fix frontend/backend mismatch
      {
        source: '/api/credits/balance',
        destination: '/_backend/api/balance'
      },
      {
        source: '/api/balance',
        destination: '/_backend/api/balance'
      }
      // Note: ask and ask-stream routes exist in app/api, not _backend
    ]
  },
  // Avoid bundling optional native deps and node-fetch encoding for serverless funcs
  webpack: (config) => {
    config.externals = config.externals || []
    config.externals.push('encoding', 'bufferutil', 'utf-8-validate')
    return config
  }
}

export default nextConfig
