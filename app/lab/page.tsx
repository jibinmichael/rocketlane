import { Suspense } from "react"

import { LabPanel } from "@/components/lab/LabPanel"

export default function LabPage() {
  return (
    <Suspense fallback={null}>
      <LabPanel />
    </Suspense>
  )
}
