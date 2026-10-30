import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/n8n/health/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("RAX API health route", () => {
  it("reports local liveness without recursively calling the n8n webhook", async () => {
    vi.stubEnv("N8N_WEBHOOK_BASE_URL", "https://n8n.example.test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "must-not-count-as-n8n-secret");
    vi.stubEnv("RAX_N8N_SHARED_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.n8nIntegration).toEqual({
      enabled: true,
      sharedSecretConfigured: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
