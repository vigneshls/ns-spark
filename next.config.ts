import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit loads its font files from disk; keep it (and exceljs) out of the bundle
  serverExternalPackages: ["pdfkit", "exceljs"],
};

export default nextConfig;
