import { mentorInbox } from "@/features/mentoring/inbox";
import { PHASE_LABEL } from "@/features/labels";
import type { ServiceDeps } from "./base";
import { getWorkspace, listMyProjects, type Workspace } from "./projects";
import { nextAction } from "./next-action";

export type PendingKind = "review" | "task" | "session" | "ai";

export interface PendingItem {
  id: string;
  title: string;
  detail: string;
  /** Texto corto a la derecha: fase, cantidad o antigüedad. */
  meta: string;
  kind: PendingKind;
  href: string;
}

const INBOX_TITLE = {
  first_review: "Primera revisión pedida",
  hypothesis: "Hipótesis por aprobar",
  second_review: "Segunda revisión pedida",
} as const;

/** Carga los proyectos de la persona; uno dañado no tumba el resto. */
export async function loadMyWorkspaces(d: ServiceDeps): Promise<Workspace[]> {
  const projects = await listMyProjects(d);
  const ws = await Promise.all(
    projects.map((p) =>
      getWorkspace(d, p.id).catch((e) => {
        console.error("[rax] no se pudo cargar el proyecto:", p.id, e instanceof Error ? e.message : e);
        return null;
      }),
    ),
  );
  return ws.filter((w): w is Workspace => w !== null);
}

/**
 * Lo que de verdad espera a la persona, derivado del estado de sus proyectos (sin textos fijos):
 * - Mentor: su bandeja (revisiones e hipótesis pedidas), más viejo primero.
 * - Emprendedor: cada proyecto donde le toca mover, con el siguiente paso, y sus tareas abiertas.
 * - Administración: nada aquí; su panel ya cuenta lo pendiente.
 */
export function pendingFor(role: ServiceDeps["actor"]["role"], actorId: string, workspaces: Workspace[]): PendingItem[] {
  if (role === "admin") return [];

  if (role === "mentor") {
    const inbox = mentorInbox(
      actorId,
      workspaces.map((w) => ({ id: w.project.id, name: w.project.name, sessions: w.sessions, hypotheses: w.hypotheses })),
    );
    return inbox.map((i) => ({
      id: `inbox-${i.kind}-${i.projectId}-${i.since}`,
      title: `${INBOX_TITLE[i.kind]} · ${i.projectName}`,
      detail: i.detail,
      meta: "Te toca",
      kind: "review",
      href: `/app/p/${i.projectId}/${i.tab}`,
    }));
  }

  const items: PendingItem[] = [];
  for (const w of workspaces) {
    if (w.isMentorView || w.phase === "decided") continue;
    const next = nextAction(w);
    if (next.turn !== "entrepreneur") continue;
    items.push({
      id: `next-${w.project.id}`,
      title: `Te toca · ${w.project.name}`,
      detail: next.text,
      meta: PHASE_LABEL[w.phase],
      kind: "ai",
      href: `/app/p/${w.project.id}/${next.tab}`,
    });
  }
  for (const w of workspaces) {
    if (w.isMentorView) continue;
    const open = w.tasks.filter((t) => t.status !== "done");
    if (!open.length) continue;
    const blocked = open.filter((t) => t.blockedReason).length;
    items.push({
      id: `tasks-${w.project.id}`,
      title: `${open.length} ${open.length === 1 ? "tarea abierta" : "tareas abiertas"} · ${w.project.name}`,
      detail: blocked ? `${blocked} con bloqueo reportado.` : `La primera: «${open[0].title}».`,
      meta: blocked ? "Bloqueo" : "Tareas",
      kind: "task",
      href: `/app/tareas?proyecto=${w.project.id}`,
    });
  }
  return items;
}
