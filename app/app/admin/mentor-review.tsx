"use client";

import { reviewMentorAction } from "@/app/actions";
import { Button, Notice } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

export function MentorReview({ profileId }: { profileId: string }) {
  const { run, pending, error } = useAction();
  return (
    <div className="mt-4 space-y-2">
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => reviewMentorAction(profileId, true))}>
          Aprobar como mentor/a
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => reviewMentorAction(profileId, false))}>
          No aprobar
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
