import { Suspense } from "react"

import { loadFixture } from "@/app/actions/fixtures"
import { LabPanel } from "@/components/lab/LabPanel"

export default function LabPage() {
  return (
    <Suspense fallback={null}>
      <LabPanel loadFixture={loadFixture} />
    </Suspense>
  )
}
