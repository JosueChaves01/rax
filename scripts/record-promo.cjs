/**
 * Graba el video promocional (/promo) a MP4, cuadro a cuadro y con tiempo virtual, así el
 * resultado es fluido aunque la máquina sea lenta.
 *
 * Uso (con la app corriendo, por ejemplo `npm run build && npx next start -p 3100`):
 *   node scripts/record-promo.cjs [url] [salida.mp4]
 * Por defecto: http://localhost:3100/promo?grabar=1 → public/promo/rax-promo.mp4
 * Requiere Playwright (con Chromium) y ffmpeg instalados en la máquina.
 */
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const URL = process.argv[2] || "http://localhost:3100/promo?grabar=1";
const OUT = process.argv[3] || path.join(__dirname, "..", "public", "promo", "rax-promo.mp4");
const FPS = 30;
const TAIL_MS = 600; // cuadros extra al final para que el cierre respire

/**
 * Reemplaza el reloj del navegador por uno virtual. Hasta que se llama a __vt.enable(), todo
 * funciona normal (la página carga con el reloj real). También quita Element.animate para que
 * Framer Motion anime con requestAnimationFrame, que sí controlamos.
 */
function virtualTime() {
  const real = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window),
    perfNow: performance.now.bind(performance),
    dateNow: Date.now,
  };
  delete Element.prototype.animate;

  let on = false;
  let now = 0;
  let base = 0;
  let seq = 1e6;
  const timers = new Map();
  const rafs = new Map();

  window.setTimeout = (fn, ms = 0, ...a) => {
    if (!on) return real.setTimeout(fn, ms, ...a);
    const id = seq++;
    timers.set(id, { fn, at: now + Math.max(0, ms), a, every: 0 });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...a) => {
    if (!on) return real.setInterval(fn, ms, ...a);
    const id = seq++;
    const every = Math.max(1, ms);
    timers.set(id, { fn, at: now + every, a, every });
    return id;
  };
  window.clearTimeout = (id) => (timers.has(id) ? timers.delete(id) : real.clearTimeout(id));
  window.clearInterval = (id) => (timers.has(id) ? timers.delete(id) : real.clearInterval(id));
  window.requestAnimationFrame = (fn) => {
    if (!on) return real.raf(fn);
    const id = seq++;
    rafs.set(id, fn);
    return id;
  };
  window.cancelAnimationFrame = (id) => (rafs.has(id) ? rafs.delete(id) : real.caf(id));
  performance.now = () => (on ? now : real.perfNow());
  Date.now = () => (on ? base + now : real.dateNow());

  window.__vt = {
    enable() {
      now = real.perfNow();
      base = real.dateNow() - now;
      on = true;
    },
    /** Avanza `ms` milisegundos: corre los temporizadores vencidos y luego un cuadro de animación. */
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        now = Math.max(now, t.at);
        if (t.every) t.at += t.every;
        else timers.delete(id);
        try {
          t.fn(...t.a);
        } catch (e) {
          console.error(e);
        }
      }
      now = target;
      const list = [...rafs.values()];
      rafs.clear();
      for (const fn of list) {
        try {
          fn(now);
        } catch (e) {
          console.error(e);
        }
      }
    },
    /** Deja que React pinte lo que quedó pendiente (usa el reloj real). */
    settle: () => new Promise((r) => real.setTimeout(() => real.setTimeout(r, 0), 0)),
  };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "rax-promo-"));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("[página]", e.message));
  await page.addInitScript(virtualTime);
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__promo);
  await page.evaluate(() => document.fonts.ready);
  const total = await page.evaluate(() => window.__promo.total);
  await page.evaluate(() => {
    window.__vt.enable();
    window.__promo.start();
  });

  const limit = Number(process.env.PROMO_LIMIT_MS) || Infinity; // para pruebas rápidas
  const frames = Math.ceil((Math.min(total + TAIL_MS, limit) / 1000) * FPS);
  const step = 1000 / FPS;
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(async (ms) => {
      window.__vt.advance(ms);
      await window.__vt.settle();
    }, step);
    await page.screenshot({ path: path.join(tmp, `f${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 95 });
    if (i % FPS === 0) process.stdout.write(`\r${Math.round((i / frames) * 100)}% · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  await browser.close();
  process.stdout.write("\nCodificando MP4…\n");

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await new Promise((res, rej) => {
    const ff = spawn(
      "ffmpeg",
      ["-y", "-framerate", String(FPS), "-i", path.join(tmp, "f%05d.jpg"), "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT],
      { stdio: "inherit" },
    );
    ff.on("exit", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg salió con ${code}`))));
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Listo: ${OUT}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
