const isDevelopment = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDevelopment ? "'unsafe-eval' " : ""}https://checkout.razorpay.com https://*.clerk.accounts.dev https://*.clerk.com https://clerk.mailor.gathor.online https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com https://img.clerk.com https://challenges.cloudflare.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk-telemetry.com https://api.razorpay.com https://checkout.razorpay.com https://www.googleapis.com https://clerk.mailor.gathor.online https://challenges.cloudflare.com",
  "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://*.clerk.accounts.dev https://*.clerk.com https://clerk.mailor.gathor.online https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.razorpay.com https://api.razorpay.com",
  "base-uri 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  !isDevelopment ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  poweredByHeader: false,
  reactStrictMode: false,
};

export default nextConfig;
