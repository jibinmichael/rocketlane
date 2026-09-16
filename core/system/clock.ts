/** Time is a port. core/ never calls Date.now or setTimeout directly (D-22). */
export interface Clock {
  now(): number
  sleep(ms: number): Promise<void>
}

/** Deterministic clock for tests and the scenario runner. `sleep` advances time instantly. */
export class VirtualClock implements Clock {
  private current: number

  constructor(start = 1_760_000_000_000) {
    this.current = start
  }

  now(): number {
    return this.current
  }

  advance(ms: number): void {
    this.current += ms
  }

  async sleep(ms: number): Promise<void> {
    this.current += ms
  }
}

export class BrowserClock implements Clock {
  now(): number {
    return Date.now()
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
