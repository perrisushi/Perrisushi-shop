(function () {
  "use strict";

  var DRAFT_PREFIX = "perrisushi-ui-layout-draft-v1:";
  var editorState = {
    active: false,
    guides: true,
    showHidden: false,
    selected: null,
    attached: null,
    pointer: null,
    layouts: { desktop: {}, mobile: {} },
    loaded: false
  };

  var targetDefinitions = [
    ["#appView", "app", "Aplicación"],
    [".session-user-card", "session-user", "Usuario y nick"],
    [".mobile-session-menu", "session-menu", "Menú desplegable"],
    ["#desktopStackBackButton", "global-back-button", "Botón volver"],
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
    ["#shopView .shop-tabs-shell", "shop-tabs", "Pestañas de tienda"],
    ["#shopView .shop-content-shell", "shop-content", "Contenido de tienda"],
    ["#shopView .random-key-card", "shop-random-key", "Random Key"],
    ["#shopView .random-key-history", "shop-key-history", "Historial de Keys"],
    ["#shopView .shop-item-cell", "shop-item", "Artículo de tienda", true],
    ["#inventoryView .section-topbar", "inventory-resources", "Gemas y PC"],
    ["#inventoryView .resource-group", "inventory-resource-chips", "Recuadro de Gemas y PC"],
    ["#inventoryView .inventory-heading", "inventory-title", "Título Inventario"],
    ["#inventoryGrid", "inventory-grid", "Objetos del inventario"],
    ["#inventoryGrid .inventory-card", "inventory-item", "Objeto del inventario", true],
    ["#profileView .profile-card", "profile-card", "Tarjeta de perfil"],
    ["#profileView .profile-logo-panel", "profile-logo", "Logo del perfil"],
    ["#profileView .profile-stats-panel", "profile-stats", "Estadísticas del perfil"],
    ["#profileView .profile-actions", "profile-actions", "Acciones del perfil"],
    ["#chatView .web-chat-view", "chat-window", "Ventana de chat"],
    ["#chatView .web-chat-header", "chat-header", "Cabecera del chat"],
    ["#chatView .web-chat-feed-wrap", "chat-feed", "Mensajes del chat"],
    ["#chatView .web-chat-composer", "chat-composer", "Escribir mensaje"]
  ];

  function currentMode() {
    return window.matchMedia("(max-width: 720px)").matches ? "mobile" : "desktop";
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
    var canvas = document.getElementById("appView");
    return canvas ? canvas.getBoundingClientRect() : document.body.getBoundingClientRect();
  }

  function allTargets() {
    return Array.from(document.querySelectorAll("[data-ui-layout]"));
  }

  function visibleTargets() {
    return allTargets().filter(function (element) {
      return element.getClientRects().length && !element.closest("[hidden]");
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
    targetDefinitions.forEach(function (definition) {
      var selector = definition[0];
      var baseKey = definition[1];
      var label = definition[2];
      var indexed = definition[3];
      document.querySelectorAll(selector).forEach(function (element, index) {
        if (!element.dataset.uiLayout) {
          var suffix = element.id ? "-" + element.id : indexed ? "-" + index : "";
          element.dataset.uiLayout = baseKey + suffix;
        }
        element.dataset.uiLayoutLabel = element.getAttribute("aria-label") || label + (indexed ? " " + (index + 1) : "");
      });
    });
    if (!editorState.active) applyCurrentLayout();
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
  }

  function normalizePayload(payload) {
    var result = { desktop: {}, mobile: {} };
    if (!payload || typeof payload !== "object") return result;
    ["desktop", "mobile"].forEach(function (modeName) {
      if (payload[modeName] && typeof payload[modeName] === "object") {
        result[modeName] = payload[modeName];
      }
    });
    return result;
  }

  function convertPrototypePayload(payload) {
    if (!payload || typeof payload !== "object") return normalizePayload(payload);
    var looksLikePrototype = Boolean(payload.prototypeLayoutVersion) ||
      Boolean(payload.desktop && payload.desktop.__canvas) ||
      Boolean(payload.mobile && payload.mobile.__canvas);
    if (!looksLikePrototype) return normalizePayload(payload);

    var screens = ["menu", "profile", "users", "inventory", "minigames", "shop", "chat"];
    var globalKeys = new Set([
      "session-user", "session-menu", "avatar", "notifications",
      "global-back-button", "side-chat", "side-panel"
    ]);
    var menuKeys = new Set([
      "main-frame", "home-buttons", "menu-profile", "menu-users",
      "menu-inventory", "menu-minigames", "menu-shop", "social-buttons",
      "social-twitch", "social-youtube"
    ]);

    function screenForKey(key) {
      if (menuKeys.has(key)) return "menu";
      if (key.indexOf("profile-") === 0) return "profile";
      if (key.indexOf("users-") === 0) return "users";
      if (key.indexOf("inventory-") === 0) return "inventory";
      if (key.indexOf("minigames-") === 0 || key.indexOf("game-") === 0) return "minigames";
      if (key.indexOf("shop-") === 0) return "shop";
      if (key.indexOf("chat-") === 0) return "chat";
      return "";
    }

    function convertMode(raw) {
      var result = {};
      screens.forEach(function (name) { result[name] = {}; });
      if (!raw || typeof raw !== "object") return result;
      Object.keys(raw).forEach(function (key) {
        if (key === "__canvas") return;
        var sourceItem = raw[key];
        if (!sourceItem || typeof sourceItem !== "object") return;
        var targets = globalKeys.has(key) ? screens : [screenForKey(key)].filter(Boolean);
        targets.forEach(function (screenName) {
          var hiddenScreens = Array.isArray(sourceItem.hiddenScreens) ? sourceItem.hiddenScreens : [];
          result[screenName][key] = {
            xRatio: Number(sourceItem.xRatio || 0),
            yRatio: Number(sourceItem.yRatio || 0),
            widthRatio: Number(sourceItem.widthRatio || 0),
            heightRatio: Number(sourceItem.heightRatio || 0),
            hidden: hiddenScreens.includes(screenName) || Boolean(sourceItem.hidden),
            lockedWith: sourceItem.lockedWith || null
          };
        });
      });
      return result;
    }

    return {
      desktop: convertMode(payload.desktop),
      mobile: convertMode(payload.mobile)
    };
  }

  function clearStyle(element) {
    element.style.translate = "";
    element.style.width = "";
    element.style.height = "";
    element.style.visibility = "";
    element.style.opacity = "";
    element.style.pointerEvents = "";
    element.classList.remove("ui-layout-sized", "ui-layout-attached");
    delete element.dataset.uiLayoutX;
    delete element.dataset.uiLayoutY;
    delete element.dataset.uiLayoutWidth;
    delete element.dataset.uiLayoutHeight;
    delete element.dataset.uiLayoutHidden;
    delete element.dataset.uiLayoutLockedWith;
  }

  function applyItem(element, item, canvas) {
    if (!item) return;
    var x = Number(item.xRatio) * canvas.width;
    var y = Number(item.yRatio) * canvas.height;
    var width = Number(item.widthRatio) * canvas.width;
    var height = Number(item.heightRatio) * canvas.height;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      element.dataset.uiLayoutX = String(x);
      element.dataset.uiLayoutY = String(y);
      element.style.translate = x + "px " + y + "px";
    }
    if (width > 4) {
      element.dataset.uiLayoutWidth = String(width);
      element.style.width = width + "px";
      element.classList.add("ui-layout-sized");
    }
    if (height > 4) {
      element.dataset.uiLayoutHeight = String(height);
      element.style.height = height + "px";
      element.classList.add("ui-layout-sized");
    }
    if (item.hidden) element.dataset.uiLayoutHidden = "true";
    if (item.lockedWith) element.dataset.uiLayoutLockedWith = String(item.lockedWith);
  }

  function applyCurrentLayout() {
    if (!editorState.loaded) return;
    var layout = screenLayouts(false);
    var canvas = canvasRect();
    allTargets().forEach(clearStyle);
    allTargets().forEach(function (element) {
      applyItem(element, layout[element.dataset.uiLayout], canvas);
    });
    refreshHidden();
  }

  function captureElement(element) {
    var canvas = canvasRect();
    var rect = element.getBoundingClientRect();
    return {
      xRatio: canvas.width ? Number(element.dataset.uiLayoutX || 0) / canvas.width : 0,
      yRatio: canvas.height ? Number(element.dataset.uiLayoutY || 0) / canvas.height : 0,
      widthRatio: canvas.width ? rect.width / canvas.width : 0,
      heightRatio: canvas.height ? rect.height / canvas.height : 0,
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
      return;
    }
    element.classList.add("ui-layout-selected");
    var handle = document.createElement("span");
    handle.className = "ui-layout-resize-handle";
    handle.setAttribute("aria-hidden", "true");
    element.appendChild(handle);
    setStatus(element.dataset.uiLayoutLabel || element.dataset.uiLayout);
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
    var attachment = findAttachment(element, 12);
    if (!attachment) return;
    var target = attachment.candidate;
    if (snap) {
      var rect = element.getBoundingClientRect();
      var other = target.getBoundingClientRect();
      var x = Number(element.dataset.uiLayoutX || 0);
      var y = Number(element.dataset.uiLayoutY || 0);
      if (attachment.side === "left") {
        x += other.right - rect.left;
        y += other.top - rect.top;
      } else if (attachment.side === "right") {
        x += other.left - rect.right;
        y += other.top - rect.top;
      } else if (attachment.side === "top") {
        y += other.bottom - rect.top;
        x += other.left - rect.left;
      } else {
        y += other.top - rect.bottom;
        x += other.left - rect.left;
      }
      element.dataset.uiLayoutX = String(x);
      element.dataset.uiLayoutY = String(y);
      element.style.translate = x + "px " + y + "px";
    }
    element.classList.add("ui-layout-attached");
    target.classList.add("ui-layout-attached");
    editorState.attached = target;
    setStatus("Pegado a " + (target.dataset.uiLayoutLabel || target.dataset.uiLayout));
  }

  function linkedElement(element) {
    var key = element && element.dataset.uiLayoutLockedWith;
    if (!key) return null;
    return document.querySelector("[data-ui-layout=\"" + CSS.escape(key) + "\"]");
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
    element.dataset.uiLayoutWidth = String(safeWidth);
    element.dataset.uiLayoutHeight = String(safeHeight);
    element.style.width = safeWidth + "px";
    element.style.height = safeHeight + "px";
    element.classList.add("ui-layout-sized");
    if (includeLinked !== false) {
      var linked = linkedElement(element);
      if (linked) resizeElement(linked, safeWidth, safeHeight, false);
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
    var rect = element.getBoundingClientRect();
    editorState.pointer = {
      id: event.pointerId,
      type: handle ? "resize" : "move",
      element: element,
      startX: event.clientX,
      startY: event.clientY,
      originX: Number(element.dataset.uiLayoutX || 0),
      originY: Number(element.dataset.uiLayoutY || 0),
      width: rect.width,
      height: rect.height
    };
    if (element.setPointerCapture) element.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    var pointer = editorState.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    var dx = event.clientX - pointer.startX;
    var dy = event.clientY - pointer.startY;
    if (pointer.type === "resize") {
      resizeElement(pointer.element, pointer.width + dx, pointer.height + dy, true);
      setStatus(Math.round(pointer.width + dx) + " × " + Math.round(pointer.height + dy));
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
    } else {
      markTargets();
      setStatus("Editando " + (currentMode() === "mobile" ? "móvil" : "PC") + " · " + currentScreen());
    }
  }

  function exportLayouts() {
    visibleTargets().forEach(commitElement);
    var blob = new Blob([JSON.stringify(editorState.layouts, null, 2)], { type: "application/json" });
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
      applyCurrentLayout();
      setStatus("Diseño importado; pulsa Publicar");
    } catch (error) {
      setStatus("El archivo no contiene un diseño válido");
    }
  }

  async function publishLayouts() {
    visibleTargets().forEach(commitElement);
    if (typeof callApi !== "function" || !state || !state.sessionToken || !state.requestsPanelKey) {
      setStatus("Vuelve a validar el panel privado");
      return;
    }
    setStatus("Publicando diseño...");
    try {
      var response = await callApi({
        action: "publicShopSaveUiLayouts",
        sessionToken: state.sessionToken,
        panelKey: state.requestsPanelKey,
        layouts: editorState.layouts
      });
      if (!response.data || !response.data.ok) {
        throw new Error(response.data && response.data.error ? response.data.error : "unknown_error");
      }
      setStatus("Diseño publicado para PC y móvil");
    } catch (error) {
      setStatus("No se pudo publicar: " + (error.message || "error"));
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
      "<button id=\"uiLayoutGuidesToggle\" type=\"button\" aria-pressed=\"true\">Ocultar marcos</button>" +
      "<button id=\"uiLayoutEqualButton\" type=\"button\">Igualar tamaño</button>" +
      "<button id=\"uiLayoutLockButton\" type=\"button\">Anclar</button>" +
      "<button id=\"uiLayoutHideButton\" type=\"button\">Ocultar selección</button>" +
      "<button id=\"uiLayoutShowHiddenButton\" type=\"button\" aria-pressed=\"false\">Ver ocultos</button>" +
      "<button id=\"uiLayoutResetButton\" type=\"button\">Restaurar pantalla</button>" +
      "<button id=\"uiLayoutExportButton\" type=\"button\">Exportar</button>" +
      "<button id=\"uiLayoutImportButton\" type=\"button\">Importar</button>" +
      "<button id=\"uiLayoutPublishButton\" type=\"button\">Publicar</button>" +
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
    toolbar.querySelector("#uiLayoutGuidesToggle").addEventListener("click", function (event) {
      editorState.guides = !editorState.guides;
      document.body.classList.toggle("ui-layout-guides", editorState.active && editorState.guides);
      event.currentTarget.textContent = editorState.guides ? "Ocultar marcos" : "Mostrar marcos";
      event.currentTarget.setAttribute("aria-pressed", String(editorState.guides));
    });
    toolbar.querySelector("#uiLayoutEqualButton").addEventListener("click", function () {
      if (!editorState.selected || !editorState.attached) return setStatus("Pega primero el elemento a otro");
      var rect = editorState.attached.getBoundingClientRect();
      resizeElement(editorState.selected, rect.width, rect.height, false);
      commitElement(editorState.selected);
      setStatus("Tamaño igualado");
    });
    toolbar.querySelector("#uiLayoutLockButton").addEventListener("click", function (event) {
      if (!editorState.selected) return setStatus("Selecciona un elemento");
      var linked = linkedElement(editorState.selected);
      if (linked) {
        delete linked.dataset.uiLayoutLockedWith;
        delete editorState.selected.dataset.uiLayoutLockedWith;
        event.currentTarget.textContent = "Anclar";
        commitElement(linked);
        commitElement(editorState.selected);
        return setStatus("Elementos desanclados");
      }
      if (!editorState.attached) return setStatus("Pega primero el elemento a otro");
      editorState.selected.dataset.uiLayoutLockedWith = editorState.attached.dataset.uiLayout;
      editorState.attached.dataset.uiLayoutLockedWith = editorState.selected.dataset.uiLayout;
      event.currentTarget.textContent = "Desanclar";
      commitElement(editorState.selected);
      commitElement(editorState.attached);
      setStatus("Elementos anclados");
    });
    toolbar.querySelector("#uiLayoutHideButton").addEventListener("click", function () {
      if (!editorState.selected) return setStatus("Selecciona un elemento");
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
    toolbar.querySelector("#uiLayoutResetButton").addEventListener("click", function () {
      if (!window.confirm("¿Restaurar la distribución de esta pantalla?")) return;
      delete editorState.layouts[currentMode()][currentScreen()];
      saveDraft();
      applyCurrentLayout();
      setStatus("Pantalla restaurada");
    });
    toolbar.querySelector("#uiLayoutExportButton").addEventListener("click", exportLayouts);
    toolbar.querySelector("#uiLayoutImportButton").addEventListener("click", function () {
      toolbar.querySelector("#uiLayoutImportInput").click();
    });
    toolbar.querySelector("#uiLayoutImportInput").addEventListener("change", importLayouts);
    toolbar.querySelector("#uiLayoutPublishButton").addEventListener("click", publishLayouts);
    toolbar.querySelector("#uiLayoutCloseButton").addEventListener("click", closeEditor);
  }

  function openEditor() {
    buildToolbar();
    document.getElementById("uiLayoutEditor").hidden = false;
    var panel = document.getElementById("requestsPanelModal");
    if (panel) panel.hidden = true;
    setEditing(true);
  }

  function closeEditor() {
    setEditing(false);
    var toolbar = document.getElementById("uiLayoutEditor");
    if (toolbar) toolbar.hidden = true;
  }

  async function loadPublished() {
    var remote = null;
    try {
      var response = await callApi({ action: "publicShopGetUiLayouts" });
      if (response.data && response.data.ok) remote = response.data.layouts;
    } catch (error) {}
    editorState.layouts = normalizePayload(remote);
    var desktopDraft = readDraft("desktop");
    var mobileDraft = readDraft("mobile");
    if (Object.keys(desktopDraft).length) editorState.layouts.desktop = desktopDraft;
    if (Object.keys(mobileDraft).length) editorState.layouts.mobile = mobileDraft;
    editorState.loaded = true;
    markTargets();
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
    resizeTimer = setTimeout(applyCurrentLayout, 120);
  });

  var observer = new MutationObserver(function () {
    clearTimeout(observer.timer);
    observer.timer = setTimeout(markTargets, 60);
  });
  observer.observe(document.getElementById("appView") || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"]
  });

  buildToolbar();
  loadPublished();
  window.PerriUiEditor = {
    open: openEditor,
    close: closeEditor,
    refresh: markTargets,
    apply: applyCurrentLayout
  };
})();
