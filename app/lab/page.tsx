import { Body, H1 } from "@/components/shared/Typography"

// Operator surface. Built at build step 19; this shell keeps the route and the build valid until then.
export default function LabPage() {
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-2 px-6 py-10">
      <H1 className="text-[20px] tracking-[-0.01em]">Test Lab</H1>
      <Body muted className="text-[13px]">
        Upload a dataset, run scenarios, inject failures. Arrives at build step 19.
      </Body>
    </div>
  )
}
