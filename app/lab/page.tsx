import { loadFixture } from "@/app/actions/fixtures"
import { LabPanel } from "@/components/lab/LabPanel"

export default function LabPage() {
  return <LabPanel loadFixture={loadFixture} />
}
