import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides the floating "N" dev-tools button. It only ever shows in `next dev`;
  // build errors still surface in the error overlay.
  devIndicators: false,
};

export default nextConfig;
