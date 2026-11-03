import { describe, expect, it } from "vitest";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { isStaleDeploymentError } from "@/shared/ui/stale-deployment";

describe("isStaleDeploymentError", () => {
  it("reconoce el error de Next cuando el servidor no encuentra la server action", () => {
    expect(isStaleDeploymentError(new UnrecognizedActionError('Server Action "4024bd" was not found on the server.'))).toBe(true);
  });

  it("reconoce el mensaje aunque el error llegue como Error genérico", () => {
    const err = new Error('Server Action "4024bdb64b3aee78916fb8068fc5ea5deb68688a9a" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action');
    expect(isStaleDeploymentError(err)).toBe(true);
  });

  it("no confunde otros errores", () => {
    expect(isStaleDeploymentError(new Error("fetch failed"))).toBe(false);
    expect(isStaleDeploymentError(null)).toBe(false);
  });
});
