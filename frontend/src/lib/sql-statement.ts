// Extracts the SQL statement at a given cursor position in an editor document.
//
// A statement is the text bounded by the previous ';' (or start of the document)
// and the next ';' at/after the cursor (or end of the document). If the cursor
// sits over blank whitespace (e.g. right after a trailing ';'), the preceding
// statement is returned so that Ctrl+Enter always executes the finished query.

export function extractStatementAtCursor(fullText: string, cursorPos: number): string {
  const pos = Math.min(Math.max(0, cursorPos), fullText.length)

  // Find the previous ';' before the cursor (or start of the document).
  let start = 0
  for (let i = pos - 1; i >= 0; i--) {
    if (fullText[i] === ';') {
      start = i + 1
      break
    }
  }

  // Find the next ';' at/after the cursor (or end of the document).
  let end = fullText.length - 1
  for (let i = pos; i < fullText.length; i++) {
    if (fullText[i] === ';') {
      end = i
      break
    }
  }

  let snippet = fullText.slice(start, end + 1).trim()

  // Cursor over blank whitespace (e.g. right after a trailing ';'): fall back
  // to the preceding statement so Ctrl+Enter still runs the finished query.
  if (!snippet) {
    start = fullText.lastIndexOf(';', Math.max(0, start - 2)) + 1
    snippet = fullText.slice(start, end + 1).trim()
  }

  return snippet
}