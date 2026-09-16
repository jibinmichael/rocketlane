"use client"

import { useState } from "react"

import type { FixtureFiles } from "@/app/actions/fixtures"
import { Body } from "@/components/shared/Typography"
import { Button } from "@/components/ui/button"
import type { IngestionReport } from "@/core/ingestion/report"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"

export function LabDatasetTab({
  loadFixture,
}: {
  loadFixture: (id: string) => Promise<FixtureFiles>
}) {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const [projectsFile, setProjectsFile] = useState<File | null>(null)
  const [tasksFile, setTasksFile] = useState<File | null>(null)
  const [report, setReport] = useState<IngestionReport | null>(snapshot.report)
  const [busy, setBusy] = useState(false)

  const upload = async () => {
    if (!projectsFile || !tasksFile) return
    setBusy(true)
    try {
      const [p, t] = await Promise.all([projectsFile.text(), tasksFile.text()])
      setReport(runtime.loadCsv(projectsFile.name.replace(/\.csv$/i, ""), p, t))
    } finally {
      setBusy(false)
    }
  }

  const load = async (id: string) => {
    setBusy(true)
    try {
      const files = await loadFixture(id)
      setReport(runtime.loadCsv(files.id, files.projectsCsv, files.tasksCsv))
    } finally {
      setBusy(false)
    }
  }

  const graph = snapshot.graph
  const current = report ?? snapshot.report

  return (
    <div className="flex flex-col gap-6 pt-4">
      <section className="border-border flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-foreground text-[13px] font-medium">
            Loaded: {snapshot.datasetLabel || "—"}
          </span>
          {graph && (
            <span className="text-muted-foreground text-[12px] tabular-nums">
              {graph.projects.length} projects · {graph.tasks.length} tasks · {graph.actors.length}{" "}
              people
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void load("cascading-conflicts")}
          >
            Load demo workspace
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void load("rocketlane-export")}
          >
            Load Rocketlane export
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void runtime.resetDataset()}
          >
            Reset to original
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px] font-medium tracking-[0.005em] uppercase">
            Upload your own (Rocketlane two-file export)
          </span>
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
              Ingest
            </Button>
          </div>
          <Body muted className="text-[12px]">
            Parsed in your browser. Nothing is uploaded anywhere. Malformed rows are rejected and
            listed, never dropped silently.
          </Body>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.005em] uppercase">
            Acting as
          </h2>
        </div>
        <select
          value={snapshot.actorId ?? ""}
          onChange={(e) => runtime.setActor(e.target.value as never)}
          className="border-border bg-background text-foreground h-8 w-full max-w-sm rounded-md border px-2 text-[13px]"
          aria-label="Acting user"
        >
          {snapshot.actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.role}
            </option>
          ))}
        </select>
        <Body muted className="text-[12px]">
          Permissions are an abstract role boundary (owner / member / viewer), ours, not
          Rocketlane&apos;s.
        </Body>
      </section>

      {current && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground px-1 text-[11px] font-medium tracking-[0.005em] uppercase">
            Ingestion report · {current.datasetId} · {current.timingMs} ms
          </h2>
          <ul className="border-border divide-border divide-y rounded-lg border text-[13px]">
            <li className="grid grid-cols-6 gap-2 px-3 py-2 tabular-nums">
              {Object.entries(current.counts).map(([k, v]) => (
                <span key={k} className="flex flex-col">
                  <span className="text-muted-foreground text-[11px] uppercase">{k}</span>
                  <span className="text-foreground">{v}</span>
                </span>
              ))}
            </li>
            <li className="px-3 py-2">
              <span className="text-foreground font-medium">
                {current.rejected.length} rejected
              </span>
              {current.rejected.slice(0, 10).map((r, i) => (
                <div key={i} className="text-muted-foreground text-[12px]">
                  {r.file}:{r.line} · {r.reason} · {r.detail}
                </div>
              ))}
            </li>
            <li className="px-3 py-2">
              <span className="text-foreground font-medium">
                {current.warnings.length} warnings
              </span>
              {current.warnings.slice(0, 6).map((w, i) => (
                <div key={i} className="text-muted-foreground text-[12px]">
                  {w.file}:{w.line} · {w.reason} · {w.detail}
                </div>
              ))}
            </li>
            <li className="px-3 py-2">
              <span className="text-foreground font-medium">
                {current.findings.length} findings
              </span>
              {current.findings.map((f, i) => (
                <div key={i} className="text-muted-foreground text-[12px]">
                  <span className="text-foreground">{f.kind}</span> · {f.detail}
                </div>
              ))}
            </li>
          </ul>
        </section>
      )}
    </div>
  )
}
