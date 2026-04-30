(function () {
  const positions = window.editorPositions && typeof window.editorPositions === "object"
    ? window.editorPositions
    : {};
  const configuredIds = Array.isArray(window.editorTargetIds) ? window.editorTargetIds : [];
  const toolbar = document.getElementById("editorToolbar");
  const toolbarLabel = toolbar ? toolbar.querySelector(".editor-toolbar-label") : null;
  const copyButton = document.getElementById("copyPositionsButton");
  const appRoot = document.getElementById("appView");
  const loginRoot = document.getElementById("loginView");
  const excludedIds = new Set([
    "editorToolbar",
    "copyPositionsButton",
    "editorToggleButton"
  ]);

  const targetMap = new Map();
  const runtimeState = {
    enabled: window.isEditor === true,
    activeTarget: null,
    mode: "",
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    startLeft: 0,
    startTop: 0,
    startWidth: 0,
    startHeight: 0,
    startPointerX: 0,
    startPointerY: 0
  };

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "editor-resize-handle";

  window.positions = positions;

  function roundPixel(value) {
    return `${Math.round(value)}px`;
  }

  function toPixelNumber(value, fallback = 0) {
    const parsed = parseFloat(String(value || ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getEditableRoots() {
    return [appRoot, loginRoot].filter(Boolean);
  }

  function isEditableTarget(element) {
    if (!element || !(element instanceof HTMLElement)) return false;
    if (!element.id || excludedIds.has(element.id)) return false;
    if (toolbar && toolbar.contains(element)) return false;
    if (element === document.body || element === document.documentElement) return false;
    if (["SCRIPT", "STYLE", "AUDIO"].includes(element.tagName)) return false;

    return getEditableRoots().some((root) => root.contains(element));
  }

  function collectDiscoveredIds() {
    const discoveredIds = [];
    getEditableRoots().forEach((root) => {
      root.querySelectorAll("[id]").forEach((element) => {
        if (isEditableTarget(element)) {
          discoveredIds.push(element.id);
        }
      });
    });
    return discoveredIds;
  }

  function getTargetRecord(elementOrId) {
    const element = typeof elementOrId === "string"
      ? document.getElementById(elementOrId)
      : elementOrId;

    if (!isEditableTarget(element)) return null;

    if (!targetMap.has(element.id)) {
      targetMap.set(element.id, {
        id: element.id,
        element,
        parent: null,
        originalPosition: element.style.position || "",
        originalTop: element.style.top || "",
        originalLeft: element.style.left || "",
        originalWidth: element.style.width || "",
        originalHeight: element.style.height || "",
        originalMargin: element.style.margin || "",
        layoutReady: false
      });
    }

    const record = targetMap.get(element.id);
    record.element = element;
    record.parent = element.offsetParent || element.parentElement;
    return record;
  }

  function refreshTargets() {
    const mergedIds = Array.from(new Set([
      ...configuredIds,
      ...Object.keys(positions),
      ...collectDiscoveredIds()
    ]));

    mergedIds.forEach((id) => {
      const element = document.getElementById(id);
      if (!isEditableTarget(element)) return;
      getTargetRecord(element);
    });
  }

  function lockParentLayout(parent) {
    if (!parent || parent.dataset.editorLayoutLocked === "true") return;

    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === "static") {
      parent.style.position = "relative";
    }

    parent.style.minHeight = `${Math.ceil(parent.offsetHeight)}px`;
    parent.style.minWidth = `${Math.ceil(parent.offsetWidth)}px`;
    parent.dataset.editorLayoutLocked = "true";
  }

  function measureRecord(record) {
    const rect = record.element.getBoundingClientRect();
    const parentRect = record.parent.getBoundingClientRect();
    const top = rect.top - parentRect.top + record.parent.scrollTop;
    const left = rect.left - parentRect.left + record.parent.scrollLeft;

    return {
      top: roundPixel(top),
      left: roundPixel(left),
      width: roundPixel(rect.width),
      height: roundPixel(rect.height)
    };
  }

  function ensureAbsoluteLayout(record, forceMeasure = false) {
    record.parent = record.element.offsetParent || record.element.parentElement;
    if (!record.parent) return;

    lockParentLayout(record.parent);

    const savedLayout = positions[record.id];
    const layout = forceMeasure || !savedLayout
      ? measureRecord(record)
      : {
          top: savedLayout.top || measureRecord(record).top,
          left: savedLayout.left || measureRecord(record).left,
          width: savedLayout.width || measureRecord(record).width,
          height: savedLayout.height || measureRecord(record).height
        };

    record.element.style.position = "absolute";
    record.element.style.top = layout.top;
    record.element.style.left = layout.left;
    record.element.style.width = layout.width;
    record.element.style.height = layout.height;
    record.element.style.margin = "0";
    record.layoutReady = true;
  }

  function saveRecordLayout(record) {
    positions[record.id] = {
      top: record.element.style.top || "0px",
      left: record.element.style.left || "0px",
      width: record.element.style.width || `${Math.round(record.element.offsetWidth)}px`,
      height: record.element.style.height || `${Math.round(record.element.offsetHeight)}px`
    };
  }

  function applySavedLayouts() {
    refreshTargets();

    Object.keys(positions).forEach((id) => {
      const record = getTargetRecord(id);
      if (!record) return;
      ensureAbsoluteLayout(record, false);
      saveRecordLayout(record);
    });
  }

  function updateToolbarLabel() {
    if (!toolbarLabel) return;
    if (!runtimeState.enabled) {
      toolbarLabel.textContent = "Modo editor";
      return;
    }

    if (runtimeState.activeTarget) {
      toolbarLabel.textContent = `Editor: ${runtimeState.activeTarget.id}`;
      return;
    }

    toolbarLabel.textContent = "Editor: clic para mover, esquina para tamano";
  }

  function attachResizeHandle(record) {
    if (!record || !record.element) return;
    if (resizeHandle.parentElement !== record.element) {
      resizeHandle.remove();
      record.element.appendChild(resizeHandle);
    }
  }

  function clearSelection() {
    if (runtimeState.activeTarget) {
      runtimeState.activeTarget.element.classList.remove("editor-selected", "editor-dragging", "editor-resizing");
    }
    runtimeState.activeTarget = null;
    resizeHandle.remove();
    updateToolbarLabel();
  }

  function selectTarget(record) {
    if (!record) {
      clearSelection();
      return;
    }

    if (runtimeState.activeTarget && runtimeState.activeTarget.id !== record.id) {
      runtimeState.activeTarget.element.classList.remove("editor-selected", "editor-dragging", "editor-resizing");
    }

    runtimeState.activeTarget = record;
    record.element.classList.add("editor-selected");
    attachResizeHandle(record);
    updateToolbarLabel();
  }

  function beginDrag(record, event) {
    ensureAbsoluteLayout(record, true);
    selectTarget(record);

    const rect = record.element.getBoundingClientRect();
    runtimeState.mode = "drag";
    runtimeState.pointerOffsetX = event.clientX - rect.left;
    runtimeState.pointerOffsetY = event.clientY - rect.top;
    record.element.classList.add("editor-dragging");
    document.body.classList.add("editor-no-select");
  }

  function beginResize(record, event) {
    ensureAbsoluteLayout(record, false);
    selectTarget(record);

    runtimeState.mode = "resize";
    runtimeState.startLeft = toPixelNumber(record.element.style.left);
    runtimeState.startTop = toPixelNumber(record.element.style.top);
    runtimeState.startWidth = Math.max(24, record.element.offsetWidth);
    runtimeState.startHeight = Math.max(24, record.element.offsetHeight);
    runtimeState.startPointerX = event.clientX;
    runtimeState.startPointerY = event.clientY;
    record.element.classList.add("editor-resizing");
    document.body.classList.add("editor-no-select");
  }

  function handlePointerMove(event) {
    const record = runtimeState.activeTarget;
    if (!runtimeState.enabled || !record || !runtimeState.mode) return;

    if (runtimeState.mode === "drag") {
      const parentRect = record.parent.getBoundingClientRect();
      const nextLeft = event.clientX - parentRect.left - runtimeState.pointerOffsetX + record.parent.scrollLeft;
      const nextTop = event.clientY - parentRect.top - runtimeState.pointerOffsetY + record.parent.scrollTop;
      record.element.style.left = roundPixel(nextLeft);
      record.element.style.top = roundPixel(nextTop);
      return;
    }

    if (runtimeState.mode === "resize") {
      const deltaX = event.clientX - runtimeState.startPointerX;
      const deltaY = event.clientY - runtimeState.startPointerY;
      const nextWidth = Math.max(24, runtimeState.startWidth + deltaX);
      const nextHeight = Math.max(24, runtimeState.startHeight + deltaY);
      record.element.style.width = roundPixel(nextWidth);
      record.element.style.height = roundPixel(nextHeight);
    }
  }

  function stopPointerInteraction() {
    const record = runtimeState.activeTarget;
    if (record) {
      record.element.classList.remove("editor-dragging", "editor-resizing");
      saveRecordLayout(record);
    }

    runtimeState.mode = "";
    document.body.classList.remove("editor-no-select");
  }

  function resolveEditableElement(startNode) {
    if (!(startNode instanceof HTMLElement)) return null;
    const element = startNode.closest("[id]");
    return isEditableTarget(element) ? element : null;
  }

  function handlePointerDown(event) {
    if (!runtimeState.enabled || event.button !== 0) return;

    if (toolbar && toolbar.contains(event.target)) return;

    if (event.target === resizeHandle) {
      if (runtimeState.activeTarget) {
        beginResize(runtimeState.activeTarget, event);
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    const element = resolveEditableElement(event.target);
    if (!element) {
      clearSelection();
      return;
    }

    const record = getTargetRecord(element);
    if (!record) return;

    beginDrag(record, event);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleClickCapture(event) {
    if (!runtimeState.enabled) return;
    if (toolbar && toolbar.contains(event.target)) return;

    const element = resolveEditableElement(event.target);
    if (!element) return;

    event.preventDefault();
    event.stopPropagation();
  }

  function updateToolbarVisibility() {
    if (!toolbar) return;
    toolbar.hidden = !runtimeState.enabled;
    updateToolbarLabel();
  }

  function setEditorMode(nextValue) {
    runtimeState.enabled = nextValue === true;

    if (!runtimeState.enabled) {
      stopPointerInteraction();
      clearSelection();
      document.body.classList.remove("editor-mode-active");
      updateToolbarVisibility();
      return;
    }

    refreshTargets();
    document.body.classList.add("editor-mode-active");
    updateToolbarVisibility();
  }

  if (copyButton) {
    copyButton.addEventListener("click", () => {
      console.log(positions);
    });
  }

  document.addEventListener("mousedown", handlePointerDown, true);
  document.addEventListener("click", handleClickCapture, true);
  document.addEventListener("mousemove", handlePointerMove);
  document.addEventListener("mouseup", stopPointerInteraction);

  applySavedLayouts();
  updateToolbarVisibility();
  window.setEditorMode = setEditorMode;

  if (runtimeState.enabled) {
    setEditorMode(true);
  }
})();
