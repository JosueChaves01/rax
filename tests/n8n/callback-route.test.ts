import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { generateHmacSignature } from "@/lib/n8n/security";

const { insertAudit, repository } = vi.hoisted(() => {
  const insertAudit = vi.fn();
  const repository = vi.fn(() => ({ auditEvents: { insert: insertAudit } }));
  return { insertAudit, repository };
});

vi.mock("@/lib/supabase/server", () => ({ createSystemClient: vi.fn(() => ({})) }));
vi.mock("@/lib/data/supabase-db", () => ({ supabaseDb: vi.fn((client) => client) }));
vi.mock("@/lib/data/supabase-repository", () => ({ createPgRepository: repository }));

import { POST } from "@/app/api/n8n/callback/route";

const secret = "test-shared-secret";

function makeRequest(data: { proposals?: unknown[] } = {}) {
  const payload = {
    operationId: "op-1",
    correlationId: "corr-1",
    workflowId: "RAX-04",
    status: "completed",
    data: { proposals: data.proposals ?? [] },
  };
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return new NextRequest("https://rax.example.test/api/n8n/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rax-timestamp": timestamp,
      "x-rax-signature": generateHmacSignature(body, timestamp, secret),
    },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("RAX_N8N_SHARED_SECRET", secret);
  insertAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("n8n callback route", () => {
  it("does not acknowledge domain proposals before they can be tied to an authorized operation", async () => {
    const response = await POST(makeRequest({ proposals: [{ type: "task", title: "Revisar datos" }] }));
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body).toMatchObject({ ok: false, persisted: false, error: "proposal_persistence_not_implemented" });
    expect(insertAudit).toHaveBeenCalledOnce();
  });

  it("returns a metadata-only acknowledgement when the audit record was saved", async () => {
    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, persisted: "audit_only", proposalsReceived: 0 });
  });

  it("does not acknowledge when the audit record could not be persisted", async () => {
    insertAudit.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ ok: false, persisted: false, error: "callback_audit_persistence_failed" });
  });
});
