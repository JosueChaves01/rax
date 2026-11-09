import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { isB2BFlow } from "@/lib/flags";
import { getMentorProfile } from "@/lib/services/mentor-profile";
import { listMentorDocuments } from "@/lib/services/mentor-knowledge";
import { MentorProfileView } from "./profile-view";

export const metadata = { title: "Mi perfil de mentor · RAX" };

export default async function MentorProfilePage() {
  if (!isB2BFlow()) redirect("/app");
  const d = await getDeps();
  if (!d) redirect("/entrar");
  if (d.actor.role !== "mentor") redirect("/app");

  const [profile, documents, ownResources] = await Promise.all([
    getMentorProfile(d),
    listMentorDocuments(d),
    d.repo.mentorResources.count({ authorMentorId: d.actor.id }).catch(() => 0),
  ]);

  return <MentorProfileView initialProfile={profile} initialDocuments={documents} ownResources={ownResources} />;
}
