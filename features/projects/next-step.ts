import type { ProjectPhase } from "@/types/domain";

export type Viewer = "entrepreneur" | "mentor";

/** Sugerencia del siguiente paso según la fase real y quién mira. `tab` es la página del proyecto donde se hace. */
export const NEXT_STEP: Record<ProjectPhase, Record<Viewer, { text: string; tab: string }>> = {
  new: {
    entrepreneur: { text: "Contale a RAX tu idea con tus palabras. No hace falta tenerla clara.", tab: "conversacion" },
    mentor: { text: "El proyecto recién empieza. Todavía no hay contexto para revisar.", tab: "diagnostico" },
  },
  conversation: {
    entrepreneur: { text: "Seguí la conversación. Lo que no sepas queda como pregunta abierta.", tab: "conversacion" },
    mentor: { text: "El emprendedor está conversando. Podés dejar comentarios en el diagnóstico.", tab: "diagnostico" },
  },
  summary_pending: {
    entrepreneur: { text: "Revisá el resumen: ¿representa lo que querés hacer?", tab: "diagnostico" },
    mentor: { text: "Esperando que el emprendedor confirme su resumen inicial.", tab: "diagnostico" },
  },
  mentor_review_1: {
    entrepreneur: { text: "Pedí la primera revisión del mentor para orientar el enfoque.", tab: "orientar" },
    mentor: { text: "Primera revisión: leé el resumen preparado y orientá el enfoque.", tab: "orientar" },
  },
  prioritizing: {
    entrepreneur: { text: "Priorizá el problema a investigar primero, con una justificación.", tab: "diagnostico" },
    mentor: { text: "Ayudá a priorizar problemas en el diagnóstico.", tab: "diagnostico" },
  },
  hypotheses: {
    entrepreneur: { text: "Convertí la incertidumbre principal en una hipótesis comprobable.", tab: "validacion" },
    mentor: { text: "Hay hipótesis esperando tu aprobación.", tab: "validacion" },
  },
  experiments_preparing: {
    entrepreneur: { text: "Diseñá un experimento pequeño con criterios definidos antes de empezar.", tab: "validacion" },
    mentor: { text: "Revisá el diseño del experimento y sus criterios.", tab: "validacion" },
  },
  experiments_running: {
    entrepreneur: { text: "Ejecutá el experimento y registrá el resultado, sea cual sea.", tab: "validacion" },
    mentor: { text: "Experimento en curso. Podés acompañar las tareas.", tab: "tareas" },
  },
  results_review: {
    entrepreneur: { text: "Pedí la segunda revisión para decidir el siguiente paso.", tab: "decidir" },
    mentor: { text: "Segunda revisión: contrastá resultados con criterios y registrá una decisión.", tab: "decidir" },
  },
  decided: {
    entrepreneur: { text: "Etapa concluida. Revisá la decisión y su justificación.", tab: "decidir" },
    mentor: { text: "Decisión registrada para esta etapa.", tab: "decidir" },
  },
};
