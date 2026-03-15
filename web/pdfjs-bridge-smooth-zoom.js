/* Copyright 2025 - WebView2/WinUI3 API Bridge for PDF.js - Smooth Zoom Module
 *
 * Implements smooth Ctrl+scroll zoom via CSS transform: scale() on #viewer.
 * Layout is frozen during animation so no scroll events fire and there is no bouncing.
 */

// ── Smooth continuous zoom ────────────────────────────────────────────────────
//
// Commit strategy
// ───────────────
// Instead of a mathematical formula (which has residual error from PDF.js
// internal padding/centering constants), we use a direct measurement approach:
//
//  1. Apply the final CSS transform (lerpScale = targetScale) so
//     getBoundingClientRect() reads the exact last-frame visual position.
//  2. Snapshot a reference .page element's viewport rect WITH transform active.
//  3. Clear the transform and call pv.updateScale() to commit the new scale.
//  4. Read the reference element's rect again WITHOUT transform (new layout).
//  5. Scroll delta = (after - before): shifts scroll so the reference element
//     returns to exactly the same viewport position it had in step 2.
//
// No assumptions about PDF.js internals — purely empirical.
;(function initSmoothZoom() {

  const MIN_SCALE = 0.1
  const MAX_SCALE = 10.0

  const MOUSE_WHEEL_STEP     = 0.07
  const TOUCHPAD_SENSITIVITY = 0.0008
  const LERP_SPEED           = 0.20

  function setup() {
    const viewer    = document.querySelector('#viewer')
    const container = document.getElementById('viewerContainer')
    if (!viewer || !container) return

    const getPV = () => window.PDFViewerApplication?.pdfViewer

    let animating     = false
    let baseScale     = 1
    let targetScale   = 1
    let lerpScale     = 1
    let rafId         = null
    let viewerOriginX = 0   // anchor in #viewer element coords (horizontal)
    let viewerOriginY = 0   // anchor in #viewer element coords (vertical)

    function applyTransform(scale) {
      const ratio = scale / baseScale
      viewer.style.transformOrigin = `${viewerOriginX}px ${viewerOriginY}px`
      viewer.style.transform       = `scale(${ratio})`
    }

    function clearTransform() {
      viewer.style.transform       = ''
      viewer.style.transformOrigin = ''
    }

    // First .page element at least partially visible in the viewport.
    function findRefPage() {
      const containerTop = container.getBoundingClientRect().top
      for (const p of container.querySelectorAll('.page')) {
        if (p.getBoundingClientRect().bottom > containerTop) return p
      }
      return null
    }

    // Commit the final scale to PDF.js and compensate scroll so the reference
    // element (snapshotted with the CSS transform still active) stays put.
    function commit(refEl, beforeRect) {
      animating = false

      const pv = getPV()
      if (!pv?.pdfDocument) return

      const finalScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale))
      const ratio      = finalScale / pv.currentScale

      // Remove visual transform before handing back to PDF.js.
      clearTransform()

      if (Math.abs(ratio - 1) <= 0.0001) return

      pv.updateScale({ scaleFactor: ratio, noScroll: true })

      if (!refEl || !beforeRect) return

      // Read new layout position (forces synchronous reflow).
      const afterRect = refEl.getBoundingClientRect()

      // Compensate: shift scroll so the reference element sits at exactly the
      // same viewport position it occupied in the last animation frame.
      container.scrollLeft = Math.max(0, container.scrollLeft + (afterRect.left - beforeRect.left))
      container.scrollTop  = Math.max(0, container.scrollTop  + (afterRect.top  - beforeRect.top))
    }

    function step() {
      rafId = null
      if (!animating) return

      const diff     = targetScale - lerpScale
      const settling = Math.abs(diff) < 0.0005

      lerpScale = settling ? targetScale : lerpScale + diff * LERP_SPEED
      applyTransform(lerpScale)

      if (settling) {
        // Measure beforeRect NOW — the CSS transform is active from the
        // applyTransform() call above, matching exactly what will be painted
        // for this frame.  commit() then clears it and compensates scroll.
        const refEl     = findRefPage()
        const beforeRect = refEl?.getBoundingClientRect()
        commit(refEl, beforeRect)
        return
      }

      rafId = requestAnimationFrame(step)
    }

    function onWheel(evt) {
      if (!evt.ctrlKey) return
      const pv = getPV()
      if (!pv?.pdfDocument) return

      evt.stopImmediatePropagation()
      evt.preventDefault()

      let delta = 1
      if (evt.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
        delta = 1 + (-evt.deltaY * TOUCHPAD_SENSITIVITY)
      } else if (evt.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        delta = 1 + (-Math.sign(evt.deltaY) * MOUSE_WHEEL_STEP)
      } else if (evt.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        delta = 1 + (-Math.sign(evt.deltaY) * MOUSE_WHEEL_STEP * 3)
      }
      if (Math.abs(delta - 1) < 0.00001) return

      if (!animating) {
        baseScale   = pv.currentScale
        lerpScale   = baseScale
        targetScale = baseScale

        const rect = container.getBoundingClientRect()

        // Cursor position in #viewer coords — zoom anchors at the pointer.
        viewerOriginX = (evt.clientX - rect.left) + container.scrollLeft - viewer.offsetLeft
        viewerOriginY = (evt.clientY - rect.top)  + container.scrollTop  - viewer.offsetTop

        animating = true
      }

      targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale * delta))

      if (!rafId) {
        rafId = requestAnimationFrame(step)
      }
    }

    document.addEventListener('wheel', onWheel, { capture: true, passive: false })
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', setup)
  else
    setup()
})()
