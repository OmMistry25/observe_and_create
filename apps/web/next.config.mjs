/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@observe-create/schemas', '@observe-create/sdk', '@observe-create/ingest', '@observe-create/automation'],
  // Webpack configuration for @xenova/transformers
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), {
        'sharp': 'commonjs sharp',
        'onnxruntime-node': 'commonjs onnxruntime-node'
      }];
    }
    return config;
  },
};

export default nextConfig;

