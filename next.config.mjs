/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // kokoro-js is browser/WASM-only in this app. Prevent webpack from
      // pulling the Node ONNX runtime and its native binaries into builds.
      "onnxruntime-node$": false,
      "onnxruntime-node": false,
    };

    // Never bundle Node-only ONNX runtime code into the client bundle.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        child_process: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },
};

export default nextConfig;
