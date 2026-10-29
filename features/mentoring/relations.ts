import type { CompatibilityStatus, MentorshipStage } from "@/types/domain";
import { invalidTransition, validation } from "@/lib/errors";

export const MENTORSHIP_STAGE_TRANSITIONS: Record<MentorshipStage, MentorshipStage[]> = {
  exploration: ["diagnosis", "closed"],
  diagnosis: ["exploration", "agreement", "closed"],
  agreement: ["diagnosis", "active_mentoring", "closed"],
  active_mentoring: ["agreement", "evaluation", "renewed", "closed"],
  evaluation: ["renewed", "closed", "active_mentoring"],
  renewed: ["diagnosis", "agreement", "active_mentoring", "closed"],
  closed: ["renewed"],
};

export function assertMentorshipStageTransition(from: MentorshipStage, to: MentorshipStage) {
  if (!MENTORSHIP_STAGE_TRANSITIONS[from].includes(to)) {
    throw invalidTransition(from, to);
  }
}

export function assertCanDecideCompatibility(currentStatus: CompatibilityStatus, newStatus: CompatibilityStatus) {
  if (currentStatus !== "pending" && currentStatus !== "needs_info" && newStatus === currentStatus) {
    throw validation(`La decisión de compatibilidad ya se encuentra en estado "${currentStatus}".`);
  }
}

