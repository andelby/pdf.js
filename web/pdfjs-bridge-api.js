/* Copyright 2025 - WebView2/WinUI3 API Bridge for PDF.js - Core API Module
 *
 * Exposes window.pdfViewerAPI — a clean JavaScript API for controlling
 * the PDF.js viewer from an external host (e.g. WinUI3 WebView2).
 *
 * Usage from C# / WebView2:
 *   await webView.CoreWebView2.ExecuteScriptAsync("pdfViewerAPI.nextPage()");
 *   await webView.CoreWebView2.ExecuteScriptAsync("pdfViewerAPI.setZoom(1.5)");
 *   await webView.CoreWebView2.ExecuteScriptAsync("pdfViewerAPI.setEditorMode('highlight')");
 */

const pdfViewerAPI = (() => {
  // ─── Helpers ──────────────────────────────────────────────────────

  function getApp() {
    return window.PDFViewerApplication
  }

  function getEventBus() {
    return getApp()?.eventBus
  }

  function getViewer() {
    return getApp()?.pdfViewer
  }

  function getUIManager() {
    return getApp()?.pdfViewer?._layerProperties?.annotationEditorUIManager
  }

  // ─── Page Navigation ──────────────────────────────────────────────

  function nextPage() {
    getEventBus()?.dispatch("nextpage", { source: pdfViewerAPI })
  }

  function previousPage() {
    getEventBus()?.dispatch("previouspage", { source: pdfViewerAPI })
  }

  function firstPage() {
    getEventBus()?.dispatch("firstpage", { source: pdfViewerAPI })
  }

  function lastPage() {
    getEventBus()?.dispatch("lastpage", { source: pdfViewerAPI })
  }

  function goToPage(pageNumber) {
    const app = getApp()
    if (app) {
      app.page = pageNumber
    }
  }

  function getCurrentPage() {
    return getViewer()?.currentPageNumber ?? 0
  }

  function getPagesCount() {
    return getApp()?.pagesCount ?? 0
  }

  // ─── Zoom / Scale ─────────────────────────────────────────────────

  function zoomIn() {
    getApp()?.zoomIn()
  }

  function zoomOut() {
    getApp()?.zoomOut()
  }

  function zoomReset() {
    getApp()?.zoomReset()
  }

  /**
   * Set exact zoom level.
   * @param {number} scale - e.g. 1.5 for 150%
   */
  function setZoom(scale) {
    const viewer = getViewer()
    if (viewer) {
      viewer.currentScale = scale
    }
  }

  /**
   * Set zoom to a preset or numeric value.
   * @param {string} value - "auto", "page-actual", "page-width", "page-fit",
   *                         "page-height", or a numeric string like "1.5"
   */
  function setZoomPreset(value) {
    const viewer = getViewer()
    if (viewer) {
      viewer.currentScaleValue = value
    }
  }

  function getZoom() {
    return getViewer()?.currentScale ?? 1
  }

  // ─── Rotation ─────────────────────────────────────────────────────

  function rotateCw() {
    getApp()?.rotatePages(90)
  }

  function rotateCcw() {
    getApp()?.rotatePages(-90)
  }

  function setRotation(angle) {
    const viewer = getViewer()
    if (viewer) {
      viewer.pagesRotation = angle
    }
  }

  function getRotation() {
    return getViewer()?.pagesRotation ?? 0
  }

  // ─── Editor Modes ─────────────────────────────────────────────────
  // Mode constants:
  //  -1 = DISABLE, 0 = NONE, 3 = FREETEXT, 9 = HIGHLIGHT,
  //  13 = STAMP, 15 = INK, 16 = COMMENT (POPUP), 101 = SIGNATURE

  const EditorMode = Object.freeze({
    DISABLE: -1,
    NONE: 0,
    FREETEXT: 3,
    HIGHLIGHT: 9,
    STAMP: 13,
    INK: 15,
    COMMENT: 16,
    SIGNATURE: 101,
  })

  /**
   * Set editor mode by name or number.
   * @param {string|number} mode - "highlight", "freetext", "ink", "stamp",
   *   "comment", "signature", "none", "disable", or a numeric mode value.
   */
  function setEditorMode(mode) {
    const modeMap = {
      disable: -1,
      none: 0,
      freetext: 3,
      text: 3,
      highlight: 9,
      stamp: 13,
      image: 13,
      ink: 15,
      draw: 15,
      comment: 16,
      signature: 101,
    }

    let modeValue = typeof mode === "string" ? modeMap[mode.toLowerCase()] : mode
    if (modeValue === undefined) {
      console.warn(`pdfViewerAPI: unknown editor mode "${mode}"`)
      return
    }

    getEventBus()?.dispatch("switchannotationeditormode", {
      source: pdfViewerAPI,
      mode: modeValue,
    })
  }

  function getEditorMode() {
    return getViewer()?.annotationEditorMode ?? -1
  }

  function unselectAll()    { getUIManager()?.unselectAll() }
  function undo()           { getUIManager()?.undo() }
  function redo()           { getUIManager()?.redo() }
  function deleteSelected() { getUIManager()?.delete() }

  /**
   * Highlight the current text selection.
   * @param {boolean} [isContextPopupEvent=false] - If true, creates the highlight without activating edit mode
   */
  function highlightSelection(isContextPopupEvent = false) {
    getUIManager()?.highlightSelection('context_menu', false, isContextPopupEvent)
  }

  /**
   * Underline the current text selection.
   * @param {boolean} [isContextPopupEvent=false] - If true, creates the underline without activating edit mode
   */
  function underlineSelection(isContextPopupEvent = false) {
    getUIManager()?.underlineSelection('context_menu', isContextPopupEvent)
  }

  /**
   * Strikeout the current text selection.
   * @param {boolean} [isContextPopupEvent=false] - If true, creates the strikeout without activating edit mode
   */
  function strikeoutSelection(isContextPopupEvent = false) {
    getUIManager()?.strikeoutSelection('context_menu', isContextPopupEvent)
  }

  function getSelectedText() {
    return window.getSelection()?.toString() ?? ''
  }

  function selectAll() {
    const spans = [...document.querySelectorAll('.textLayer span')]
    if (spans.length === 0) return
    const range = document.createRange()
    range.setStartBefore(spans[0])
    range.setEndAfter(spans[spans.length - 1])
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function openFindBar() {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'f', code: 'KeyF', ctrlKey: true, bubbles: true, cancelable: true,
    }))
  }

  // ─── Editor Params (ink, highlight, freetext) ─────────────────────

  // Param type constants (from AnnotationEditorParamsType in src/shared/util.js)
  const EditorParamsType = Object.freeze({
    FREETEXT_SIZE: 11,
    FREETEXT_COLOR: 12,
    FREETEXT_OPACITY: 13,
    INK_COLOR: 21,
    INK_THICKNESS: 22,
    INK_OPACITY: 23,
    HIGHLIGHT_COLOR: 31,
    HIGHLIGHT_THICKNESS: 32,
    HIGHLIGHT_FREE: 33,
    HIGHLIGHT_SHOW_ALL: 34,
  })

  /**
   * Low-level: set any editor parameter by type id and value.
   * @param {number} type - One of EditorParamsType.*
   * @param {*} value
   */
  function setEditorParam(type, value) {
    getEventBus()?.dispatch("switchannotationeditorparams", {
      source: pdfViewerAPI,
      type,
      value,
    })
  }

  // ── Ink (draw) ────────────────────────────────────────────────────

  /**
   * Set ink/draw stroke color.
   * @param {string} color - CSS color, e.g. "#ff0000" or "red"
   */
  function setInkColor(color) {
    setEditorParam(EditorParamsType.INK_COLOR, color)
  }

  /**
   * Set ink/draw stroke thickness in pixels.
   * @param {number} thickness - 1–100
   */
  function setInkThickness(thickness) {
    setEditorParam(EditorParamsType.INK_THICKNESS, thickness)
  }

  /**
   * Set ink/draw stroke opacity (0–100).
   * @param {number} opacity
   */
  function setInkOpacity(opacity) {
    setEditorParam(EditorParamsType.INK_OPACITY, opacity)
  }

  // ── Highlight ─────────────────────────────────────────────────────

  /**
   * Set highlight color.
   * @param {string} color - CSS color, e.g. "#ffff00"
   */
  function setHighlightColor(color) {
    setEditorParam(EditorParamsType.HIGHLIGHT_COLOR, color)
  }

  /**
   * Set highlight (free-draw) thickness.
   * @param {number} thickness
   */
  function setHighlightThickness(thickness) {
    setEditorParam(EditorParamsType.HIGHLIGHT_THICKNESS, thickness)
  }

  // ── FreeText ──────────────────────────────────────────────────────

  /**
   * Set free text font size.
   * @param {number} size - Font size in px (e.g. 10–100)
   */
  function setFreeTextSize(size) {
    setEditorParam(EditorParamsType.FREETEXT_SIZE, size)
  }

  /**
   * Set free text font color.
   * @param {string} color - CSS color, e.g. "#000000"
   */
  function setFreeTextColor(color) {
    setEditorParam(EditorParamsType.FREETEXT_COLOR, color)
  }

  // ── Image / Stamp ────────────────────────────────────────────────

  /**
   * Open the "add image" file picker (switches to stamp mode first).
   * After the user picks a file, the image annotation is created.
   */
  function addImage() {
    const eb = getEventBus()
    if (!eb) return
    // Ensure stamp mode is active, then trigger CREATE
    eb.dispatch("switchannotationeditormode", {
      source: pdfViewerAPI,
      mode: 13, // STAMP
    })
    // Small delay to let mode switch complete before opening file picker
    setTimeout(() => {
      eb.dispatch("switchannotationeditorparams", {
        source: pdfViewerAPI,
        type: 2, // CREATE
      })
    }, 100)
  }

  /**
   * Add an image from a Blob, File, or data URL string.
   * Useful from WebView2 where you can pass image data directly.
   * @param {string} dataUrl - A data URL (e.g. "data:image/png;base64,...")
   */
  async function addImageFromUrl(dataUrl) {
    const eb = getEventBus()
    if (!eb) return

    // Switch to stamp mode
    eb.dispatch("switchannotationeditormode", {
      source: pdfViewerAPI,
      mode: 13, // STAMP
    })
    await new Promise(r => setTimeout(r, 150))

    // Fetch the image and create a File object
    const resp = await fetch(dataUrl)
    const blob = await resp.blob()
    const file = new File([blob], "image.png", { type: blob.type })

    // Find the current editor layer and create a stamp editor with this file
    const viewer = getViewer()
    if (!viewer) return
    const currentPage = viewer.currentPageNumber
    const pageView = viewer.getPageView(currentPage - 1)
    if (!pageView?.annotationEditorLayer) return

    const layer = pageView.annotationEditorLayer
    const editor = layer.addNewEditor()
    if (editor && typeof editor.addFromFile === "function") {
      editor.addFromFile(file)
    }
  }

  // ─── Find / Search ────────────────────────────────────────────────

  /**
   * Start a new text search.
   * @param {string} query - Text to search for.
   * @param {object} [options] - Optional search parameters.
   * @param {boolean} [options.caseSensitive=false]
   * @param {boolean} [options.entireWord=false]
   * @param {boolean} [options.highlightAll=true]
   * @param {boolean} [options.matchDiacritics=true]
   */
  function find(query, options = {}) {
    getEventBus()?.dispatch("find", {
      source: pdfViewerAPI,
      type: "",
      query,
      caseSensitive: options.caseSensitive ?? false,
      entireWord: options.entireWord ?? false,
      highlightAll: options.highlightAll ?? true,
      findPrevious: false,
      matchDiacritics: options.matchDiacritics ?? true,
    })
  }

  function findNext() {
    getEventBus()?.dispatch("find", {
      source: pdfViewerAPI,
      type: "again",
      query: "",
      findPrevious: false,
    })
  }

  function findPrevious() {
    getEventBus()?.dispatch("find", {
      source: pdfViewerAPI,
      type: "again",
      query: "",
      findPrevious: true,
    })
  }

  function findClose() {
    getEventBus()?.dispatch("findbarclose", { source: pdfViewerAPI })
  }

  // ─── Print & Download ─────────────────────────────────────────────

  function print() {
    getApp()?.triggerPrinting()
  }

  function download() {
    getApp()?.download()
  }

  function save() {
    getApp()?.save()
  }

  function downloadOrSave() {
    getApp()?.downloadOrSave()
  }

  // ─── Scroll Mode ──────────────────────────────────────────────────

  const ScrollMode = Object.freeze({
    VERTICAL: 0,
    HORIZONTAL: 1,
    WRAPPED: 2,
    PAGE: 3,
  })

  /**
   * @param {string|number} mode - "vertical", "horizontal", "wrapped", "page", or 0-3
   */
  function setScrollMode(mode) {
    const modeMap = { vertical: 0, horizontal: 1, wrapped: 2, page: 3 }
    const val = typeof mode === "string" ? modeMap[mode.toLowerCase()] : mode
    if (val === undefined) return
    getEventBus()?.dispatch("switchscrollmode", { source: pdfViewerAPI, mode: val })
  }

  function getScrollMode() {
    return getViewer()?.scrollMode ?? 0
  }

  // ─── Spread Mode ──────────────────────────────────────────────────

  const SpreadMode = Object.freeze({
    NONE: 0,
    ODD: 1,
    EVEN: 2,
  })

  /**
   * @param {string|number} mode - "none", "odd", "even", or 0-2
   */
  function setSpreadMode(mode) {
    const modeMap = { none: 0, odd: 1, even: 2 }
    const val = typeof mode === "string" ? modeMap[mode.toLowerCase()] : mode
    if (val === undefined) return
    getEventBus()?.dispatch("switchspreadmode", { source: pdfViewerAPI, mode: val })
  }

  function getSpreadMode() {
    return getViewer()?.spreadMode ?? 0
  }

  // ─── Cursor Tool ──────────────────────────────────────────────────

  const CursorTool = Object.freeze({
    SELECT: 0,
    HAND: 1,
    ZOOM: 2,
  })

  /**
   * @param {string|number} tool - "select", "hand", "zoom", or 0-2
   */
  function setCursorTool(tool) {
    const toolMap = { select: 0, hand: 1, zoom: 2 }
    const val = typeof tool === "string" ? toolMap[tool.toLowerCase()] : tool
    if (val === undefined) return
    getEventBus()?.dispatch("switchcursortool", { source: pdfViewerAPI, tool: val })
  }

  // ─── Sidebar / Views Manager ──────────────────────────────────────

  function toggleSidebar() {
    getApp()?.viewsManager?.toggle()
  }

  function openSidebar() {
    getApp()?.viewsManager?.open()
  }

  function closeSidebar() {
    getApp()?.viewsManager?.close()
  }

  /**
   * @param {string|number} view - "thumbnails"|1, "outline"|2, "attachments"|3, "layers"|4
   */
  function setSidebarView(view) {
    const viewMap = { thumbnails: 1, outline: 2, attachments: 3, layers: 4 }
    const val = typeof view === "string" ? viewMap[view.toLowerCase()] : view
    if (val === undefined) return
    getApp()?.viewsManager?.switchView(val)
  }

  // ─── Presentation Mode ────────────────────────────────────────────

  function enterPresentationMode() {
    getApp()?.requestPresentationMode()
  }

  // ─── Document Properties ──────────────────────────────────────────

  function openDocumentProperties() {
    getApp()?.pdfDocumentProperties?.open()
  }

  // ─── Document Open / Close ────────────────────────────────────────

  /**
   * Open a PDF from a URL.
   * @param {string} url
   */
  function openUrl(url) {
    getApp()?.open({ url })
  }

  /**
   * Open a PDF from raw bytes.
   * @param {ArrayBuffer|Uint8Array} data
   */
  function openData(data) {
    getApp()?.open({ data })
  }

  /**
   * Open a PDF from a base64-encoded string.
   * Called from C# via: ExecuteScriptAsync("pdfViewerAPI.openBase64('...')")
   * @param {string} base64
   */
  function openBase64(base64) {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    getApp()?.open({ data: bytes.buffer })
  }

  /**
   * Serialise the current PDF (with all annotation-editor changes). Posts the
   * result to the WebView2 host via postMessage AND returns the base64 string
   * so callers can use either path. Never throws — errors are posted as
   * { type: 'saveError' } and null is returned.
   *
   * @returns {Promise<string|null>} base64-encoded PDF bytes, or null on error
   */
  async function saveToBase64() {
    try {
      const app = getApp()
      const uiMgr = getUIManager()
      if (uiMgr) {
        uiMgr.commitOrRemove()
        uiMgr.currentLayer?.endDrawingSession(false)
        await new Promise(r => setTimeout(r, 0))
      }
      if (!app?.pdfDocument) throw new Error("no document loaded")
      const data = await app.pdfDocument.saveDocument()
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
      const CHUNK = 0x8000
      let binary = ""
      for (let i = 0; i < bytes.length; i += CHUNK)
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
      const base64 = btoa(binary)
      window.chrome?.webview?.postMessage(JSON.stringify({ type: "saveDocument", data: base64 }))
      return base64
    } catch (e) {
      window.chrome?.webview?.postMessage(JSON.stringify({ type: "saveError", message: String(e) }))
      return null
    }
  }

  function closeDocument() {
    getApp()?.close()
  }

  // ─── Events (subscribe from host via WebView2) ────────────────────

  const _listeners = new Map()

  /**
   * Subscribe to a viewer event. Returns a listener ID for unsubscription.
   * @param {string} eventName - e.g. "pagechanging", "scalechanging", "annotationeditormodechanged"
   * @param {string} callbackName - Name of a global function to call, e.g. "window.onPageChange"
   * @returns {number} listener ID
   */
  function on(eventName, callbackName) {
    const id = _listeners.size + 1
    const handler = evt => {
      try {
        const fn = new Function("event", `return (${callbackName})(event)`)
        fn(evt)
      } catch (e) {
        console.warn(`pdfViewerAPI.on: error calling ${callbackName}:`, e)
      }
    }
    getEventBus()?._on(eventName, handler)
    _listeners.set(id, { eventName, handler })
    return id
  }

  /**
   * Unsubscribe from a viewer event.
   * @param {number} listenerId - ID returned by on()
   */
  function off(listenerId) {
    const entry = _listeners.get(listenerId)
    if (entry) {
      getEventBus()?._off(entry.eventName, entry.handler)
      _listeners.delete(listenerId)
    }
  }

  // ─── State snapshot ───────────────────────────────────────────────

  /**
   * Get a full state snapshot (useful for syncing the external toolbar).
   */
  function getState() {
    const app = getApp()
    const viewer = getViewer()
    return {
      currentPage: viewer?.currentPageNumber ?? 0,
      pagesCount: app?.pagesCount ?? 0,
      scale: viewer?.currentScale ?? 1,
      scaleValue: viewer?.currentScaleValue ?? "auto",
      rotation: viewer?.pagesRotation ?? 0,
      scrollMode: viewer?.scrollMode ?? 0,
      spreadMode: viewer?.spreadMode ?? 0,
      documentLoaded: !!app?.pdfDocument,
    }
  }

  // ─── Public API ───────────────────────────────────────────────────

  return Object.freeze({
    // Constants
    EditorMode,
    EditorParamsType,
    ScrollMode,
    SpreadMode,
    CursorTool,

    // Page navigation
    nextPage,
    previousPage,
    firstPage,
    lastPage,
    goToPage,
    getCurrentPage,
    getPagesCount,

    // Zoom
    zoomIn,
    zoomOut,
    zoomReset,
    setZoom,
    setZoomPreset,
    getZoom,

    // Rotation
    rotateCw,
    rotateCcw,
    setRotation,
    getRotation,

    // Editor modes
    setEditorMode,
    getEditorMode,
    unselectAll,
    undo,
    redo,
    deleteSelected,
    highlightSelection,
    underlineSelection,
    strikeoutSelection,
    getSelectedText,
    selectAll,
    openFindBar,

    // Editor params (ink, highlight, freetext)
    setEditorParam,
    setInkColor,
    setInkThickness,
    setInkOpacity,
    setHighlightColor,
    setHighlightThickness,
    setFreeTextSize,
    setFreeTextColor,

    // Image / Stamp
    addImage,
    addImageFromUrl,

    // Find
    find,
    findNext,
    findPrevious,
    findClose,

    // Print & download
    print,
    download,
    save,
    downloadOrSave,

    // Scroll & spread
    setScrollMode,
    getScrollMode,
    setSpreadMode,
    getSpreadMode,

    // Cursor
    setCursorTool,

    // Sidebar
    toggleSidebar,
    openSidebar,
    closeSidebar,
    setSidebarView,

    // Presentation
    enterPresentationMode,

    // Document properties
    openDocumentProperties,

    // Document management
    openUrl,
    openData,
    openBase64,
    saveToBase64,
    closeDocument,

    // Events
    on,
    off,

    // State
    getState,
  })
})()

window.pdfViewerAPI = pdfViewerAPI
