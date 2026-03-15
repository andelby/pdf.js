/* Copyright 2025 - WebView2/WinUI3 API Bridge for PDF.js - Smart Cursor Module
 *
 * Smart default cursor (text-select / hand-pan).
 * When no annotation tool is active this replaces pdf.js's static SELECT/HAND
 * cursor modes with a combined "smart" mode identical to modern PDF readers:
 *
 *   pointer over a text span  → I-beam, browser-native text selection
 *   pointer elsewhere         → grab, pointer-drag scrolls the viewport
 *
 * When an annotation tool is active (ink, highlight, freetext …) the handler
 * yields completely so pdf.js can drive its own cursors and gestures.
 *
 * Implementation notes
 *   • All checks use lazy property reads (no eventBus subscriptions) so the
 *     handler works correctly whether or not a document is loaded.
 *   • setPointerCapture routes move/up events to the container even when the
 *     pointer wanders outside, giving smooth pan at the viewport edges.
 *   • We skip the scrollbar gutter so native scroll-track clicks are unaffected.
 */

;(function initSmartDefaultCursor() {
  function setup() {
    const container = document.getElementById('viewerContainer')
    if (!container) return

    let panning       = false
    let selecting     = false
    let panOriginX    = 0, panOriginY    = 0
    let scrollOriginX = 0, scrollOriginY = 0

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Returns true when an annotation editor tool (ink, highlight, etc.) is on. */
    function isAnnotating() {
      const mode = window.PDFViewerApplication?.pdfViewer?.annotationEditorMode
      return typeof mode === 'number' && mode > 0
    }

    /** Returns the cursor shape for the current annotation mode, or null to leave it unchanged. */
    function annotationCursor() {
      const app = window.PDFViewerApplication
      const mode = app?.pdfViewer?.annotationEditorMode
      if (mode !== 15) return 'arrow' // non-ink annotation tool → arrow
      // INK mode: crosshair only when actively drawing (not single-selection view)
      const uiManager = app?.pdfViewer?._layerProperties?.annotationEditorUIManager
      return uiManager?._singleSelectionMode ? null : 'crosshair'
    }

    /**
     * Returns true when the pointer is inside the OS scrollbar gutter
     * (the narrow strip at the right/bottom edge of the container).
     */
    function overScrollbarGutter(e) {
      const sw = container.offsetWidth  - container.clientWidth
      const sh = container.offsetHeight - container.clientHeight
      if (sw <= 0 && sh <= 0) return false
      const r = container.getBoundingClientRect()
      return (sw > 0 && e.clientX >= r.right  - sw - 2) ||
             (sh > 0 && e.clientY >= r.bottom - sh - 2)
    }

    /**
     * Returns true when the pointer is directly over a selectable text span.
     * Used only to decide whether to start a pan or let the browser select text.
     * (The cursor itself is always 'hand' in default mode regardless.)
     */
    function overTextLayer(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const tag = el?.tagName
      return (tag === 'SPAN' || tag === 'BR') && !!el?.closest?.('.textLayer')
    }

    /** Returns true when the pointer is over a clickable PDF link/button. */
    function overLink(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      return !!el?.closest?.('.annotationLayer .linkAnnotation, .annotationLayer .buttonWidgetAnnotation.pushButton')
    }

    // ── cursor state ───────────────────────────────────────────────────────
    // Shapes: 'hand' | 'grabbing' | 'selecting' | 'default'

    let _lastShape = ''

    function setCursorShape(shape) {
      if (shape === _lastShape) return
      _lastShape = shape
       container.classList.remove('swiftpdf-grab', 'swiftpdf-grabbing', 'swiftpdf-selecting')
      if (shape === 'hand')      container.classList.add('swiftpdf-grab')
      if (shape === 'grabbing')  container.classList.add('swiftpdf-grabbing')
      if (shape === 'selecting') container.classList.add('swiftpdf-selecting')
      window.chrome?.webview?.postMessage(
        JSON.stringify({ type: 'cursor', shape }))
    }

    // ── pointer events ───────────────────────────────────────────────────────

    container.addEventListener('pointermove', e => {
      if (isAnnotating()) {
        if (!panning) { const s = annotationCursor(); if (s) setCursorShape(s) }
        return
      }

      if (panning) {
        container.scrollLeft = scrollOriginX + (panOriginX - e.clientX)
        container.scrollTop  = scrollOriginY + (panOriginY - e.clientY)
        return
      }

      // While dragging a text selection, keep I-beam even outside text spans.
      if (selecting) return

      if (overScrollbarGutter(e)) {
        setCursorShape('arrow')
        return
      }

      setCursorShape(overTextLayer(e) ? 'selecting' : overLink(e) ? 'arrow' : 'hand')
    })

    container.addEventListener('pointerdown', e => {
      if (isAnnotating() || e.button !== 0 || overScrollbarGutter(e)) return

      // Over text or link: let the browser handle natively.
      if (overTextLayer(e)) {
        selecting = true
        setCursorShape('selecting')
        return
      }
      if (overLink(e)) return

      e.preventDefault()
      window.getSelection()?.removeAllRanges()
      panning       = true
      panOriginX    = e.clientX;  panOriginY    = e.clientY
      scrollOriginX = container.scrollLeft
      scrollOriginY = container.scrollTop

      setCursorShape('grabbing')
    })

    // ── window-level pan drag + pan end ──────────────────────────────────────

    window.addEventListener('pointermove', e => {
      if (!panning) return
      container.scrollLeft = scrollOriginX + (panOriginX - e.clientX)
      container.scrollTop  = scrollOriginY + (panOriginY - e.clientY)
    })

    function endPan() {
      if (!panning) return
      panning = false
      setCursorShape('hand')
    }

    function endSelect() {
      if (!selecting) return
      selecting = false
      setCursorShape('hand')
    }

    window.addEventListener('pointerup',     () => { endPan(); endSelect() })
    window.addEventListener('pointercancel', () => { endPan(); endSelect() })

    container.addEventListener('pointerleave', () => {
      if (panning) return
      if (isAnnotating()) { const s = annotationCursor(); if (s) setCursorShape(s) }
      else setCursorShape('arrow')
    })

    // Immediately update cursor when annotation mode changes (no pointermove needed).
    window.PDFViewerApplication?.initializedPromise?.then(() => {
      window.PDFViewerApplication?.eventBus?._on('annotationeditormodechanged', ({ mode }) => {
        if (panning) return
        if (mode === 0) { setCursorShape('hand'); return }
        const s = annotationCursor()
        if (s) setCursorShape(s)
      })
    })
    
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', setup)
  else
    setup()
})()
