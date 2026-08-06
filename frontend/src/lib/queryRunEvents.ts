type RunQueryListener = (sql: string) => void

let listeners: RunQueryListener[] = []

/** Subscribe to requests to run a query in the active editor tab. */
export function onRunQueryRequested(listener: RunQueryListener): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

/** Request the QueryEditor to load and run the given SQL in the active tab. */
export function requestRunQuery(sql: string) {
  for (const listener of [...listeners]) {
    try {
      listener(sql)
    } catch {
      // A failed subscriber must not break the others.
    }
  }
}
