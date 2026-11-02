import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { addProjectDocument } from "@/lib/services/project-knowledge";
import { documentSourceFromQuery } from "@/app/api/documentos/source";
import { parseMarkdownTables } from "@/lib/documents/tables";
import { tableToCsv } from "@/shared/ui/markdown-view";
import { documentKindLabel, documentPdfPreviewUrl, documentQuery } from "@/shared/ui/document-viewer";
import { extractUploadedFile } from "@/lib/documents/extract";
import { renderDocument } from "@/lib/documents";

afterAll(closeWorlds);

describe("Visor de documentos", () => {
  it("lee el documento del proyecto con su tipo y archivo de origen, y respeta el acceso", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Huerta", description: "Hortalizas", nature: "exploring_idea" });
    const csv = await extractUploadedFile(new TextEncoder().encode("Producto;Ventas\nTomate;₡10.000\nLechuga;₡2.500\n"), "ventas.csv");
    const doc = await addProjectDocument(ent, project.id, { title: csv.title, filename: csv.filename, content: csv.content, fileType: csv.fileType, source: "upload" });

    const q = new URLSearchParams(documentQuery({ proyecto: project.id, documento: doc.id }));
    const source = await documentSourceFromQuery(ent, q);
    expect(source).toMatchObject({ fileType: "csv", filename: "ventas.csv" });
    await expect(documentSourceFromQuery(w.as("ent2"), q)).rejects.toThrow();
    expect(await documentSourceFromQuery(ent, new URLSearchParams())).toBeNull();

    // El visor arma la tabla desde lo guardado y la puede bajar como CSV.
    const [table] = parseMarkdownTables(source!.content);
    expect(table.columns).toEqual(["Producto", "Ventas"]);
    expect(table.rows).toHaveLength(2);
    expect(tableToCsv(table)).toBe("﻿Producto,Ventas\r\nTomate,₡10.000\r\nLechuga,₡2.500");

    // Y el mismo contenido sale como PDF válido.
    const pdf = await renderDocument(source!, "pdf");
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("arma los enlaces y etiquetas del visor", () => {
    expect(documentPdfPreviewUrl({ mensaje: "m 1", artefacto: "a" })).toBe("/api/documentos?mensaje=m+1&artefacto=a&formato=pdf&ver=1");
    expect(documentKindLabel("ventas.xlsx")).toBe("Excel");
    expect(documentKindLabel("datos.CSV")).toBe("CSV");
    expect(documentKindLabel(null, "csv")).toBe("Tabla");
    expect(documentKindLabel("guia.md")).toBe("Markdown");
  });

  it("el build incluye las fuentes de pdfkit (en Vercel faltaban y la descarga del PDF fallaba)", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("./node_modules/pdfkit/js/standard-fonts/**/*");
  });
});
