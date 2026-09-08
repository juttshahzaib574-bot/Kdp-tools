"use client";

// Renders PDF pages to <canvas> using pdfjs-dist — the same library
// Firefox and every serious in-browser viewer uses, so what we display
// really is the file, not an approximation.
//
// pdfjs is a big module (~1.5 MB of parsed JS on top of a ~2.4 MB
// worker script), so it's loaded lazily on the first call to loadPdf
// rather than at module import — otherwise every page that imports
// anything from this file pays that cost eagerly at page load, which
// on low-end mobile Chromium can crash the tab. The dynamic import is
// cached, so only the first loadPdf pays the download; subsequent
// calls are instant.
//
// pdfjs's worker script has to load via a same-origin URL — Next 16's
// Turbopack rewrites `new URL(<npm path>, import.meta.url)` into a
// bundled asset URL at build time. Importing the "legacy" build (not
// the main entry) gives us a plain ESM worker file that both Turbopack
// and every browser can serve as application/javascript.

let cachedPdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;
let workerConfigured = false;

async function getPdfjs() {
  if (!cachedPdfjs) {
    cachedPdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  if (!workerConfigured) {
    const workerUrl = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url);
    cachedPdfjs.GlobalWorkerOptions.workerSrc = workerUrl.toString();
    workerConfigured = true;
  }
  return cachedPdfjs;
}

/** A page's intrinsic size in PDF points — the trim (plus bleed), exactly as the file declares it. */
export interface PdfPageSize {
  widthPt: number;
  heightPt: number;
}

export interface LoadedPdf {
  numPages: number;
  /**
   * One page's own coordinate space, before any scaling.
   *
   * A viewer needs this BEFORE it renders: it's what lets the page box
   * be sized and centred in one layout pass, instead of rendering at a
   * guessed width and discovering the real aspect ratio afterwards.
   */
  getPageSize: (pageNumber: number) => Promise<PdfPageSize>;
  /** Renders one page into a fresh <canvas> at the given CSS-pixel width, using devicePixelRatio for a crisp image. */
  renderPage: (pageNumber: number, cssWidth: number) => Promise<HTMLCanvasElement>;
  /** Frees the underlying pdfjs document — call from a component's cleanup. */
  destroy: () => Promise<void>;
}

export async function loadPdf(bytes: Uint8Array): Promise<LoadedPdf> {
  const pdfjs = await getPdfjs();
  // pdfjs takes ownership of the buffer and would detach it on transfer; copy
  // once so the caller can keep using the same bytes elsewhere (e.g. the
  // Download button uses the same Uint8Array as the viewer).
  const copy = new Uint8Array(bytes);
  // pdfjs.getDocument returns a loading task whose .promise resolves to the
  // document; the task itself owns .destroy(), which is what actually
  // releases both the worker-side and main-thread objects. The doc proxy's
  // own destroy is private (_destroy), so we hold the task for cleanup.
  const loadingTask = pdfjs.getDocument({ data: copy });
  const doc = await loadingTask.promise;

  async function renderPage(pageNumber: number, cssWidth: number): Promise<HTMLCanvasElement> {
    const page = await doc.getPage(pageNumber);
    try {
      const dpr = Math.max(1, Math.min(3, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
      const viewportAt1 = page.getViewport({ scale: 1 });
      const scale = (cssWidth * dpr) / viewportAt1.width;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssWidth * (viewportAt1.height / viewportAt1.width)}px`;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Couldn't get a 2D drawing context — the browser refused.");
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      return canvas;
    } finally {
      // pdfjs caches per-page objects internally; releasing here just drops
      // this render's reference so a long-lived viewer doesn't leak memory
      // as the reader flips through pages.
      page.cleanup();
    }
  }

  async function getPageSize(pageNumber: number): Promise<PdfPageSize> {
    const page = await doc.getPage(Math.max(1, Math.min(pageNumber, doc.numPages)));
    try {
      const viewport = page.getViewport({ scale: 1 });
      return { widthPt: viewport.width, heightPt: viewport.height };
    } finally {
      page.cleanup();
    }
  }

  return {
    numPages: doc.numPages,
    getPageSize,
    renderPage,
    destroy: async () => {
      await loadingTask.destroy();
    },
  };
}
