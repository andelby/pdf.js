/* Copyright 2025 - WebView2/WinUI3 API Bridge for PDF.js - Init Module
 *
 * Early options override - must run before PDFViewerApplication.run()
 */

// Must run before PDFViewerApplication.run() reads AppOptions.
//
// pdf.js registers its DOMContentLoaded listener with capture=true; we do the
// same. Because this script is positioned before viewer.mjs in the document,
// our capture listener is registered first and therefore fires first, letting
// us override options before run() is called — even without a recompile.
;(function applyEarlyOptions() {
  function tryApply() {
    const opts = window.PDFViewerApplicationOptions
    if (!opts) return false
    opts.set("defaultUrl",    "")    // never auto-load a PDF; host always calls openBase64()
    opts.set("disableHistory", true) // history is managed by the WinUI3 host
    opts.set("verbosity",     0)     // silence pdf.js console output
    return true
  }

  // If viewer.mjs already ran (options available now), apply immediately.
  // Otherwise register a capture-phase DOMContentLoaded listener which fires
  // before pdf.js's own capture listener calls PDFViewerApplication.run().
  if (!tryApply()) {
    document.addEventListener("DOMContentLoaded", tryApply, { capture: true, once: true })
  }
})()
