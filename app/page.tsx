import { Suspense } from "react"

import { MissionHomeList } from "@/components/mission/MissionHomeList"

export default function GovernanceAgentPage() {
  return (
    <Suspense fallback={null}>
      <MissionHomeList />
    </Suspense>
  )
}
