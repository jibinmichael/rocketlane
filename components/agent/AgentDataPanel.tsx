"use client"

import { useId, useRef, useState, type DragEvent } from "react"

import { LinearIcon } from "@/components/shared/LinearIcon"
import { Button } from "@/components/ui/button"
import type { IngestionReport } from "@/core/ingestion/report"
import { useRuntime, useRuntimeSnapshot } from "@/hooks/use-runtime"
import { cn } from "@/lib/utils"

/**
 * Upload a Rocketlane two-file export (final brief §27–§28). Parsed, validated and normalised in
 * the browser by the same ingestion the demo data uses, then the same agent runs against it.
 * Nothing is special-cased; the dataset changes, the engine does not. Malformed records are
 * rejected and listed, never dropped silently. Files are matched to their role by name; either
 * row can be replaced.
 */
export function AgentDataPanel({ onLoaded }: { onLoaded?: () => void }) {
  const runtime = useRuntime()
  const snapshot = useRuntimeSnapshot()
  const [projectsFile, setProjectsFile] = useState<File | null>(null)
  const [tasksFile, setTasksFile] = useState<File | null>(null)
  const [report, setReport] = useState<IngestionReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()

  const accept = (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (!/\.csv$/i.test(f.name)) continue
      if (/task/i.test(f.name)) setTasksFile(f)
      else if (/project/i.test(f.name)) setProjectsFile(f)
      else if (!projectsFile) setProjectsFile(f)
      else setTasksFile(f)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    accept(e.dataTransfer.files)
  }

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

  const current = report
  const attention = current ? current.rejected.length + current.warnings.length : 0
  const ready = Boolean(projectsFile && tasksFile) && !busy

  return (
    <section aria-label="Test with project data" className="flex flex-col gap-4 px-5 pb-5">
      <p className="text-muted-foreground text-[13px] leading-[1.5]">
        A Rocketlane two-file export. Parsed in your browser; nothing leaves it. The same agent,
        governance and verification run against whatever you load.
      </p>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-7 text-center transition-colors duration-[var(--motion-fast)]",
          over ? "border-vibe-1 bg-vibe-1/5" : "border-border hover:bg-muted/60",
        )}
      >
        <LinearIcon name="upload" className="text-muted-foreground size-4" />
        <span className="text-foreground text-[13px]">
          Drop projects.csv and tasks.csv here, or{" "}
          <span className="text-vibe-1 font-medium">browse</span>
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={(e) => e.target.files && accept(e.target.files)}
          className="sr-only"
        />
      </label>

      <ul className="border-border divide-border divide-y rounded-xl border">
        <FileRow label="projects.csv" file={projectsFile} onClear={() => setProjectsFile(null)} />
        <FileRow label="tasks.csv" file={tasksFile} onClear={() => setTasksFile(null)} />
      </ul>

      {current && (
        <div className="bg-muted/60 flex flex-col gap-1 rounded-xl px-3.5 py-3 text-[13px]">
          <p className="text-foreground">
            Loaded {current.counts.projects}{" "}
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
              <LinearIcon
                name="alert"
                className="text-muted-foreground mt-[3px] size-3.5 shrink-0"
              />
            )}
            <span>
              {attention > 0
                ? `${attention} ${attention === 1 ? "record needs" : "records need"} attention. Nothing was dropped silently.`
                : "No data-quality issues."}
            </span>
          </p>
          {(attention > 0 || current.findings.length > 0) && (
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              aria-expanded={showDetail}
              className="text-muted-foreground hover:text-foreground w-fit text-[12px] font-medium transition-colors duration-[var(--motion-fast)]"
            >
              {showDetail ? "Hide data findings" : "Show data findings"}
            </button>
          )}
          {showDetail && (
            <ul className="border-border divide-border bg-card mt-1 max-h-48 divide-y overflow-y-auto rounded-lg border text-[12px]">
              {current.rejected.map((r, i) => (
                <li key={`r-${i}`} className="text-muted-foreground px-3 py-1.5">
                  <span className="text-foreground">Rejected</span> · {r.file}:{r.line} ·{" "}
                  {humanise(r.reason)} · {r.detail}
                </li>
              ))}
              {current.warnings.map((w, i) => (
                <li key={`w-${i}`} className="text-muted-foreground px-3 py-1.5">
                  <span className="text-foreground">Warning</span> · {w.file}:{w.line} ·{" "}
                  {humanise(w.reason)} · {w.detail}
                </li>
              ))}
              {current.findings.map((f, i) => (
                <li key={`f-${i}`} className="text-muted-foreground px-3 py-1.5">
                  <span className="text-foreground">{humanise(f.kind)}</span> · {f.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-[12px]">
          Current data: {snapshot.datasetLabel || "—"}
        </span>
        <Button
          size="sm"
          className="rounded-full px-3.5"
          disabled={!ready}
          onClick={() => void upload()}
        >
          {busy ? "Loading…" : "Load and test"}
        </Button>
      </div>
    </section>
  )
}

function FileRow({
  label,
  file,
  onClear,
}: {
  label: string
  file: File | null
  onClear: () => void
}) {
  return (
    <li className="flex h-11 items-center gap-3 px-3 text-[13px]">
      <LinearIcon
        name="document"
        className={cn("size-4 shrink-0", file ? "text-foreground" : "text-muted-foreground/60")}
      />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className={cn("truncate", file ? "text-foreground" : "text-muted-foreground")}>
          {file ? file.name : label}
        </span>
        <span className="text-muted-foreground text-[11px]">
          {file ? `Ready · ${formatSize(file.size)}` : "Not added"}
        </span>
      </span>
      {file && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove ${file.name}`}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-6 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)]"
        >
          <LinearIcon name="close" className="size-3" />
        </button>
      )}
    </li>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A code like MALFORMED_DATE reads as "Malformed date". */
function humanise(code: string): string {
  const words = code.toLowerCase().replace(/_/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}
