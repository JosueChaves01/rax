"use client";

import { useState } from "react";
import type { MentorProfile } from "@/types/b2b";
import type { MentorDocumentSummary } from "@/lib/services/mentor-knowledge";
import { MentorProfileHeader } from "./components/mentor-profile-header";
import { ProfileMethodologyTab } from "./components/profile-methodology-tab";
import { InterviewGuideTab } from "./components/interview-guide-tab";
import { KnowledgeTab } from "./components/knowledge-tab";
import { AssistantPreviewDrawer } from "./components/assistant-preview-drawer";

interface Props {
  actorName?: string;
  actorEmail?: string;
  initialProfile: MentorProfile;
  initialDocuments: MentorDocumentSummary[];
  ownResources: number;
}

type TabKey = "perfil" | "guia" | "conocimiento";

export function MentorProfileView({
  actorName = "",
  actorEmail = "",
  initialProfile,
  initialDocuments,
  ownResources,
}: Props) {
  const [profile, setProfile] = useState<MentorProfile>(initialProfile);
  const [documents, setDocuments] = useState<MentorDocumentSummary[]>(initialDocuments);
  const [activeTab, setActiveTab] = useState<TabKey>("perfil");
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  const totalTokens = documents.reduce((sum, d) => sum + d.tokenCount, 0);

  const tabs: Array<{ key: TabKey; label: string; count?: number; icon: string }> = [
    {
      key: "perfil",
      label: "Perfil y Metodología",
      count: profile.focusAreas.length,
      icon: "👤",
    },
    {
      key: "guia",
      label: "Guía de Entrevista (Intake)",
      count: profile.interviewGuide.length,
      icon: "📋",
    },
    {
      key: "conocimiento",
      label: "Conocimiento RAG",
      count: documents.length,
      icon: "📚",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* 1. Encabezado de Identidad y Estado */}
      <MentorProfileHeader
        actorName={actorName}
        actorEmail={actorEmail}
        headline={profile.headline}
        documentsCount={documents.length}
        totalTokens={totalTokens}
        questionsCount={profile.interviewGuide.length}
        focusCount={profile.focusAreas.length}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
      />

      {/* 2. Selector de Pestañas Moderno */}
      <div className="flex border-b border-slate-200">
        <div role="tablist" className="flex flex-wrap gap-2 sm:gap-3" aria-label="Secciones del perfil de mentor">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={`group flex items-center gap-2 border-b-2 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {typeof tab.count === "number" && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-mono transition ${
                      isActive
                        ? "bg-blue-100 text-blue-800"
                        : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Contenido de la Pestaña Activa */}
      <div>
        {activeTab === "perfil" && (
          <ProfileMethodologyTab
            initial={profile}
            onProfileUpdated={(updated) => setProfile(updated)}
          />
        )}

        {activeTab === "guia" && (
          <InterviewGuideTab
            initial={profile.interviewGuide}
            onGuideUpdated={(updatedQuestions) =>
              setProfile((prev) => ({ ...prev, interviewGuide: updatedQuestions }))
            }
          />
        )}

        {activeTab === "conocimiento" && (
          <KnowledgeTab
            initialDocuments={documents}
            ownResources={ownResources}
            onDocumentsUpdated={(updatedDocs) => setDocuments(updatedDocs)}
          />
        )}
      </div>

      {/* 4. Simulador / Vista Previa del Asistente IA */}
      <AssistantPreviewDrawer
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        mentorName={actorName}
        headline={profile.headline}
        methodology={profile.methodology}
        tone={profile.assistantTone}
        interviewGuide={profile.interviewGuide}
        documentsCount={documents.length}
      />
    </div>
  );
}
