import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit lee sus fuentes (.afm) del disco: se deja fuera del bundle para que las encuentre en Vercel.
  // exceljs, mammoth y unpdf se cargan tal cual en Node (leer Excel, Word y PDF subidos).
  serverExternalPackages: ["pdfkit", "exceljs", "mammoth", "unpdf"],
  // Pantallas retiradas (exploración, sugerencias, relaciones y evaluación global): los enlaces viejos
  // o guardados llegan al inicio en vez de a un 404.
  async redirects() {
    return ["/app/exploracion", "/app/sugerencias", "/app/relaciones", "/app/evaluacion"].map((source) => ({
      source,
      destination: "/app",
      permanent: false,
    }));
  },
  // El texto de un PDF o Excel subido viaja en el formulario al guardarlo (hasta ~1 MB de texto).
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // pdfkit 0.20 carga las fuentes estándar con imports internos («#standard-fonts/Helvetica»), que el
  // rastreo de archivos de Vercel no sigue: sin esto, en producción falla con «Cannot find module
  // …/pdfkit/js/standard-fonts/Helvetica.cjs». Se incluyen también los .afm y .icc de js/data.
  outputFileTracingIncludes: {
    "/api/documentos": ["./node_modules/pdfkit/js/standard-fonts/**/*", "./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
