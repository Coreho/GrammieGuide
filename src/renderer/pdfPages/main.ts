import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/**
 * Runs in a hidden, sandboxed window with no preload and no network (services/ravelry/pdfPages.ts).
 * Main calls these two functions; a hostile PDF can only ever produce a picture or an error.
 */
GlobalWorkerOptions.workerSrc = workerUrl

let document_: PDFDocumentProxy | undefined

const page = globalThis as unknown as {
  openPdf: (base64: string) => Promise<number>
  renderPage: (number: number, edge: number) => Promise<string>
}

page.openPdf = async (base64) => {
  const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  document_ = await getDocument({ data, isEvalSupported: false, disableFontFace: false }).promise
  return document_.numPages
}

page.renderPage = async (number, edge) => {
  const pdfPage = await document_!.getPage(number)
  const natural = pdfPage.getViewport({ scale: 1 })
  const viewport = pdfPage.getViewport({ scale: edge / Math.max(natural.width, natural.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  // The print intent draws without requestAnimationFrame, which never fires in a hidden window.
  await pdfPage.render({ canvas, viewport, intent: 'print' }).promise
  pdfPage.cleanup()
  return canvas.toDataURL('image/jpeg', 0.92)
}
