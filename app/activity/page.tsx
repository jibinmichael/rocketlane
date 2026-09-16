import { Suspense } from "react"

import { ActivityTimeline } from "@/components/activity/ActivityTimeline"

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityTimeline />
    </Suspense>
  )
}
