"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { IngestionReport } from "@/core/ingestion/report"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

/**
 * "Test with project data" (final brief §27–§28). Upload a Rocketlane two-file export; it is
 * parsed, validated and normalised in the browser by the same ingestion the demo data uses, then
 * the same agent runs against it. Nothing is special-cased; the dataset changes, the engine does
 * not. Malformed records are rejected and listed, never dropped silently.
 */
export function AgentDataPanel({ onLoaded }: { onLoaded?: () => void }) {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const [projectsFile, setProjectsFile] = useState<File | null>(null)
  const [tasksFile, setTasksFile] = useState<File | null>(null)
  const [report, setReport] = useState<IngestionReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  const upload = async () => {
    if (!projectsFile || !tasksFile) return
    setBusy(true)
    try {
      const [p, t] = await Promise.all([projectsFile.text(), tasksFile.text()])
      setReport(runtime.loadCsv(projectsFile.name.replace(/\.csv$/i, ""), p, t))
      onLoaded?.()
    } finally {
      setBusy(false)
    }
  }

  const current = report ?? snapshot.report
  const attention = current ? current.rejected.length + current.warnings.length : 0

  return (
    <section
      aria-label="Test with project data"
      className="border-border flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-col gap-1">
        <span className="text-foreground text-[13px] font-medium">Test with your project data</span>
        <p className="text-muted-foreground text-[12px]">
          A Rocketlane two-file export. Parsed in your browser; nothing leaves it. The same agent,
          governance and verification run against whatever you load.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">projects.csv</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setProjectsFile(e.target.files?.[0] ?? null)}
            className="text-[12px]"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">tasks.csv</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setTasksFile(e.target.files?.[0] ?? null)}
            className="text-[12px]"
          />
        </label>
        <Button
          size="sm"
          disabled={!projectsFile || !tasksFile || busy}
          onClick={() => void upload()}
        >
          Load
        </Button>
      </div>

      {current && (
        <div className="flex flex-col gap-1 text-[13px]">
          <p className="text-foreground">
            Project data loaded. I found {current.counts.projects}{" "}
            {current.counts.projects === 1 ? "project" : "projects"} and {current.counts.tasks}{" "}
            {current.counts.tasks === 1 ? "task" : "tasks"}
            {current.counts.dependencies > 0
              ? ` with ${current.counts.dependencies} ${current.counts.dependencies === 1 ? "dependency" : "dependencies"}`
              : ""}
            .
          </p>
          <p className={attention > 0 ? "text-state-waiting" : "text-muted-foreground"}>
            {attention > 0
              ? `${attention} ${attention === 1 ? "record needs" : "records need"} attention and ${current.findings.length} data ${current.findings.length === 1 ? "finding" : "findings"} are listed below. Nothing was dropped silently.`
              : "No data-quality issues."}
          </p>
          <p className="text-muted-foreground">
            You can now test the agent against this dataset. State an outcome above.
          </p>
          {(attention > 0 || current.findings.length > 0) && (
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              aria-expanded={showDetail}
              className="text-muted-foreground hover:text-foreground mt-1 w-fit text-[12px] font-medium transition-colors duration-[var(--motion-fast)]"
            >
              {showDetail ? "Hide data findings" : "Show data findings"}
            </button>
          )}
          {showDetail && (
            <ul className="border-border divide-border mt-1 divide-y rounded-md border text-[12px]">
              {current.rejected.map((r, i) => (
                <li key={`r-${i}`} className="text-muted-foreground px-3 py-1.5">
                  <span className="text-foreground">Rejected</span> · {r.file}:{r.line} · {r.reason}{" "}
                  · {r.detail}
                </li>
              ))}
              {current.warnings.map((w, i) => (
                <li key={`w-${i}`} className="text-muted-foreground px-3 py-1.5">
                  <span className="text-foreground">Warning</span> · {w.file}:{w.line} · {w.reason}{" "}
                  · {w.detail}
                </li>
              ))}
              {current.findings.map((f, i) => (
                <li key={`f-${i}`} className="text-muted-foreground px-3 py-1.5">
                  <span className="text-foreground">{f.kind}</span> · {f.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
