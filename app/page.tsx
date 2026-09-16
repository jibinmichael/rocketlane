import { Body, H1 } from "@/components/shared/Typography"

// Interim shell so the build passes at build step 02. Replaced by the Governance Agent home
// at step 12, once the mission engine it renders exists (docs/agent-context/05-build-ledger.md).
export default function GovernanceAgentPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="flex max-w-[560px] flex-col gap-2">
        <H1>Governance Agent</H1>
        <Body muted>
          The conversation surface arrives after the mission engine. Build step 02 of 25.
        </Body>
      </div>
    </main>
  )
}
