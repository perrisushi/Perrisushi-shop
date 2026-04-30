(function () {
  const positions = window.editorPositions && typeof window.editorPositions === "object"
    ? window.editorPositions
    : {};
  const configuredIds = Array.isArray(window.editorTargetIds) ? window.editorTargetIds : [];
  const targetIds = Array.from(new Set([...configuredIds, ...Object.keys(positions)]));
  const toolbar = document.getElementById("editorToolbar");
  const copyButton = document.getElementById("copyPositionsButton");

  window.positions = positions;

  if (!targetIds.length) {
    if (toolbar) toolbar.hidden = true;
    window.setEditorMode = function setEditorMode() {};
    return;
  }

  const targets = [];
  const cleanupCallbacks = [];
  const dragState = {
    activeTarget: null,
    offsetX: 0,
    offsetY: 0,
    moved: false
  };
  let editorEnabled = window.isEditor === true;
  let initialized = false;

  function roundPixel(value) {
    return `${Math.round(value)}px`;
  }

  function getParentForTarget(element) {
    return element.offsetParent || element.parentElement;
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

  function collectTargets() {
    targetIds.forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;

      const parent = getParentForTarget(element);
      if (!parent) return;

      const rect = element.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const measuredTop = rect.top - parentRect.top + parent.scrollTop;
      const measuredLeft = rect.left - parentRect.left + parent.scrollLeft;

      targets.push({
        id,
        element,
        parent,
        initialTop: roundPixel(measuredTop),
        initialLeft: roundPixel(measuredLeft)
      });
    });
  }

  function applyPosition(target, nextPosition) {
    target.element.style.position = "absolute";
    target.element.style.top = nextPosition.top;
    target.element.style.left = nextPosition.left;
    target.element.style.margin = "0";
  }

  function initializeTargets() {
    if (initialized) return;
    initialized = true;
    collectTargets();

    targets.forEach((target) => {
      lockParentLayout(target.parent);

      if (!positions[target.id]) {
        positions[target.id] = {
          top: target.initialTop,
          left: target.initialLeft
        };
      }

      applyPosition(target, positions[target.id]);
    });
  }

  function handleMouseMove(event) {
    const activeTarget = dragState.activeTarget;
    if (!activeTarget) return;

    const parentRect = activeTarget.parent.getBoundingClientRect();
    const nextLeft = event.clientX - parentRect.left - dragState.offsetX + activeTarget.parent.scrollLeft;
    const nextTop = event.clientY - parentRect.top - dragState.offsetY + activeTarget.parent.scrollTop;

    if (
      !dragState.moved
      && (
        Math.abs(nextLeft - parseFloat(activeTarget.element.style.left || "0")) > 2
        || Math.abs(nextTop - parseFloat(activeTarget.element.style.top || "0")) > 2
      )
    ) {
      dragState.moved = true;
    }

    activeTarget.element.style.left = roundPixel(nextLeft);
    activeTarget.element.style.top = roundPixel(nextTop);
  }

  function handleMouseUp() {
    const activeTarget = dragState.activeTarget;
    if (!activeTarget) return;

    positions[activeTarget.id] = {
      top: activeTarget.element.style.top,
      left: activeTarget.element.style.left
    };

    activeTarget.element.classList.remove("editor-dragging");

    if (dragState.moved) {
      activeTarget.element.dataset.editorDragged = "true";
      window.setTimeout(() => {
        activeTarget.element.dataset.editorDragged = "false";
      }, 0);
    }

    dragState.activeTarget = null;
    dragState.moved = false;
    document.body.classList.remove("editor-no-select");
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }

  function teardownDragging() {
    while (cleanupCallbacks.length) {
      const cleanup = cleanupCallbacks.pop();
      cleanup();
    }

    dragState.activeTarget = null;
    dragState.moved = false;
    document.body.classList.remove("editor-mode-active", "editor-no-select");
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);

    targets.forEach((target) => {
      target.element.classList.remove("editor-draggable", "editor-dragging");
    });
  }

  function enableDragging() {
    teardownDragging();
    document.body.classList.add("editor-mode-active");

    targets.forEach((target) => {
      target.element.classList.add("editor-draggable");

      const handleMouseDown = (event) => {
        if (!editorEnabled || event.button !== 0) return;

        const rect = target.element.getBoundingClientRect();
        dragState.activeTarget = target;
        dragState.offsetX = event.clientX - rect.left;
        dragState.offsetY = event.clientY - rect.top;
        dragState.moved = false;

        target.element.classList.add("editor-dragging");
        document.body.classList.add("editor-no-select");
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        event.preventDefault();
      };

      const handleClick = (event) => {
        if (target.element.dataset.editorDragged === "true") {
          event.preventDefault();
          event.stopPropagation();
        }
      };

      target.element.addEventListener("mousedown", handleMouseDown);
      target.element.addEventListener("click", handleClick);
      cleanupCallbacks.push(() => {
        target.element.removeEventListener("mousedown", handleMouseDown);
        target.element.removeEventListener("click", handleClick);
      });
    });
  }

  function updateToolbar() {
    if (!toolbar) return;
    toolbar.hidden = !editorEnabled;
  }

  function setEditorMode(nextValue) {
    initializeTargets();
    editorEnabled = nextValue === true;
    updateToolbar();

    if (editorEnabled) {
      enableDragging();
      return;
    }

    teardownDragging();
  }

  if (copyButton) {
    copyButton.addEventListener("click", () => {
      console.log(positions);
    });
  }

  initializeTargets();
  updateToolbar();
  window.setEditorMode = setEditorMode;

  if (editorEnabled) {
    enableDragging();
  }
})();
