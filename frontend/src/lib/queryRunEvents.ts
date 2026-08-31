type RunQueryListener = (sql: string) => void

let listeners: RunQueryListener[] = []


export function onRunQueryRequested(listener: RunQueryListener): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}


export function requestRunQuery(sql: string) {
  for (const listener of [...listeners]) {
    try {
      listener(sql)
    } catch {

    }
  }
}
