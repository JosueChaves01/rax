import "server-only";
import type { AiProvider } from "./provider";
import { SimulatedProvider } from "./simulated";
import { DEFAULT_OPENROUTER_MODEL, OpenRouterProvider } from "./openrouter";

/**
 * Selección del proveedor. Con OPENROUTER_API_KEY se usa el modelo real; sin ella, la simulación,
 * que la interfaz declara como tal. Si el modelo real falla, NO se cae a la simulación (escenario G).
 */
export function getAiProvider(): AiProvider {
  const key = process.env.OPENROUTER_API_KEY;
  if (key) {
    const fallbacks = (process.env.OPENROUTER_FALLBACK_MODELS ?? "").split(",").filter((m) => m.trim());
    return new OpenRouterProvider(key, process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL, fallbacks);
  }
  return new SimulatedProvider();
}
