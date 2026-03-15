/* Copyright 2025 - WebView2/WinUI3 API Bridge for PDF.js - Scrollbar Module
 *
 * Windows 11-style scrollbar.
 *
 * Two CSS classes drive the visual states:
 *   swiftpdf-scrolling  → thin scrollbar visible (scroll activity)
 *   swiftpdf-expanded   → thick scrollbar (mouse over the scrollbar gutter)
 *
 * Behaviour:
 *   • scroll          → thin bar appears, auto-hides after 800 ms idle
 *   • mouse over bar  → bar expands, hide timer cancelled
 *   • mouse off bar   → bar shrinks back to thin, hide timer resumes
 *   • mouse out       → schedule hide
 *   • idle            → invisible
 */

;(function initScrollbar() {
  function setup() {
    const el = document.getElementById("viewerContainer")
    if (!el) return

    let hideTimer  = null
    let overBar    = false

    function scheduleHide() {
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => {
        el.classList.remove("swiftpdf-scrolling", "swiftpdf-expanded")
      }, 800)
    }

    // Show thin bar briefly when scrolling
    el.addEventListener("scroll", () => {
      el.classList.add("swiftpdf-scrolling")
      el.classList.remove("swiftpdf-expanded")
      scheduleHide()
    })

    // Detect whether the pointer is over the scrollbar gutter (right edge)
    el.addEventListener("mousemove", e => {
      const sw = el.offsetWidth - el.clientWidth   // scrollbar gutter width
      if (sw <= 0) return                          // no scrollbar, nothing to do

      const rect = el.getBoundingClientRect()
      const nowOverBar = e.clientX >= rect.right - sw - 2  // 2-px tolerance

      if (nowOverBar === overBar) return           // state unchanged
      overBar = nowOverBar

      if (nowOverBar) {
        // Entered scrollbar gutter → expand and keep visible
        clearTimeout(hideTimer)
        el.classList.add("swiftpdf-scrolling", "swiftpdf-expanded")
      } else {
        // Left scrollbar gutter → shrink back to thin, restart hide timer
        el.classList.remove("swiftpdf-expanded")
        scheduleHide()
      }
    })

    el.addEventListener("mouseleave", () => {
      overBar = false
      el.classList.remove("swiftpdf-expanded")
      scheduleHide()
    })
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", setup)
  else
    setup()
})()
