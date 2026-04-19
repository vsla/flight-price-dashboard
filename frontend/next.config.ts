import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev: HMR, fonts, etc. when opening the app via LAN IP (phone / other PC)
  allowedDevOrigins: ["192.168.15.4", "192.168.15.9"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/photo-*",
      },
    ],
  },
};

export default nextConfig;
