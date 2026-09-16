"use client"

import { createContext, useContext, useSyncExternalStore } from "react"

import type { Runtime, RuntimeSnapshot } from "@/lib/runtime"

export const RuntimeContext = createContext<Runtime | null>(null)

const SERVER_SNAPSHOT: RuntimeSnapshot = {
  status: "booting",
  error: null,
  datasetId: "",
  datasetLabel: "",
  graph: null,
  report: null,
  missions: [],
  actorId: null,
  actors: [],
  interpreterMode: "deterministic",
  lastInterpretedBy: null,
  busy: {},
  events: [],
  revision: 0,
}

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error("useRuntime must be used inside RuntimeProvider")
  return runtime
}

export function useRuntimeSnapshot(): RuntimeSnapshot {
  const runtime = useRuntime()
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, () => SERVER_SNAPSHOT)
}
