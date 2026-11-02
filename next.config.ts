import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit lee sus fuentes (.afm) del disco: se deja fuera del bundle para que las encuentre en Vercel.
  // exceljs, mammoth y unpdf se cargan tal cual en Node (leer Excel, Word y PDF subidos).
  serverExternalPackages: ["pdfkit", "exceljs", "mammoth", "unpdf"],
  // El texto de un PDF o Excel subido viaja en el formulario al guardarlo (hasta ~1 MB de texto).
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  outputFileTracingIncludes: {
    "/api/documentos": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
