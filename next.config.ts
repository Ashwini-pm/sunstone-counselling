import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Testing the lead flow on a real phone over the LAN, otherwise Next blocks
  // its own dev resources as a cross-origin request. Development only.
  allowedDevOrigins: ['172.16.2.94'],
};

export default nextConfig;
