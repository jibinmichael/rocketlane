"use client"

import { useId, useState } from "react"
import { FileText, TriangleAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { IngestionReport } from "@/core/ingestion/report"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"
import { cn } from "@/lib/utils"

/**
 * "Test with project data" (final brief §27–§28). Upload a Rocketlane two-file export; it is
 * parsed, validated and normalised in the browser by the same ingestion the demo data uses, then
 * the same agent runs against it. Nothing is special-cased; the dataset changes, the engine does
 * not. Malformed records are rejected and listed, never dropped silently.
 */
export function AgentDataPanel({
  onLoaded,
  onClose,
}: {
  onLoaded?: () => void
  onClose?: () => void
}) {
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
      className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-foreground text-[13px] font-medium">
            Test with your project data
          </span>
          <p className="text-muted-foreground text-[12px] leading-[1.5]">
            A Rocketlane two-file export. Parsed in your browser; nothing leaves it. The same agent,
            governance and verification run against whatever you load.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)]"
          >
            <X aria-hidden className="size-3.5" strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilePick label="projects.csv" file={projectsFile} onPick={setProjectsFile} />
        <FilePick label="tasks.csv" file={tasksFile} onPick={setTasksFile} />
        <Button
          size="sm"
          className="ml-auto rounded-full"
          disabled={!projectsFile || !tasksFile || busy}
          onClick={() => void upload()}
        >
          Load
        </Button>
      </div>

      {current && (
        <div className="border-border flex flex-col gap-1 border-t pt-3 text-[13px]">
          <p className="text-foreground">
            Project data loaded. I found {current.counts.projects}{" "}
            {current.counts.projects === 1 ? "project" : "projects"} and {current.counts.tasks}{" "}
            {current.counts.tasks === 1 ? "task" : "tasks"}
            {current.counts.dependencies > 0
              ? ` with ${current.counts.dependencies} ${current.counts.dependencies === 1 ? "dependency" : "dependencies"}`
              : ""}
            .
          </p>
          <p
            className={cn(
              "flex items-start gap-1.5",
              attention > 0 ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {attention > 0 && (
              <TriangleAlert
                aria-hidden
                className="text-state-waiting mt-[3px] size-3.5 shrink-0"
                strokeWidth={1.75}
              />
            )}
            <span>
              {attention > 0
                ? `${attention} ${attention === 1 ? "record needs" : "records need"} attention and ${current.findings.length} data ${current.findings.length === 1 ? "finding" : "findings"} are listed below. Nothing was dropped silently.`
                : "No data-quality issues."}
            </span>
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
            <ul className="border-border divide-border mt-1 divide-y rounded-lg border text-[12px]">
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

/** A file input styled as a quiet pill; the native input stays for the browser and for scripts. */
function FilePick({
  label,
  file,
  onPick,
}: {
  label: string
  file: File | null
  onPick: (f: File | null) => void
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={cn(
        "border-border hover:bg-muted flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-[12.5px] transition-colors duration-[var(--motion-fast)]",
        file ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <FileText aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="max-w-[180px] truncate">{file ? file.name : label}</span>
      <input
        id={id}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
    </label>
  )
}
