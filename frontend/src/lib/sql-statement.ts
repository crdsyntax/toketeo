


export function extractStatementAtCursor(fullText: string, cursorPos: number): string {
  const pos = Math.min(Math.max(0, cursorPos), fullText.length)
  const charBefore = pos > 0 ? fullText[pos - 1] : ''

  let start = 0
  let end = fullText.length - 1

  if (charBefore === ';') {

    end = pos - 1
    for (let i = end - 1; i >= 0; i--) {
      if (fullText[i] === ';') {
        start = i + 1
        break
      }
    }
  } else {

    for (let i = pos - 1; i >= 0; i--) {
      if (fullText[i] === ';') {
        start = i + 1
        break
      }
    }


    for (let i = pos; i < fullText.length; i++) {
      if (fullText[i] === ';') {
        end = i
        break
      }
    }
  }

  let snippet = fullText.slice(start, end + 1).trim()


  if (!snippet) {
    start = fullText.lastIndexOf(';', Math.max(0, start - 2)) + 1
    snippet = fullText.slice(start, end + 1).trim()
  }

  return snippet
}