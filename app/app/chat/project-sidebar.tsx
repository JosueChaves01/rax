"use client";

import { useState } from "react";
import type { AgentThread } from "@/types/domain";

interface ProjectSidebarProps {
  projects: Array<{ id: string; name: string }>;
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  threads: AgentThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  onOpenInstructions: () => void;
  onOpenKnowledge: () => void;
  /** Cierra el cajón en móvil. En escritorio el botón no se muestra. */
  onClose?: () => void;
  knowledgeTokens?: number;
  knowledgeMode?: "in_context" | "rag";
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  onSelectProject,
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onRenameThread,
  onOpenInstructions,
  onOpenKnowledge,
  onClose,
  knowledgeTokens = 0,
  knowledgeMode = "in_context",
}: ProjectSidebarProps) {
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const handleStartRename = (thread: AgentThread, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(thread.id);
    setEditingTitle(thread.title);
  };

  const handleSaveRename = (threadId: string) => {
    if (editingTitle.trim()) {
      onRenameThread(threadId, editingTitle.trim());
    }
    setEditingThreadId(null);
  };

  return (
    <div className="w-[85vw] max-w-72 md:w-72 shrink-0 border-r border-slate-200 bg-slate-50/70 flex flex-col h-full overflow-hidden select-none">
      {/* 1. Selector de Proyecto */}
      <div className="p-3.5 border-b border-slate-200/80 bg-white">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
            Proyecto Activo
          </label>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="md:hidden -mr-1 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Cerrar panel"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <select
          value={activeProjectId}
          onChange={(e) => onSelectProject(e.target.value)}
          className="w-full text-xs font-semibold p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-slate-800"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Botón Nuevo Chat */}
      <div className="p-3">
        <button
          onClick={onNewThread}
          className="w-full flex items-center justify-center gap-2 py-2 px-3.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 active:bg-orange-800 rounded-xl shadow-xs transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Chat
        </button>
      </div>

      {/* 3. Lista de Chats / Hilos Aislados */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        <div className="px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
          Chats del Proyecto ({threads.length})
        </div>

        {threads.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            No hay chats aún en este proyecto.
          </div>
        ) : (
          threads.map((t) => {
            const isActive = t.id === activeThreadId;
            const isEditing = editingThreadId === t.id;

            return (
              <div
                key={t.id}
                onClick={() => onSelectThread(t.id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer transition ${
                  isActive
                    ? "bg-white text-orange-600 font-semibold shadow-xs border border-slate-200/80"
                    : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
                  <svg
                    className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-orange-500" : "text-slate-400"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>

                  {isEditing ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleSaveRename(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename(t.id);
                        if (e.key === "Escape") setEditingThreadId(null);
                      }}
                      autoFocus
                      className="w-full text-xs p-1 rounded border border-orange-400 bg-white"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate">{t.title}</span>
                  )}
                </div>

                {!isEditing && (
                  <button
                    onClick={(e) => handleStartRename(t, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 rounded transition shrink-0"
                    title="Renombrar chat"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 4. Menú inferior del Proyecto: Instrucciones y Conocimiento */}
      <div className="p-3 border-t border-slate-200/80 bg-white space-y-1.5">
        <button
          onClick={onOpenInstructions}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Instrucciones
          </span>
          <span className="text-[0.625rem] text-slate-400 font-mono">System</span>
        </button>

        <button
          onClick={onOpenKnowledge}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Conocimiento
          </span>
          <span
            className={`text-[0.625rem] font-bold px-1.5 py-0.5 rounded-full ${
              knowledgeMode === "in_context"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-purple-100 text-purple-800"
            }`}
          >
            {knowledgeTokens > 0 ? `${Math.round(knowledgeTokens / 1000)}k tkn` : "0"}
          </span>
        </button>
      </div>
    </div>
  );
}

