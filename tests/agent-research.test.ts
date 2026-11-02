import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph } from "docx";
import PDFDocument from "pdfkit";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { createAgentThread } from "@/lib/services/agent-chat";
import { runAgentTurn } from "@/lib/services/agent-turn";
import { addProjectDocument } from "@/lib/services/project-knowledge";
import { aggregateTable, describeTable, parseCsv, parseMarkdownTables, parseNumber, tableFromRows, tableToMarkdown } from "@/lib/documents/tables";
import { extractUploadedFile, ExtractionError } from "@/lib/documents/extract";
import { assertPublicUrl, htmlToText, isPrivateAddress, readWebPage, webSearch } from "@/lib/ai/web-search";
import { runResearchTool, researchTools } from "@/lib/ai/research-tools";
import { attachmentNote } from "@/lib/documents/uploads";

afterAll(closeWorlds);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Números y tablas", () => {
  it("lee números con formato local, moneda y porcentaje", () => {
    expect(parseNumber("₡1.234,50")).toBe(1234.5);
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("1.234")).toBe(1.234);
    expect(parseNumber("1.234.567")).toBe(1234567);
    expect(parseNumber("12 %")).toBe(12);
    expect(parseNumber("(300)")).toBe(-300);
    expect(parseNumber("-45")).toBe(-45);
    expect(parseNumber("Kit")).toBeNull();
    expect(parseNumber("2026-11-02")).toBeNull();
    expect(parseNumber(7)).toBe(7);
  });

  it("separa CSV con comillas y elige el separador", () => {
    expect(parseCsv('a;b\n"x; y";2\n')).toEqual([["a", "b"], ["x; y", "2"]]);
    expect(parseCsv('nombre,nota\n"Ana ""la mejor""",9\r\nLuis,7')).toEqual([["nombre", "nota"], ['Ana "la mejor"', "9"], ["Luis", "7"]]);
  });

  const ventas = tableFromRows("Ventas", [
    ["Producto", "Canal", "Monto", ""],
    ["Kit", "Instagram", "₡10.000", null],
    ["Kit", "Feria", "₡5.000", null],
    ["Semillas", "Instagram", "2500", null],
    ["Semillas", "Instagram", "", null],
  ])!;

  it("quita columnas vacías y describe columnas numéricas y de texto", () => {
    expect(ventas.columns).toEqual(["Producto", "Canal", "Monto"]);
    const d = describeTable(ventas);
    const monto = d.columns.find((c) => c.name === "Monto")!;
    expect(monto).toMatchObject({ type: "number", sum: 17500, min: 2500, max: 10000, empty: 1 });
    const canal = d.columns.find((c) => c.name === "Canal")!;
    expect(canal).toMatchObject({ type: "text", distinct: 2 });
    expect(canal.top?.[0]).toEqual({ value: "Instagram", count: 3 });
  });

  it("agrega con filtros y agrupación, sin importar tildes ni mayúsculas en las columnas", () => {
    const byProduct = aggregateTable(ventas, { metric: "monto", groupBy: "PRODUCTO" });
    expect(byProduct.results).toEqual([
      { group: "Kit", value: 15000, rows: 2 },
      { group: "Semillas", value: 2500, rows: 2 },
    ]);
    const ig = aggregateTable(ventas, { metric: "Monto", aggregation: "avg", filters: [{ column: "canal", value: "instagram" }] });
    expect(ig.results[0].value).toBe(6250);
    expect(ig.rowsMatched).toBe(3);
    const count = aggregateTable(ventas, { groupBy: "Canal" });
    expect(count.aggregation).toBe("count");
    expect(count.results[0]).toEqual({ group: "Instagram", value: 3, rows: 3 });
    const big = aggregateTable(ventas, { filters: [{ column: "Monto", op: "gte", value: "5000" }] });
    expect(big.results[0].value).toBe(2);
    expect(() => aggregateTable(ventas, { metric: "Precio" })).toThrow(/Columnas: Producto, Canal, Monto/);
  });

  it("guarda la tabla en Markdown y la vuelve a leer igual, con su hoja", () => {
    const withPipe = tableFromRows("Notas", [["Tema", "Detalle"], ["A|B", "uno"]])!;
    const md = `## Hoja: Ventas (4 filas, 3 columnas)\n\n${tableToMarkdown(ventas)}\n\n## Hoja: Notas\n\n${tableToMarkdown(withPipe)}`;
    const [t1, t2] = parseMarkdownTables(md);
    expect(t1.name).toBe("Ventas");
    expect(t1.columns).toEqual(ventas.columns);
    expect(t1.rows[0]).toEqual(["Kit", "Instagram", "₡10.000"]);
    expect(t1.rows[3][2]).toBeNull();
    expect(t2.name).toBe("Notas");
    expect(t2.rows[0][0]).toBe("A|B");
  });
});

async function xlsxBytes(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ventas octubre");
  ws.addRow(["Fecha", "Producto", "Unidades", "Total"]);
  ws.addRow([new Date(Date.UTC(2026, 9, 3)), "Kit", 2, { formula: "C2*8000", result: 16000 }]);
  ws.addRow([new Date(Date.UTC(2026, 9, 4)), "Semillas", 5, 12500]);
  wb.addWorksheet("Vacía");
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

async function pdfBytes(text: string): Promise<Uint8Array> {
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on("end", () => r()));
  doc.text(text);
  doc.addPage().text("Segunda página con conclusiones");
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

describe("Extraer texto de archivos subidos", () => {
  it("convierte un Excel en tablas con totales por columna (incluye fórmulas y fechas)", async () => {
    const out = await extractUploadedFile(await xlsxBytes(), "ventas_octubre.xlsx");
    expect(out).toMatchObject({ kind: "xlsx", fileType: "csv", title: "ventas octubre", detail: "1 hoja, 2 filas", truncated: false });
    expect(out.content).toContain("## Hoja: Ventas octubre (2 filas, 4 columnas)");
    expect(out.content).toContain("**Total** (número): suma 28");
    expect(out.content).toContain("| 2026-10-03 | Kit | 2 | 16000 |");
    const [t] = parseMarkdownTables(out.content);
    expect(t.name).toBe("Ventas octubre");
    expect(aggregateTable(t, { metric: "Total" }).results[0].value).toBe(28500);
  });

  it("lee un CSV, un Word y un PDF de varias páginas", async () => {
    const csv = await extractUploadedFile(new TextEncoder().encode("Cliente;Monto\nAna;1000\nLuis;2500\n"), "clientes.csv");
    expect(csv.kind).toBe("csv");
    expect(parseMarkdownTables(csv.content)[0].rows).toHaveLength(2);

    const word = new Document({ sections: [{ children: [new Paragraph("Entrevista con clientes"), new Paragraph("Les preocupa el precio.")] }] });
    const docx = await extractUploadedFile(new Uint8Array(await Packer.toBuffer(word)), "entrevistas.docx");
    expect(docx).toMatchObject({ kind: "docx", fileType: "text" });
    expect(docx.content).toContain("Les preocupa el precio.");

    const pdf = await extractUploadedFile(await pdfBytes("Informe de mercado de huertas urbanas"), "informe.pdf");
    expect(pdf).toMatchObject({ kind: "pdf", fileType: "pdf", detail: "2 páginas" });
    expect(pdf.content).toContain("## Página 1");
    expect(pdf.content).toContain("huertas urbanas");
    expect(pdf.content).toContain("conclusiones");
  });

  it("rechaza formatos viejos, desconocidos o vacíos con un mensaje claro", async () => {
    const one = new Uint8Array([1]);
    await expect(extractUploadedFile(one, "ventas.xls")).rejects.toThrow(/\.xlsx/);
    await expect(extractUploadedFile(one, "foto.png")).rejects.toBeInstanceOf(ExtractionError);
    await expect(extractUploadedFile(new Uint8Array(), "a.csv")).rejects.toThrow(/vacío/);
    await expect(extractUploadedFile(new Uint8Array([1, 2, 3]), "roto.pdf")).rejects.toThrow(/PDF/);
  });

  it("arma la nota del adjunto para el mensaje", () => {
    expect(attachmentNote({ title: "x", filename: "x.xlsx", kind: "xlsx", fileType: "csv", detail: "1 hoja, 2 filas", truncated: false }, "Ventas")).toBe(
      "📎 Adjunté «Ventas» (Excel, 1 hoja, 2 filas).",
    );
  });
});

describe("Búsqueda web", () => {
  it("bloquea direcciones internas", async () => {
    for (const ip of ["127.0.0.1", "10.2.3.4", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    await expect(assertPublicUrl("http://localhost:3000/x")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/pública/);
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(assertPublicUrl("https://user:pw@example.com")).rejects.toThrow();
    await expect(assertPublicUrl("https://8.8.8.8:8080/")).rejects.toThrow(/puertos/);
    await expect(readWebPage("http://127.0.0.1/admin")).rejects.toThrow();
  });

  it("no sigue una redirección hacia la red interna", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secreto" } })));
    await expect(readWebPage("https://8.8.8.8/")).rejects.toThrow(/pública/);
  });

  it("saca el texto principal de una página HTML", () => {
    const page = htmlToText(
      "<html><head><title>Precios &amp; tarifas</title><style>.a{}</style></head><body><nav>Menú</nav><main><h1>Café</h1><p>Precio: &#8353;4.500</p><ul><li>Uno</li></ul><script>x()</script></main><footer>pie</footer></body></html>",
    );
    expect(page.title).toBe("Precios & tarifas");
    expect(page.text).toContain("## Café");
    expect(page.text).toContain("Precio: ₡4.500");
    expect(page.text).toContain("- Uno");
    expect(page.text).not.toMatch(/Menú|x\(\)|pie/);
  });

  it("usa Tavily si hay llave, si no Brave, y sin ninguna no ofrece las herramientas", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    expect(researchTools().map((t) => t.name)).toEqual(["read_project_document", "analyze_table_data"]);

    vi.stubEnv("TAVILY_API_KEY", "tv");
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("tavily")) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tv");
        return Response.json({ results: [{ title: "Mercado de café", url: "https://ejemplo.cr/cafe", content: "Creció 8 %" }] });
      }
      expect(new Headers(init?.headers).get("x-subscription-token")).toBe("bv");
      return Response.json({ web: { results: [{ title: "<b>Café</b>", url: "https://b.cr", description: "Dato &amp; más" }] } });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(researchTools().map((t) => t.name)).toContain("web_search");
    expect((await webSearch("café")).results[0]).toEqual({ title: "Mercado de café", url: "https://ejemplo.cr/cafe", snippet: "Creció 8 %" });

    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "bv");
    const brave = await webSearch("café");
    expect(brave.provider).toBe("brave");
    expect(brave.results[0]).toMatchObject({ title: "Café", snippet: "Dato & más" });
  });
});

describe("Herramientas del agente sobre documentos y la web", () => {
  it("lista, lee por partes y calcula sobre el Excel subido, solo con acceso al proyecto", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Huerta", description: "Kits de huerta urbana", nature: "exploring_idea" });
    const x = await extractUploadedFile(await xlsxBytes(), "ventas_octubre.xlsx");
    await addProjectDocument(ent, project.id, { title: "Ventas de octubre", filename: x.filename, content: x.content, fileType: x.fileType });
    await addProjectDocument(ent, project.id, { title: "Notas largas", filename: "notas.md", content: "a".repeat(25_000), fileType: "markdown" });

    const list = await runResearchTool(ent, project.id, "read_project_document", {});
    expect((list.data as { documents: Array<{ title: string }> }).documents.map((d) => d.title).sort()).toEqual(["Notas largas", "Ventas de octubre"]);

    const part = await runResearchTool(ent, project.id, "read_project_document", { document: "notas", part: 3 });
    expect(part.data).toMatchObject({ part: 3, parts: 3 });
    expect((part.data as { content: string }).content).toHaveLength(5_000);

    const described = await runResearchTool(ent, project.id, "analyze_table_data", { document: "ventas_octubre.xlsx" });
    expect(described.data).toMatchObject({ table: "Ventas octubre", rows: 2 });

    const total = await runResearchTool(ent, project.id, "analyze_table_data", {
      document: "Ventas de octubre",
      operation: "aggregate",
      metric: "Total",
      group_by: "Producto",
      filters: [{ column: "Unidades", op: "gt", value: "1" }],
    });
    expect((total.data as { results: unknown[] }).results).toEqual([
      { group: "Kit", value: 16000, rows: 1 },
      { group: "Semillas", value: 12500, rows: 1 },
    ]);

    const missing = await runResearchTool(ent, project.id, "analyze_table_data", { document: "Ventas", operation: "aggregate", metric: "Precio" });
    expect((missing.data as { error: string }).error).toContain("Columnas:");

    await expect(runResearchTool(w.as("ent2"), project.id, "read_project_document", {})).rejects.toThrow();
  });

  it("calcula también sobre un CSV guardado tal cual", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Feria", description: "Ventas en ferias", nature: "exploring_idea" });
    await addProjectDocument(ent, project.id, { title: "Ferias", filename: "ferias.csv", content: "Feria,Ventas\nEscazú,30000\nHeredia,12000", fileType: "csv" });
    const r = await runResearchTool(ent, project.id, "analyze_table_data", { document: "Ferias", operation: "aggregate", metric: "Ventas" });
    expect((r.data as { results: Array<{ value: number }> }).results[0].value).toBe(42000);
  });

  it("el agente busca en internet, lee el resultado y responde con la fuente", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Café Verde", description: "Café de especialidad", nature: "exploring_idea" });
    const thread = await createAgentThread(ent, project.id, "Competencia");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    vi.stubEnv("TAVILY_API_KEY", "tv");
    const bodies: Array<{ messages: Array<{ role: string; content: unknown; name?: string }>; tools?: Array<{ function: { name: string } }> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).includes("tavily")) {
          return Response.json({ results: [{ title: "Precios del café 2026", url: "https://ejemplo.cr/precios", content: "El kilo de café de especialidad ronda ₡12.000." }] });
        }
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        const message =
          bodies.length === 1
            ? { content: "", tool_calls: [{ id: "s1", type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: "precio café especialidad Costa Rica 2026" }) } }] }
            : { content: "Según [Precios del café 2026](https://ejemplo.cr/precios), el kilo ronda ₡12.000." };
        return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
      }),
    );

    const turn = await runAgentTurn(ent, { projectId: project.id, threadId: thread.id, message: "¿A cuánto venden el café de especialidad en Costa Rica?" });
    expect(bodies[0].tools?.map((t) => t.function.name)).toEqual(expect.arrayContaining(["web_search", "read_web_page", "read_project_document", "analyze_table_data"]));
    expect(JSON.stringify(bodies[0].messages[0].content)).toContain("cita cada dato con su enlace");
    const toolMsg = bodies[1].messages.find((m) => m.role === "tool");
    expect(String(toolMsg?.content)).toContain("ejemplo.cr/precios");
    expect(turn.result.reply).toContain("https://ejemplo.cr/precios");
    // Investigar es parte del razonamiento: no deja una nota «📌» en la respuesta.
    expect(turn.result.reply).not.toContain("📌");
  });
});
