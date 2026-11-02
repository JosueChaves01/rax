import "server-only";
import type { AiProvider } from "./provider";
import { SimulatedProvider } from "./simulated";
import { DEFAULT_OPENROUTER_MODEL, OpenRouterProvider } from "./openrouter";
import { hasLlmConfigured } from "./endpoints";

/**
 * Selección del proveedor. Con OPENROUTER_API_KEY o el modelo local (LOCAL_LLM_*) se usa el modelo real; sin ellos, la simulación,
 * que la interfaz declara como tal. Si el modelo real falla, NO se cae a la simulación (escenario G).
 */
export function getAiProvider(): AiProvider {
  if (hasLlmConfigured()) {
    const fallbacks = (process.env.OPENROUTER_FALLBACK_MODELS ?? "").split(",").filter((m) => m.trim());
    return new OpenRouterProvider(process.env.OPENROUTER_API_KEY ?? "", process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL, fallbacks);
  }
  return new SimulatedProvider();
}
