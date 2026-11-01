import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit lee sus fuentes (.afm) del disco: se deja fuera del bundle para que las encuentre en Vercel.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/documentos": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
