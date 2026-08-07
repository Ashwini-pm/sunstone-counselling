import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Testing the lead flow on a real phone over the LAN, otherwise Next blocks
  // its own dev resources as a cross-origin request. Development only.
  allowedDevOrigins: ['172.16.2.94'],

  async headers() {
    return [
      {
        // Counsellor clips. The filename carries a content hash, so a new
        // encode gets a new name and "immutable" is a true statement rather
        // than a promise we might break.
        source: '/avatars/:file*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
};

export default nextConfig;
