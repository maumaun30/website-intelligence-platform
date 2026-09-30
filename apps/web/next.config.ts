import { join } from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A self-contained server bundle for the container image. In a workspace the tracing root has
  // to be the repo root, or Next only traces this package and the image misses its dependencies.
  output: 'standalone',
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  transpilePackages: ['@wintel/ui'],
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
