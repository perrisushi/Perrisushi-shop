(function () {
  "use strict";

  var LAYOUT_VERSION = 4;
  var EDITOR_IMPLEMENTATION = "native-layout-editor-v1";
  var DRAFT_PREFIX = "perrisushi-native-layout-v2:";
  var MOBILE_PREVIEW_REVISION_KEY = "perrisushi-mobile-editor-revision";
  var MOBILE_PREVIEW_REVISION = "4";
  var editorState = {
    active: false,
    guides: true,
    showHidden: false,
    selected: null,
    attached: null,
    pointer: null,
    previewMode: null,
    undo: [],
    redo: [],
    layouts: { desktop: {}, mobile: {} },
    loaded: false
  };

  var layoutCanvasScale = 1;
  var settledApplyTimer = 0;
  var remoteSaveTimer = 0;
  var originalStyles = new WeakMap();
  var targetResizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(function (entries) {
    entries.forEach(function (entry) {
      var box = entry.contentRect;
      entry.target.style.setProperty("--ui-box-w", Math.max(1, box.width) + "px");
      entry.target.style.setProperty("--ui-box-h", Math.max(1, box.height) + "px");
    });
  }) : null;
  var mobileDevice = Boolean(
    navigator.userAgentData && navigator.userAgentData.mobile
  ) || /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent || "") || Boolean(
    navigator.maxTouchPoints > 0 && window.matchMedia && window.matchMedia("(pointer: coarse)").matches
  );

  function fitFixedCanvas() {
    layoutCanvasScale = 1;
    document.body.classList.remove("perri-fixed-canvas", "perri-mobile-layout", "perri-desktop-layout");
    document.body.style.removeProperty("--perri-canvas-width");
    document.body.style.removeProperty("--perri-canvas-height");
    document.body.style.removeProperty("--perri-canvas-scale");
  }

  var targetDefinitions = [
    [".session-user-card", "session-user", "Usuario y nick"],
    [".mobile-session-menu", "session-menu", "Menú desplegable"],
    ["#mobileSessionMenuToggle", "session-menu-button", "Botón del menú"],
    ["#desktopStackBackButton", "global-back-button", "Botón volver"],
    [".content-view .nav-back", "section-back", "Botón volver", true],
    [".session-logo-badge", "avatar", "Logo del usuario"],
    ["#notificationDock", "notifications", "Botones de aviso"],
    [".notification-bubble", "notification", "Aviso", true],
    [".menu-frame", "main-frame", "Marco del menú"],
    [".menu-actions", "home-buttons", "Botones del menú"],
    ["#openProfileButton", "menu-profile", "Botón Mi perfil"],
    ["#openUsersButton", "menu-users", "Botón Usuarios"],
    ["#openInventoryButton", "menu-inventory", "Botón Inventario"],
    ["#openMinigamesButton", "menu-minigames", "Botón Minijuegos"],
    ["#openShopButton", "menu-shop", "Botón Tienda"],
    [".menu-socials", "social-buttons", "Botones sociales"],
    ["#openTwitchButton", "social-twitch", "Botón Twitch"],
    ["#openYoutubeButton", "social-youtube", "Botón YouTube"],
    ["#openChatButton", "side-chat", "Botón Chat"],
    ["#openRequestsPanelButton", "side-panel", "Botón Panel"],
    ["#profileView,#usersView,#inventoryView,#minigamesView,#shopView,#chatView", "section-panel", "Pantalla de sección"],
    ["#minigamesView .minigames-panel", "minigames-panel", "Panel de minijuegos"],
    ["#minigamesView .minigames-grid", "minigames-grid", "Botones de minijuegos"],
    ["#openDuelsFromMinigames", "game-duels", "PerriDuelos"],
    ["#openPerriCasillasFromMinigames", "game-casillas", "PerriCasillas"],
    ["#openPerriRpgFromMinigames", "game-rpg", "PerriRPG"],
    ["#openPerriPetFromMinigames", "game-pet", "PerriPet"],
    ["#usersView .users-room-hero", "users-title", "Título Sala de Usuarios"],
    ["#usersView .users-room-frame", "users-frame", "Marco de usuarios"],
    ["#usersView .users-room-panel", "users-panel", "Panel de usuarios"],
    ["#usersView .users-room-table-wrap", "users-table", "Lista de usuarios"],
    ["#shopView .shop-resource-shell", "shop-resource-shell", "Barra de recursos"],
    ["#shopView .resource-group", "shop-resources", "Gemas y PC"],
    ["#shopView .resource-group > *", "shop-resource-chip", "Recurso", true],
    ["#shopView .shop-tabs-shell", "shop-tabs", "Pestañas de tienda"],
    ["#shopView .shop-tabs-shell .tab-button", "shop-tab", "Pestaña", true],
    ["#shopView .shop-content-shell", "shop-content", "Contenido de tienda"],
    ["#shopView .random-key-card", "shop-random-key", "Random Key"],
    ["#shopView .random-key-history", "shop-key-history", "Historial de Keys"],
    ["#shopView .shop-item-cell", "shop-item", "Artículo de tienda", true],
    ["#inventoryView .section-topbar", "inventory-resources", "Gemas y PC"],
    ["#inventoryView .resource-group", "inventory-resource-chips", "Recuadro de Gemas y PC"],
    ["#inventoryView .resource-group > *", "inventory-resource-chip", "Recurso", true],
    ["#inventoryView .inventory-heading", "inventory-title", "Título Inventario"],
    ["#inventoryGrid", "inventory-grid", "Objetos del inventario"],
    ["#inventoryGrid .inventory-card", "inventory-item", "Objeto del inventario", true],
    ["#profileView .profile-card", "profile-card", "Tarjeta de perfil"],
    ["#profileView .profile-logo-panel", "profile-logo", "Logo del perfil"],
    ["#profileView .profile-stats-panel", "profile-stats", "Estadísticas del perfil"],
    ["#profileView .profile-actions", "profile-actions", "Acciones del perfil"],
    ["#profileView .profile-actions > *", "profile-action", "Botón del perfil", true],
    ["#chatView .web-chat-view", "chat-window", "Ventana de chat"],
    ["#chatView .web-chat-header", "chat-header", "Cabecera del chat"],
    ["#chatView .web-chat-feed-wrap", "chat-feed", "Mensajes del chat"],
    ["#chatView .web-chat-composer", "chat-composer", "Escribir mensaje"]
  ];

  function currentMode() {
    return editorState.previewMode || (mobileDevice ? "mobile" : "desktop");
  }

  function mobilePreviewRules() {
    var previewWidth = 390;
    var previewHeight = 844;
    function replaceViewportUnits(cssText) {
      return String(cssText || "").replace(/(-?(?:\d*\.)?\d+)(dvw|svw|lvw|vw|dvh|svh|lvh|vh|vmin|vmax)\b/gi, function (_, amount, unit) {
        var value = Number(amount);
        var normalizedUnit = String(unit).toLowerCase();
        var basis = /vw$/.test(normalizedUnit)
          ? previewWidth
          : /vh$/.test(normalizedUnit)
            ? previewHeight
            : normalizedUnit === "vmin"
              ? Math.min(previewWidth, previewHeight)
              : Math.max(previewWidth, previewHeight);
        return String(Math.round(value * basis * 100 / 10000)) + "px";
      });
    }
    var css = [];
    Array.from(document.styleSheets).forEach(function (sheet) {
      var rules;
      try { rules = Array.from(sheet.cssRules || []); } catch (error) { return; }
      rules.forEach(function (rule) {
        if (rule.type !== CSSRule.MEDIA_RULE) return;
        var condition = String(rule.conditionText || "");
        if (!/max-width\s*:\s*720px/i.test(condition) || !/pointer\s*:\s*coarse/i.test(condition)) return;
        Array.from(rule.cssRules || []).forEach(function (innerRule) {
          css.push(replaceViewportUnits(innerRule.cssText));
        });
      });
    });
    return css.join("\n");
  }

  function setMobilePreview(enabled) {
    editorState.previewMode = enabled ? "mobile" : null;
    document.body.classList.toggle("perri-mobile-preview", Boolean(enabled));
    var style = document.getElementById("uiLayoutMobilePreviewRules");
    if (enabled && !style) {
      style = document.createElement("style");
      style.id = "uiLayoutMobilePreviewRules";
      style.textContent = mobilePreviewRules();
      document.head.appendChild(style);
    } else if (!enabled && style) {
      style.remove();
    }
    var button = document.getElementById("uiLayoutPreviewButton");
    if (button) {
      button.textContent = enabled ? "Vista PC" : "Vista móvil";
      button.setAttribute("aria-pressed", String(Boolean(enabled)));
    }
    selectElement(null);
    markTargets();
    scheduleLayoutApply();
    setStatus("Editando " + (enabled ? "móvil" : "PC") + " · " + currentScreen());
  }

  function currentScreen() {
    try {
      return String(currentAppSection || "menu");
    } catch (error) {
      var visible = document.querySelector(".content-view:not([hidden])");
      return visible && visible.id ? visible.id.replace(/View$/, "") : "menu";
    }
  }

  function canvasRect() {
    var canvas = document.querySelector(".panel") || document.querySelector(".shell") || document.getElementById("appView");
    if (!canvas) return { left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 };
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(1, rect.width / layoutCanvasScale);
    var height = Math.max(1, rect.height / layoutCanvasScale);
    return {
      left: rect.left,
      top: rect.top,
      width: width,
      height: height,
      right: rect.left + width * layoutCanvasScale,
      bottom: rect.top + height * layoutCanvasScale
    };
  }

  function allTargets() {
    return Array.from(document.querySelectorAll("[data-ui-layout]"));
  }

  function visibleTargets() {
    return allTargets().filter(function (element) {
      return element.dataset.uiLayoutEnabled !== "false" && element.getClientRects().length && !element.closest("[hidden]");
    });
  }

  function refreshLabels() {
    if (!editorState.active) {
      document.querySelectorAll(".ui-layout-target-label").forEach(function (label) { label.remove(); });
      return;
    }
    visibleTargets().forEach(function (element) {
      var existing = Array.from(element.children).find(function (child) {
        return child.classList && child.classList.contains("ui-layout-target-label");
      });
      if (existing) {
        existing.textContent = element.dataset.uiLayoutLabel || element.dataset.uiLayout;
        return;
      }
      var label = document.createElement("span");
      label.className = "ui-layout-target-label";
      label.textContent = element.dataset.uiLayoutLabel || element.dataset.uiLayout;
      label.setAttribute("aria-hidden", "true");
      element.appendChild(label);
    });
  }

  function screenLayouts(create) {
    var modeName = currentMode();
    var screenName = currentScreen();
    if (!editorState.layouts[modeName]) editorState.layouts[modeName] = {};
    if (create && !editorState.layouts[modeName][screenName]) {
      editorState.layouts[modeName][screenName] = {};
    }
    return editorState.layouts[modeName][screenName] || {};
  }

  function markTargets() {
    var addedTarget = false;
    targetDefinitions.forEach(function (definition) {
      var selector = definition[0];
      var baseKey = definition[1];
      var label = definition[2];
      var indexed = definition[3];
      document.querySelectorAll(selector).forEach(function (element, index) {
        if (!originalStyles.has(element)) {
          var saved = {};
          ["translate", "position", "left", "top", "width", "height", "visibility", "opacity", "pointer-events"].forEach(function (property) {
            saved[property] = {
              value: element.style.getPropertyValue(property),
              priority: element.style.getPropertyPriority(property)
            };
          });
          originalStyles.set(element, saved);
          if (targetResizeObserver) targetResizeObserver.observe(element);
          if (getComputedStyle(element).position === "static") element.classList.add("ui-layout-static");
        }
        if (!element.dataset.uiLayout) {
          addedTarget = true;
          var key = baseKey;
          if (baseKey === "notification") {
            key = ["notice-objects", "notice-social", "notice-announcement"][index] || "notice-" + index;
          } else if (indexed) {
            var identity = element.id || element.dataset.itemId || element.dataset.kind || element.dataset.tab || String(index);
            key = baseKey + "-" + String(identity).toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
          }
          element.dataset.uiLayout = key;
        }
        element.dataset.uiLayoutLabel = element.getAttribute("aria-label") || label + (indexed ? " " + (index + 1) : "");
      });
    });
    var activeView = document.querySelector(".content-view:not([hidden])");
    document.querySelectorAll(".content-view[data-ui-layout=\"section-panel\"]").forEach(function (view) {
      view.dataset.uiLayoutEnabled = view === activeView ? "true" : "false";
    });
    refreshLabels();
    if (!editorState.active || (addedTarget && !editorState.pointer)) scheduleLayoutApply();
  }

  function readDraft(modeName) {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_PREFIX + modeName) || "{}");
    } catch (error) {
      return {};
    }
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_PREFIX + currentMode(), JSON.stringify(editorState.layouts[currentMode()] || {}));
    } catch (error) {}
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer = setTimeout(saveRemoteLayout, 900);
  }

  function layoutPayload() {
    return {
      layoutVersion: LAYOUT_VERSION,
      editorImplementation: EDITOR_IMPLEMENTATION,
      coordinateSystem: "absolute-canvas-ratios",
      desktop: { screens: editorState.layouts.desktop },
      mobile: { screens: editorState.layouts.mobile }
    };
  }

  async function saveRemoteLayout() {
    if (typeof callApi !== "function" || typeof state === "undefined" ||
        !state.sessionToken || !state.requestsPanelKey) {
      setStatus("Solo guardado en este navegador: falta desbloquear el panel");
      return;
    }
    try {
      var response = await callApi({
        action: "publicShopSaveUiLayouts",
        sessionToken: state.sessionToken,
        panelKey: state.requestsPanelKey,
        layouts: layoutPayload()
      });
      if (response.data && response.data.ok) {
        setStatus("Guardado en Supabase");
      } else {
        setStatus("NO sincronizado: " + ((response.data && response.data.error) || "respuesta inválida"));
      }
    } catch (error) {
      setStatus("NO sincronizado: guardado solo en este navegador");
    }
  }

  function cloneValue(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function pushHistory() {
    editorState.undo.push(cloneValue(screenLayouts(false)));
    if (editorState.undo.length > 40) editorState.undo.shift();
    editorState.redo = [];
  }

  function restoreHistory(from, to, label) {
    if (!from.length) return setStatus("No hay más cambios");
    to.push(cloneValue(screenLayouts(false)));
    editorState.layouts[currentMode()][currentScreen()] = from.pop();
    saveDraft();
    scheduleLayoutApply();
    selectElement(null);
    setStatus(label);
  }

  function normalizePayload(payload) {
    var result = { desktop: {}, mobile: {} };
    if (!payload || typeof payload !== "object") return result;
    var modernPayload = Number(payload.layoutVersion) === LAYOUT_VERSION &&
        payload.editorImplementation === EDITOR_IMPLEMENTATION &&
        payload.coordinateSystem === "absolute-canvas-ratios";
    if (!modernPayload) return result;
    ["desktop", "mobile"].forEach(function (modeName) {
      var mode = payload[modeName];
      if (mode && mode.screens && typeof mode.screens === "object") {
        result[modeName] = mode.screens;
      }
    });
    return result;
  }

  function convertPrototypePayload(payload) {
    if (payload && Number(payload.prototypeLayoutVersion) === 2 &&
        payload.coordinateSystem === "absolute-canvas-ratios") {
      return {
        desktop: payload.desktop && payload.desktop.screens ? cloneValue(payload.desktop.screens) : {},
        mobile: payload.mobile && payload.mobile.screens ? cloneValue(payload.mobile.screens) : {}
      };
    }
    return normalizePayload(payload);
  }

  function clearStyle(element) {
    var saved = originalStyles.get(element) || {};
    ["translate", "position", "left", "top", "width", "height", "visibility", "opacity", "pointer-events"].forEach(function (property) {
      var entry = saved[property];
      if (entry && entry.value) element.style.setProperty(property, entry.value, entry.priority || "");
      else element.style.removeProperty(property);
    });
    element.classList.remove("ui-layout-sized", "ui-layout-attached");
    delete element.dataset.uiLayoutX;
    delete element.dataset.uiLayoutY;
    delete element.dataset.uiLayoutWidth;
    delete element.dataset.uiLayoutHeight;
    delete element.dataset.uiLayoutHidden;
    delete element.dataset.uiLayoutLockedWith;
  }

  function applyItem(element, item, canvas, phase) {
    if (!item) return;
    var offsetX = Number(item.offsetXRatio) * canvas.width;
    var offsetY = Number(item.offsetYRatio) * canvas.height;
    var width = Number(item.widthRatio) * canvas.width;
    var height = Number(item.heightRatio) * canvas.height;
    if (phase !== "position" && width > 4) {
      element.dataset.uiLayoutWidth = String(width);
      element.style.setProperty("width", width + "px", "important");
      element.classList.add("ui-layout-sized");
    }
    if (phase !== "position" && height > 4) {
      element.dataset.uiLayoutHeight = String(height);
      element.style.setProperty("height", height + "px", "important");
      element.classList.add("ui-layout-sized");
    }
    if (phase !== "size") {
      var leftRatio = Number(item.leftRatio);
      var topRatio = Number(item.topRatio);
      var hasAbsolutePosition = Number.isFinite(leftRatio) && Number.isFinite(topRatio);
      if (hasAbsolutePosition) {
        var rect = element.getBoundingClientRect();
        var targetLeft = canvas.left + leftRatio * canvas.width * layoutCanvasScale;
        var targetTop = canvas.top + topRatio * canvas.height * layoutCanvasScale;
        offsetX = (targetLeft - rect.left) / layoutCanvasScale;
        offsetY = (targetTop - rect.top) / layoutCanvasScale;
      }
      if (Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
        element.dataset.uiLayoutX = String(offsetX);
        element.dataset.uiLayoutY = String(offsetY);
        element.style.translate = offsetX + "px " + offsetY + "px";
      }
    }
    if (phase !== "position") {
      if (item.hidden) element.dataset.uiLayoutHidden = "true";
      if (item.lockedWith) element.dataset.uiLayoutLockedWith = String(item.lockedWith);
    }
  }

  function applyCurrentLayout() {
    if (!editorState.loaded) return;
    var layout = screenLayouts(false);
    var canvas = canvasRect();
    allTargets().forEach(clearStyle);
    allTargets().forEach(function (element) {
      if (element.dataset.uiLayoutEnabled === "false") return;
      applyItem(element, layout[element.dataset.uiLayout], canvas, "size");
    });
    void document.documentElement.offsetHeight;
    allTargets().forEach(function (element) {
      if (element.dataset.uiLayoutEnabled === "false") return;
      applyItem(element, layout[element.dataset.uiLayout], canvas, "position");
    });
    refreshPersistentLocks();
    refreshHidden();
  }

  function scheduleLayoutApply() {
    if (!editorState.loaded) return;
    clearTimeout(settledApplyTimer);
    applyCurrentLayout();
    requestAnimationFrame(function () {
      applyCurrentLayout();
      requestAnimationFrame(applyCurrentLayout);
    });
    settledApplyTimer = setTimeout(applyCurrentLayout, 120);
  }

  function refreshPersistentLocks() {
    allTargets().forEach(function (element) {
      element.classList.toggle("ui-layout-locked", Boolean(element.dataset.uiLayoutLockedWith));
    });
  }

  function captureElement(element) {
    var canvas = canvasRect();
    var rect = element.getBoundingClientRect();
    return {
      leftRatio: canvas.width ? (rect.left - canvas.left) / layoutCanvasScale / canvas.width : 0,
      topRatio: canvas.height ? (rect.top - canvas.top) / layoutCanvasScale / canvas.height : 0,
      offsetXRatio: canvas.width ? Number(element.dataset.uiLayoutX || 0) / canvas.width : 0,
      offsetYRatio: canvas.height ? Number(element.dataset.uiLayoutY || 0) / canvas.height : 0,
      widthRatio: canvas.width ? rect.width / layoutCanvasScale / canvas.width : 0,
      heightRatio: canvas.height ? rect.height / layoutCanvasScale / canvas.height : 0,
      hidden: element.dataset.uiLayoutHidden === "true",
      lockedWith: element.dataset.uiLayoutLockedWith || null
    };
  }

  function commitElement(element) {
    if (!element || !element.dataset.uiLayout) return;
    screenLayouts(true)[element.dataset.uiLayout] = captureElement(element);
    saveDraft();
  }

  function refreshHidden() {
    allTargets().forEach(function (element) {
      var hidden = element.dataset.uiLayoutHidden === "true";
      var reveal = editorState.active && editorState.showHidden;
      element.style.visibility = hidden && !reveal ? "hidden" : "";
      element.style.opacity = hidden && reveal ? ".28" : "";
      element.style.pointerEvents = hidden && !reveal ? "none" : "";
    });
  }

  function setStatus(text) {
    var status = document.getElementById("uiLayoutEditorStatus");
    if (status) status.textContent = text;
  }

  function removeHandle() {
    var handle = document.querySelector(".ui-layout-resize-handle");
    if (handle) handle.remove();
  }

  function selectElement(element) {
    if (editorState.selected) editorState.selected.classList.remove("ui-layout-selected");
    if (editorState.attached) editorState.attached.classList.remove("ui-layout-attached");
    removeHandle();
    editorState.selected = element || null;
    editorState.attached = null;
    if (!element) {
      setStatus("Selecciona un elemento");
      refreshLockButton();
      return;
    }
    element.classList.add("ui-layout-selected");
    var handle = document.createElement("span");
    handle.className = "ui-layout-resize-handle";
    handle.setAttribute("aria-hidden", "true");
    element.appendChild(handle);
    setStatus(element.dataset.uiLayoutLabel || element.dataset.uiLayout);
    refreshLockButton();
  }

  function refreshLockButton() {
    var button = document.getElementById("uiLayoutLockButton");
    if (!button) return;
    var linked = linkedElement(editorState.selected);
    button.textContent = linked ? "Desanclar" : "Anclar";
    button.disabled = !editorState.selected || (!linked && !editorState.attached);
  }

  function candidateTargets(element) {
    return visibleTargets().filter(function (candidate) {
      return candidate !== element && candidate.parentElement === element.parentElement;
    });
  }

  function findAttachment(element, threshold) {
    var rect = element.getBoundingClientRect();
    var best = null;
    candidateTargets(element).forEach(function (candidate) {
      var other = candidate.getBoundingClientRect();
      var verticalOverlap = Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top);
      var horizontalOverlap = Math.min(rect.right, other.right) - Math.max(rect.left, other.left);
      var checks = [
        { side: "left", distance: Math.abs(rect.left - other.right), overlap: verticalOverlap },
        { side: "right", distance: Math.abs(rect.right - other.left), overlap: verticalOverlap },
        { side: "top", distance: Math.abs(rect.top - other.bottom), overlap: horizontalOverlap },
        { side: "bottom", distance: Math.abs(rect.bottom - other.top), overlap: horizontalOverlap }
      ];
      checks.forEach(function (check) {
        if (check.distance <= threshold && check.overlap > 5 && (!best || check.distance < best.distance)) {
          best = { candidate: candidate, side: check.side, distance: check.distance };
        }
      });
    });
    return best;
  }

  function refreshAttachment(element, snap) {
    if (editorState.attached) editorState.attached.classList.remove("ui-layout-attached");
    if (element) element.classList.remove("ui-layout-attached");
    editorState.attached = null;
    if (!element) return;
    var attachment = findAttachment(element, 12 * layoutCanvasScale);
    if (!attachment) return;
    var target = attachment.candidate;
    if (snap) {
      var rect = element.getBoundingClientRect();
      var other = target.getBoundingClientRect();
      var x = Number(element.dataset.uiLayoutX || 0);
      var y = Number(element.dataset.uiLayoutY || 0);
      if (attachment.side === "left") {
        x += (other.right - rect.left) / layoutCanvasScale;
        y += (other.top - rect.top) / layoutCanvasScale;
      } else if (attachment.side === "right") {
        x += (other.left - rect.right) / layoutCanvasScale;
        y += (other.top - rect.top) / layoutCanvasScale;
      } else if (attachment.side === "top") {
        y += (other.bottom - rect.top) / layoutCanvasScale;
        x += (other.left - rect.left) / layoutCanvasScale;
      } else {
        y += (other.top - rect.bottom) / layoutCanvasScale;
        x += (other.left - rect.left) / layoutCanvasScale;
      }
      element.dataset.uiLayoutX = String(x);
      element.dataset.uiLayoutY = String(y);
      element.style.translate = x + "px " + y + "px";
    }
    element.classList.add("ui-layout-attached");
    target.classList.add("ui-layout-attached");
    editorState.attached = target;
    refreshLockButton();
    setStatus("Pegado a " + (target.dataset.uiLayoutLabel || target.dataset.uiLayout));
  }

  function linkedElement(element) {
    var key = element && element.dataset.uiLayoutLockedWith;
    if (!key) return null;
    return visibleTargets().find(function (candidate) {
      return candidate.dataset.uiLayout === key;
    }) || null;
  }

  function moveElement(element, dx, dy, includeLinked) {
    var x = Number(element.dataset.uiLayoutX || 0) + dx;
    var y = Number(element.dataset.uiLayoutY || 0) + dy;
    element.dataset.uiLayoutX = String(x);
    element.dataset.uiLayoutY = String(y);
    element.style.translate = x + "px " + y + "px";
    if (includeLinked !== false) {
      var linked = linkedElement(element);
      if (linked) moveElement(linked, dx, dy, false);
    }
  }

  function resizeElement(element, width, height, includeLinked) {
    var safeWidth = Math.max(16, width);
    var safeHeight = Math.max(16, height);
    var linked = includeLinked !== false ? linkedElement(element) : null;
    var relation = null;
    if (linked) {
      var firstRect = element.getBoundingClientRect();
      var linkedRect = linked.getBoundingClientRect();
      var centerDx = (linkedRect.left + linkedRect.width / 2) - (firstRect.left + firstRect.width / 2);
      var centerDy = (linkedRect.top + linkedRect.height / 2) - (firstRect.top + firstRect.height / 2);
      if (Math.abs(centerDx) >= Math.abs(centerDy)) {
        relation = centerDx >= 0
          ? { side: "right", gap: linkedRect.left - firstRect.right, cross: linkedRect.top - firstRect.top }
          : { side: "left", gap: firstRect.left - linkedRect.right, cross: linkedRect.top - firstRect.top };
      } else {
        relation = centerDy >= 0
          ? { side: "bottom", gap: linkedRect.top - firstRect.bottom, cross: linkedRect.left - firstRect.left }
          : { side: "top", gap: firstRect.top - linkedRect.bottom, cross: linkedRect.left - firstRect.left };
      }
    }
    element.dataset.uiLayoutWidth = String(safeWidth);
    element.dataset.uiLayoutHeight = String(safeHeight);
    element.style.setProperty("width", safeWidth + "px", "important");
    element.style.setProperty("height", safeHeight + "px", "important");
    element.classList.add("ui-layout-sized");
    if (linked) {
      resizeElement(linked, safeWidth, safeHeight, false);
      var resized = element.getBoundingClientRect();
      var linkedResized = linked.getBoundingClientRect();
      var desiredLeft = linkedResized.left;
      var desiredTop = linkedResized.top;
      if (relation.side === "right") {
        desiredLeft = resized.right + relation.gap;
        desiredTop = resized.top + relation.cross;
      } else if (relation.side === "left") {
        desiredLeft = resized.left - relation.gap - linkedResized.width;
        desiredTop = resized.top + relation.cross;
      } else if (relation.side === "bottom") {
        desiredTop = resized.bottom + relation.gap;
        desiredLeft = resized.left + relation.cross;
      } else {
        desiredTop = resized.top - relation.gap - linkedResized.height;
        desiredLeft = resized.left + relation.cross;
      }
      moveElement(linked, (desiredLeft - linkedResized.left) / layoutCanvasScale, (desiredTop - linkedResized.top) / layoutCanvasScale, false);
    }
  }

  function pointerDown(event) {
    if (!editorState.active || event.button !== 0 || event.target.closest(".ui-layout-editor")) return;
    var handle = event.target.closest(".ui-layout-resize-handle");
    var element = handle ? handle.parentElement : event.target.closest("[data-ui-layout]");
    if (!element || element.closest("[hidden]")) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(element);
    pushHistory();
    var rect = element.getBoundingClientRect();
    editorState.pointer = {
      id: event.pointerId,
      type: handle ? "resize" : "move",
      element: element,
      startX: event.clientX,
      startY: event.clientY,
      originX: Number(element.dataset.uiLayoutX || 0),
      originY: Number(element.dataset.uiLayoutY || 0),
      width: rect.width / layoutCanvasScale,
      height: rect.height / layoutCanvasScale,
      descendants: handle ? visibleTargets().filter(function (candidate) {
        return candidate !== element && element.contains(candidate);
      }).map(function (candidate) {
        var childRect = candidate.getBoundingClientRect();
        return {
          element: candidate,
          left: (childRect.left - rect.left) / layoutCanvasScale,
          top: (childRect.top - rect.top) / layoutCanvasScale,
          width: childRect.width / layoutCanvasScale,
          height: childRect.height / layoutCanvasScale
        };
      }) : []
    };
    if (element.setPointerCapture) element.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    var pointer = editorState.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    var dx = (event.clientX - pointer.startX) / layoutCanvasScale;
    var dy = (event.clientY - pointer.startY) / layoutCanvasScale;
    if (pointer.type === "resize") {
      var newWidth = Math.max(16, pointer.width + dx);
      var newHeight = Math.max(16, pointer.height + dy);
      resizeElement(pointer.element, newWidth, newHeight, true);
      var parentRect = pointer.element.getBoundingClientRect();
      var scaleX = newWidth / Math.max(1, pointer.width);
      var scaleY = newHeight / Math.max(1, pointer.height);
      pointer.descendants.forEach(function (snapshot) {
        resizeElement(snapshot.element, snapshot.width * scaleX, snapshot.height * scaleY, false);
        var childRect = snapshot.element.getBoundingClientRect();
        var desiredLeft = parentRect.left + snapshot.left * scaleX * layoutCanvasScale;
        var desiredTop = parentRect.top + snapshot.top * scaleY * layoutCanvasScale;
        moveElement(snapshot.element, (desiredLeft - childRect.left) / layoutCanvasScale, (desiredTop - childRect.top) / layoutCanvasScale, false);
      });
      setStatus(Math.round(newWidth) + " × " + Math.round(newHeight));
    } else {
      var currentX = Number(pointer.element.dataset.uiLayoutX || 0);
      var currentY = Number(pointer.element.dataset.uiLayoutY || 0);
      moveElement(pointer.element, pointer.originX + dx - currentX, pointer.originY + dy - currentY, true);
      refreshAttachment(pointer.element, false);
    }
  }

  function pointerUp(event) {
    var pointer = editorState.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.type === "move") refreshAttachment(pointer.element, true);
    commitElement(pointer.element);
    (pointer.descendants || []).forEach(function (snapshot) { commitElement(snapshot.element); });
    var linked = linkedElement(pointer.element);
    if (linked) commitElement(linked);
    editorState.pointer = null;
  }

  function setEditing(active) {
    editorState.active = Boolean(active);
    document.body.classList.toggle("ui-layout-editing", editorState.active);
    document.body.classList.toggle("ui-layout-guides", editorState.active && editorState.guides);
    var button = document.getElementById("uiLayoutEditToggle");
    if (button) {
      button.textContent = editorState.active ? "Terminar edición" : "Mover recuadros";
      button.setAttribute("aria-pressed", String(editorState.active));
    }
    if (!editorState.active) {
      selectElement(null);
      editorState.showHidden = false;
      refreshHidden();
      refreshLabels();
    } else {
      markTargets();
      refreshLabels();
      setStatus("Editando " + (currentMode() === "mobile" ? "móvil" : "PC") + " · " + currentScreen());
    }
  }

  function exportLayouts() {
    visibleTargets().forEach(commitElement);
    var blob = new Blob([JSON.stringify(layoutPayload(), null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "perrisushi-diseno-" + new Date().toISOString().slice(0, 10) + ".json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    setStatus("Diseño exportado");
  }

  async function importLayouts(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      editorState.layouts = convertPrototypePayload(JSON.parse(await file.text()));
      localStorage.setItem(DRAFT_PREFIX + "desktop", JSON.stringify(editorState.layouts.desktop));
      localStorage.setItem(DRAFT_PREFIX + "mobile", JSON.stringify(editorState.layouts.mobile));
      scheduleLayoutApply();
      clearTimeout(remoteSaveTimer);
      remoteSaveTimer = setTimeout(saveRemoteLayout, 300);
      setStatus("Diseño importado y guardado");
    } catch (error) {
      setStatus("El archivo no contiene un diseño válido");
    }
  }

  function buildToolbar() {
    if (document.getElementById("uiLayoutEditor")) return;
    var toolbar = document.createElement("aside");
    toolbar.id = "uiLayoutEditor";
    toolbar.className = "ui-layout-editor";
    toolbar.hidden = true;
    toolbar.innerHTML =
      "<button class=\"ui-layout-editor-toggle\" type=\"button\" aria-label=\"Minimizar\">−</button>" +
      "<button id=\"uiLayoutEditToggle\" type=\"button\" aria-pressed=\"false\">Mover recuadros</button>" +
      "<button id=\"uiLayoutPreviewButton\" type=\"button\" aria-pressed=\"false\">Vista móvil</button>" +
      "<button id=\"uiLayoutGuidesToggle\" type=\"button\" aria-pressed=\"true\">Ocultar marcos</button>" +
      "<button id=\"uiLayoutEqualButton\" type=\"button\">Igualar tamaño</button>" +
      "<button id=\"uiLayoutLockButton\" type=\"button\">Anclar</button>" +
      "<button id=\"uiLayoutHideButton\" type=\"button\">Ocultar selección</button>" +
      "<button id=\"uiLayoutShowHiddenButton\" type=\"button\" aria-pressed=\"false\">Ver ocultos</button>" +
      "<button id=\"uiLayoutUndoButton\" type=\"button\">Deshacer</button>" +
      "<button id=\"uiLayoutRedoButton\" type=\"button\">Rehacer</button>" +
      "<button id=\"uiLayoutExportButton\" type=\"button\">Exportar</button>" +
      "<button id=\"uiLayoutImportButton\" type=\"button\">Importar</button>" +
      "<button id=\"uiLayoutCloseButton\" type=\"button\">Cerrar</button>" +
      "<span id=\"uiLayoutEditorStatus\" class=\"ui-layout-editor-status\">Modo normal</span>" +
      "<input id=\"uiLayoutImportInput\" type=\"file\" accept=\"application/json,.json\" hidden>";
    document.body.appendChild(toolbar);

    toolbar.querySelector(".ui-layout-editor-toggle").addEventListener("click", function () {
      var collapsed = toolbar.classList.toggle("is-collapsed");
      toolbar.querySelector(".ui-layout-editor-toggle").textContent = collapsed ? "+" : "−";
    });
    toolbar.querySelector("#uiLayoutEditToggle").addEventListener("click", function () {
      setEditing(!editorState.active);
    });
    toolbar.querySelector("#uiLayoutPreviewButton").addEventListener("click", function () {
      setMobilePreview(editorState.previewMode !== "mobile");
    });
    toolbar.querySelector("#uiLayoutGuidesToggle").addEventListener("click", function (event) {
      editorState.guides = !editorState.guides;
      document.body.classList.toggle("ui-layout-guides", editorState.active && editorState.guides);
      event.currentTarget.textContent = editorState.guides ? "Ocultar marcos" : "Mostrar marcos";
      event.currentTarget.setAttribute("aria-pressed", String(editorState.guides));
    });
    toolbar.querySelector("#uiLayoutEqualButton").addEventListener("click", function () {
      if (!editorState.selected || !editorState.attached) return setStatus("Pega primero el elemento a otro");
      pushHistory();
      var rect = editorState.attached.getBoundingClientRect();
      resizeElement(editorState.selected, rect.width / layoutCanvasScale, rect.height / layoutCanvasScale, false);
      commitElement(editorState.selected);
      setStatus("Tamaño igualado");
    });
    toolbar.querySelector("#uiLayoutLockButton").addEventListener("click", function (event) {
      if (!editorState.selected) return setStatus("Selecciona un elemento");
      pushHistory();
      var linked = linkedElement(editorState.selected);
      if (linked) {
        delete linked.dataset.uiLayoutLockedWith;
        delete editorState.selected.dataset.uiLayoutLockedWith;
        commitElement(linked);
        commitElement(editorState.selected);
        refreshPersistentLocks();
        refreshLockButton();
        return setStatus("Elementos desanclados");
      }
      if (!editorState.attached) return setStatus("Pega primero el elemento a otro");
      editorState.selected.dataset.uiLayoutLockedWith = editorState.attached.dataset.uiLayout;
      editorState.attached.dataset.uiLayoutLockedWith = editorState.selected.dataset.uiLayout;
      commitElement(editorState.selected);
      commitElement(editorState.attached);
      refreshPersistentLocks();
      refreshLockButton();
      setStatus("Elementos anclados");
    });
    toolbar.querySelector("#uiLayoutHideButton").addEventListener("click", function () {
      if (!editorState.selected) return setStatus("Selecciona un elemento");
      pushHistory();
      var hidden = editorState.selected.dataset.uiLayoutHidden !== "true";
      if (hidden) editorState.selected.dataset.uiLayoutHidden = "true";
      else delete editorState.selected.dataset.uiLayoutHidden;
      commitElement(editorState.selected);
      refreshHidden();
      setStatus(hidden ? "Elemento oculto" : "Elemento visible");
    });
    toolbar.querySelector("#uiLayoutShowHiddenButton").addEventListener("click", function (event) {
      editorState.showHidden = !editorState.showHidden;
      event.currentTarget.textContent = editorState.showHidden ? "Ocultar ocultos" : "Ver ocultos";
      event.currentTarget.setAttribute("aria-pressed", String(editorState.showHidden));
      refreshHidden();
    });
    toolbar.querySelector("#uiLayoutUndoButton").addEventListener("click", function () {
      restoreHistory(editorState.undo, editorState.redo, "Cambio deshecho");
    });
    toolbar.querySelector("#uiLayoutRedoButton").addEventListener("click", function () {
      restoreHistory(editorState.redo, editorState.undo, "Cambio rehecho");
    });
    toolbar.querySelector("#uiLayoutExportButton").addEventListener("click", exportLayouts);
    toolbar.querySelector("#uiLayoutImportButton").addEventListener("click", function () {
      toolbar.querySelector("#uiLayoutImportInput").click();
    });
    toolbar.querySelector("#uiLayoutImportInput").addEventListener("change", importLayouts);
    toolbar.querySelector("#uiLayoutCloseButton").addEventListener("click", closeEditor);
  }

  function openEditor() {
    buildToolbar();
    var panel = document.getElementById("requestsPanelModal");
    if (panel) {
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
    }
    var toolbar = document.getElementById("uiLayoutEditor");
    toolbar.hidden = false;
    toolbar.classList.remove("is-collapsed");
    toolbar.querySelector(".ui-layout-editor-toggle").textContent = "−";
    fitFixedCanvas();
    requestAnimationFrame(function () {
      scheduleLayoutApply();
      setEditing(true);
    });
  }

  function closeEditor() {
    setEditing(false);
    setMobilePreview(false);
    fitFixedCanvas();
    scheduleLayoutApply();
    var toolbar = document.getElementById("uiLayoutEditor");
    if (toolbar) toolbar.hidden = true;
  }

  async function loadPublished() {
    var bundled = null;
    var remote = null;
    try {
      var bundledResponse = await fetch("./maqueta-layout.json?v=20260907-3", { cache: "no-store" });
      if (bundledResponse.ok) bundled = await bundledResponse.json();
    } catch (error) {}
    editorState.layouts = convertPrototypePayload(bundled);
    editorState.loaded = true;
    markTargets();
    scheduleLayoutApply();
    try {
      var response = await callApi({ action: "publicShopGetUiLayouts" });
      if (response.data && response.data.ok) remote = response.data.layouts;
    } catch (error) {}
    var normalizedRemote = normalizePayload(remote);
    if (Object.keys(normalizedRemote.desktop).length || Object.keys(normalizedRemote.mobile).length) {
      editorState.layouts = normalizedRemote;
    }
    var desktopDraft = readDraft("desktop");
    var mobileDraft = readDraft("mobile");
    Object.keys(desktopDraft).forEach(function (screenName) {
      if (desktopDraft[screenName] && Object.keys(desktopDraft[screenName]).length) {
        editorState.layouts.desktop[screenName] = desktopDraft[screenName];
      }
    });
    Object.keys(mobileDraft).forEach(function (screenName) {
      if (mobileDraft[screenName] && Object.keys(mobileDraft[screenName]).length) {
        editorState.layouts.mobile[screenName] = mobileDraft[screenName];
      }
    });
    markTargets();
    scheduleLayoutApply();
  }

  document.addEventListener("pointerdown", pointerDown, true);
  document.addEventListener("pointermove", pointerMove, true);
  document.addEventListener("pointerup", pointerUp, true);
  document.addEventListener("click", function (event) {
    if (!editorState.active || event.target.closest(".ui-layout-editor")) return;
    if (event.target.closest("[data-ui-layout], a, button")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      fitFixedCanvas();
      scheduleLayoutApply();
    }, 120);
  });

  var observer = new MutationObserver(function () {
    clearTimeout(observer.timer);
    observer.timer = setTimeout(markTargets, 60);
  });
  function initializeEditor() {
    var root = document.getElementById("appView") || document.body;
    if (!root || typeof root.nodeType !== "number") return;
    try {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden"]
      });
    } catch (error) {
      console.warn("El observador del editor no pudo iniciarse; se usará actualización manual.", error);
    }
    fitFixedCanvas();
    buildToolbar();
    loadPublished();
  }

  window.PerriUiEditor = {
    open: openEditor,
    close: closeEditor,
    refresh: markTargets,
    apply: scheduleLayoutApply,
    screenChanged: function () {
      selectElement(null);
      markTargets();
      scheduleLayoutApply();
    },
    inspect: function () {
      return { mode: currentMode(), screen: currentScreen(), canvas: canvasRect(), layouts: editorState.layouts };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeEditor, { once: true });
  } else {
    initializeEditor();
  }
})();
