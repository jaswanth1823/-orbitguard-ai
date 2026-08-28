/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable build-time font optimisation so the build does not require a
  // network connection to fonts.gstatic.com.  Fonts are still served correctly
  // at runtime via next/font/google's client-side loading path.
  optimizeFonts: false,
  async rewrites() {
    return [
      {
        source: '/api/anomaly/:path*',
        destination: process.env.ANOMALY_SERVICE_URL
          ? `${process.env.ANOMALY_SERVICE_URL}/:path*`
          : '/api/anomaly-fallback/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
