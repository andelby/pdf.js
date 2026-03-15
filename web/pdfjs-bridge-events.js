/* Copyright 2025 - WebView2/WinUI3 API Bridge for PDF.js - Event Notifiers Module
 *
 * Event bridges that post messages to the WebView2 host.
 */

// ── Edit state notifier ───────────────────────────────────────────────────────
// Listens for annotationeditorstateschanged events and posts { type:'editState' }
// messages to the WebView2 host so C# can update CanUndo/CanRedo button states.
;(function initEditStateNotifier() {
  function setup() {
    window.PDFViewerApplication?.initializedPromise?.then(() => {
      window.PDFViewerApplication?.eventBus?._on(
        'editingstateschanged',
        ({ details }) => {
          window.chrome?.webview?.postMessage(JSON.stringify({
            type: 'editState',
            canUndo: !!details?.hasSomethingToUndo,
            canRedo: !!details?.hasSomethingToRedo,
          }))
        }
      )
    })
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', setup)
  else
    setup()
})()

// ── Context menu bridge ───────────────────────────────────────────────────────
// Intercepts right-click inside the PDF viewer and posts the cursor position
// plus any selected text to C# so a native WinUI3 MenuFlyout can be shown.
;(function initContextMenuBridge() {
  function setup() {
    const container = document.getElementById('viewerContainer')
    if (!container) return
    container.addEventListener('contextmenu', e => {
      e.preventDefault()
      e.stopPropagation()
      window.chrome?.webview?.postMessage(JSON.stringify({
        type: 'contextmenu',
        x: e.clientX,
        y: e.clientY,
        selectedText: window.getSelection()?.toString() ?? '',
      }))
    })
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', setup)
  else
    setup()
})()

// ── Geometry-based annotation dblclick (for pointer-events:none annotations) ──
// Ink annotations have pointer-events:none so text underneath can be selected.
// That means the dblclick listener on this.container in annotation_layer.js
// never fires for ink annotations. This capture-phase handler hit-tests the
// click coordinates against annotation sections that carry data-swiftpdf-edit-*
// attributes (stored by _editOnDoubleClick()) and dispatches
// switchannotationeditormode when a match is found.
;(function initAnnotationDblClick() {
  function setup() {
    const container = document.getElementById('viewerContainer')
    if (!container) return
    container.addEventListener('dblclick', e => {
      // Only act when we are NOT already in a specific editor mode.
      const app = window.PDFViewerApplication
      const uiManager = app?.pdfViewer?._layerProperties?.annotationEditorUIManager
      if (!uiManager) return
      // If already in editor mode (not NONE/DISABLE), let the regular handler work.
      if (uiManager._mode > 0) return

      // Find all annotation sections that have our data attributes.
      const sections = document.querySelectorAll(
        '.annotationLayer section[data-swiftpdf-edit-mode][data-swiftpdf-edit-id]'
      )
      for (const section of sections) {
        const rect = section.getBoundingClientRect()
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          const mode = parseInt(section.dataset.swiftpdfEditMode, 10)
          const editId = section.dataset.swiftpdfEditId
          app.eventBus.dispatch('switchannotationeditormode', {
            source: section,
            mode,
            editId,
          })
          e.stopPropagation()
          break
        }
      }
    }, { capture: true })
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', setup)
  else
    setup()
})()

// ── Click outside deselector ──────────────────────────────────────────────────
// When in single-selection mode and clicking outside the selected annotation
// editor (including its edit toolbar), exit to NONE mode.
//
// Two-phase strategy:
//  1. Synchronous DOM cleanup — immediately hide the toolbar and remove the
//     selection highlight, so the user sees instant feedback even if the async
//     updateMode(NONE) is delayed (e.g. it is queued behind a pending
//     #enableAll() awaiting annotation deserialization).
//  2. Async event-bus dispatch — switchannotationeditormode(NONE) through the
//     event bus so pdf_viewer.js runs its full cleanup (toggleEditingMode,
//     annotation-layer restore, etc.).
//
// Uses capture phase on window so it fires before EditorToolbar.#pointerDown's
// stopPropagation() which would block a bubbling-phase listener.
;(function initClickOutsideDeselector() {
  function setup() {
    window.addEventListener('pointerdown', e => {
      const app = window.PDFViewerApplication
      const uiManager = app?.pdfViewer?._layerProperties?.annotationEditorUIManager
      if (!uiManager?._singleSelectionMode) return

      // If the click landed on the selected editor's div (or any child,
      // including its edit toolbar, color picker, resizers, etc.) — let
      // normal editor interaction handle it.
      const selectedEditor = uiManager.firstSelectedEditor
      if (selectedEditor?.div?.contains(e.target)) return

      // Also allow clicks on any stand-alone .editToolbar (safety net).
      if (e.target.closest('.editToolbar')) return

      // ── Phase 1: stop event propagation ───────────────────────────────────
      // We are in single-selection mode and the click is "outside" — its only
      // purpose is to deselect.  Stop propagation so the event never reaches
      // the annotation editor layer's pointerdown handler.  Without this, the
      // layer (still in INK/draw mode at this moment, since updateMode(NONE) is
      // async) would see event.target === layer.div, call startDrawingSession(),
      // and commit a tiny accidental ink stroke.  That new stroke is then
      // auto-selected, which dispatches switchannotationeditormode(INK, newId)
      // and re-enters single-selection mode — making the annotation appear
      // permanently stuck as selected.
      e.stopPropagation()

      // ── Phase 2: synchronous DOM cleanup ──────────────────────────────────
      // Immediately clear the visual selected state so the user sees instant
      // feedback, regardless of how long the async updateMode(NONE) takes.
      uiManager._singleSelectionMode = false

      // Remove singleSelectionMode CSS class from all annotation editor layers.
      document.querySelectorAll('.annotationEditorLayer.singleSelectionMode')
        .forEach(layer => layer.classList.remove('singleSelectionMode'))

      // Remove selectedEditor class and hide the edit toolbar on the selected
      // editor's div.
      if (selectedEditor?.div) {
        selectedEditor.div.classList.remove('selectedEditor')
        const toolbar = selectedEditor.div.querySelector('.editToolbar')
        if (toolbar) toolbar.classList.add('hidden')
      }

      // ── Phase 3: async full cleanup via event bus ──────────────────────────
      app.eventBus.dispatch('switchannotationeditormode', {
        source: window,
        mode: 0, // AnnotationEditorType.NONE
      })
    }, { capture: true })
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', setup)
  else
    setup()
})()
