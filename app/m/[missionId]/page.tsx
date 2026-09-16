import { ConversationThread } from "@/components/conversation/ConversationThread"

export default async function MissionPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params
  return <ConversationThread missionId={missionId} />
}
