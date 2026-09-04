(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const round = (value) => Math.round(Number(value) || 0);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const slotLabels = { helmet: "Casco", torso: "Torso", hands: "Manos", pants: "Pantalones", boots: "Botas", amulet: "Amuleto" };
  const statLabels = { hp: "HP", physicalAttack: "Ataque físico", spiritualAttack: "Ataque espiritual", physicalDefense: "Defensa física", spiritualDefense: "Defensa espiritual", dexterity: "Destreza", critical: "Crítico", karma: "Karma" };
  const assetVersion = "20260903-7";
  const posePath = (name) => `./assets/perrirpg/${name}.png?v=${assetVersion}`;
  const itemArtwork = {
    "sword-worn": "espada-desgastada.png",
    "sword-shining": "espada-reluciente.png",
    "sword-royal": "espada-real.png",
    "greatsword-rusted": "mandoble-oxidado.png",
    "greatsword-executioner": "mandoble-verdugo.png",
    "greatsword-worldbreaker": "mandoble-quebramundos.png",
    "device-broken-wand": "varita-quebrada.png",
    "device-mage-ring": "anillo-mago.png",
    "device-arcane-staff": "baston-arcano.png",
    "projectile-wood-arrow": "flecha-madera.png",
    "projectile-shuriken": "shuriken.png",
    "projectile-golden-spear": "lanza-dorada.png",
    "shield-broken": "escudo-roto.png",
    "shield-oak": "escudo-roble.png",
    "shield-metal": "escudo-metal.png",
    "potion-weak": "pocion-chica.png",
    "potion-standard": "pocion-mediana.png",
    "potion-potent": "pocion-grande.png",
    "potion-armor": "pocion-armadura.png",
    "potion-critical": "pocion-critico.png",
    "potion-master": "pocion-maestria.png"
  };
  const familyIcons = {
    Espadas: "icono-espada.png",
    Mandobles: "icono-mandoble.png",
    Artilugios: "icono-artilugio.png",
    Proyectiles: "icono-proyectiles.png"
  };
  const kindIcons = { shield: "icono-escudo.png", potion: "icono-pociones.png" };
  const armorIcons = { helmet: "icono-casco.png", torso: "icono-coraza.png", hands: "icono-guantes.png", pants: "icono-pantalones.png", boots: "icono-botas.png", amulet: "icono-amuleto.png" };
  const idleSequence = ["idle-1", "idle-1", "idle-1", "idle-2", "idle-1", "idle-1", "idle-4", "idle-1", "idle-1", "idle-2", "idle-1", "idle-3"];
  const mobileInfoMedia = window.matchMedia("(max-width: 760px)");
  const infoCardSelector = ".info-stat-grid article, .combat-guide article, .rule-grid p, .undead-guide";

  const state = {
    sessionToken: "",
    nick: "",
    pg: 0,
    catalog: [],
    inventory: {},
    equipment: {},
    loadout: [],
    selectedId: "",
    filter: "Todo",
    shopTab: "catalog",
    mainTab: "shop",
    busy: false,
    combat: null,
    queue: [],
    combatMenu: "root",
    animationIndex: 0,
    animationTimer: 0
  };

  function toast(message, bad = false) {
    const element = $("#rpgToast");
    element.textContent = message;
    element.style.borderColor = bad ? "#cf5261" : "var(--cyan)";
    element.hidden = false;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => { element.hidden = true; }, 2600);
  }

  function setBlocking(active, message = "Actualizando...") {
    state.busy = active;
    $("#rpgBlockingText").textContent = message;
    $("#rpgApp").classList.toggle("is-loading", active);
  }

  async function api(action, payload = {}) {
    const response = await fetch("./shop-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sessionToken: state.sessionToken, ...payload })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "network_error");
    if (data?.error === "missing_session" || data?.error === "session_expired") {
      throw new Error("session_expired");
    }
    return data;
  }

  function applyServerState(data) {
    state.nick = String(data.nick || state.nick || "");
    state.pg = Math.max(0, Number(data.pg || 0));
    state.catalog = Array.isArray(data.catalog) ? data.catalog : state.catalog;
    state.inventory = data.inventory && typeof data.inventory === "object" ? data.inventory : state.inventory;
    state.equipment = data.equipment && typeof data.equipment === "object" ? data.equipment : state.equipment;
    state.loadout = Array.isArray(data.loadout) ? data.loadout : state.loadout;
    if (!state.selectedId || !state.catalog.some((item) => item.id === state.selectedId)) state.selectedId = state.catalog[0]?.id || "";
    $("#rpgNick").textContent = state.nick || "Usuario";
    $("#rpgPg").textContent = new Intl.NumberFormat("es-ES").format(state.pg);
    renderAll();
  }

  async function loadState() {
    if (!state.sessionToken) return;
    setBlocking(true, "Cargando tu PerriRPG...");
    try {
      const data = await api("publicShopRpgState");
      if (!data?.ok) throw new Error(data?.error || "rpg_state_failed");
      await api("publicShopRpgClearCombat");
      state.combat = null;
      applyServerState(data);
      setBlocking(false);
    } catch (error) {
      setBlocking(true, error.message === "session_expired" ? "La sesión ha caducado. Vuelve a iniciar sesión." : "No se pudo cargar PerriRPG.");
    }
  }

  function itemEffect(item) {
    const stats = item?.stats || {};
    if (item.kind === "weapon") {
      const hits = Number(stats.hits || 1);
      return `${hits > 1 ? `${hits} × ` : ""}${stats.damage || 0} daño ${stats.damageType === "spiritual" ? "espiritual" : "físico"}`;
    }
    if (item.kind === "potion" && stats.heal) return `+${stats.heal} HP`;
    if (item.kind === "armor") return formatArmorStats(stats);
    return item.effect || "Objeto consumible";
  }

  function artworkPath(item) {
    const filename = itemArtwork[item?.id] || (item?.kind === "armor" ? armorIcons[item?.slot] : "");
    return filename ? posePath(filename.replace(/\.png$/i, "")) : "";
  }

  function typeIconPath(item) {
    const filename = familyIcons[item?.family] || kindIcons[item?.kind];
    return filename ? posePath(filename.replace(/\.png$/i, "")) : "";
  }

  function itemVisual(item, detail = false) {
    const artwork = artworkPath(item);
    if (!artwork) return "";
    const name = escapeHtml(item?.name || "Objeto");
    return `<span class="item-visual${detail ? " detail-visual" : ""}"><img class="item-artwork" src="${artwork}" alt="${name}" loading="lazy"></span>`;
  }

  function itemTypeBadge(item) {
    const typeIcon = typeIconPath(item);
    if (!typeIcon) return "";
    const label = escapeHtml(item?.family || item?.kind || "Tipo de objeto");
    return `<img class="item-type-icon" src="${typeIcon}" alt="${label}" title="${label}" loading="lazy">`;
  }

  function formatArmorStats(stats = {}) {
    return Object.entries(stats).filter(([, value]) => Number(value) !== 0).map(([key, value]) => `${Number(value) > 0 ? "+" : ""}${value}${key === "critical" || key === "dexterity" ? "%" : ""} ${statLabels[key] || key}`).join(" · ");
  }

  function renderFilters() {
    const filters = ["Todo", "Armas", "Pociones", "Escudos", "Armaduras"];
    $("#rpgFilters").innerHTML = filters.map((filter) => `<button type="button" data-filter="${filter}" class="${state.filter === filter ? "active" : ""}">${filter}</button>`).join("");
  }

  function filteredCatalog() {
    const kind = { Armas: "weapon", Pociones: "potion", Escudos: "shield", Armaduras: "armor" }[state.filter];
    const purchasable = state.catalog.filter((item) => !item.starter && item.purchasable !== false);
    return kind ? purchasable.filter((item) => item.kind === kind) : purchasable;
  }

  function renderCatalog() {
    renderFilters();
    const items = filteredCatalog();
    $("#rpgCatalog").innerHTML = items.map((item) => {
      const quantity = Number(state.inventory[item.id] || 0);
      return `<button type="button" class="item-card ${state.selectedId === item.id ? "active" : ""}" data-item-id="${escapeHtml(item.id)}">${itemTypeBadge(item)}<span class="kind">${escapeHtml(item.setName || item.family || item.kind)}</span><div class="item-card-body">${itemVisual(item)}<span class="item-card-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(itemEffect(item))}</small></span></div><footer><span>${item.price === null ? "PRECIO PENDIENTE" : `✦ ${item.price} G`}</span><b>×${quantity}</b></footer></button>`;
    }).join("") || '<p class="equipment-help">No hay objetos en esta categoría.</p>';
    renderDetail();
  }

  function renderDetail() {
    const item = state.catalog.find((entry) => entry.id === state.selectedId) || filteredCatalog()[0];
    if (!item) { $("#rpgDetail").innerHTML = ""; return; }
    state.selectedId = item.id;
    const quantity = Number(state.inventory[item.id] || 0);
    const atMax = quantity >= Number(item.maxQuantity || 1);
    const remaining = Math.max(0, Number(item.maxQuantity || 1) - quantity);
    const amounts = Number(item.maxQuantity || 1) > 1 ? [1, 5, 30] : [1];
    const purchaseButtons = amounts.map((requested) => {
      const delivered = Math.min(requested, remaining);
      const cost = item.price === null ? 0 : delivered * Number(item.price || 0);
      const disabled = item.price === null || atMax || delivered < 1 || state.pg < cost || state.busy;
      const detail = item.price === null ? "Precio pendiente" : atMax ? `Máximo ${item.maxQuantity}` : state.pg < cost ? `${cost} Gemas necesarias` : delivered < requested ? `${delivered} uds · ${cost} G` : `${cost} G`;
      return `<button type="button" class="purchase-button" data-buy-id="${escapeHtml(item.id)}" data-buy-quantity="${requested}" ${disabled ? "disabled" : ""}><b>COMPRAR ×${requested}</b><small>${escapeHtml(detail)}</small></button>`;
    }).join("");
    $("#rpgDetail").innerHTML = `${itemVisual(item, true)}<span class="detail-kind">${escapeHtml(item.kind)} / ${escapeHtml(item.setName || item.family)}</span><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.effect)}</p><div class="detail-facts"><div><span>EFECTO</span><b>${escapeHtml(itemEffect(item))}</b></div><div><span>POSEES</span><b>${quantity} / ${item.maxQuantity}</b></div><div><span>CONSUMO</span><b>${item.kind === "armor" ? "Permanente" : "Un uso"}</b></div></div><div class="purchase-options">${purchaseButtons}</div>`;
  }

  async function buyItem(itemId, requestedQuantity = 1) {
    if (state.busy) return;
    state.busy = true;
    renderDetail();
    try {
      const data = await api("publicShopRpgPurchase", { itemId, quantity: requestedQuantity });
      if (!data?.ok) {
        const messages = { max_quantity: "Ya tienes la cantidad máxima.", price_pending: "El precio de esta armadura aún no está fijado.", not_enough_polvoGema: "No tienes suficientes Gemas." };
        toast(messages[data?.error] || "No se pudo completar la compra.", true);
        return;
      }
      applyServerState(data);
      const purchased = Number(data.purchase?.purchasedQuantity || 0);
      const cost = Number(data.purchase?.totalCost || 0);
      const adjusted = Boolean(data.purchase?.adjustedToMaximum);
      toast(`${state.catalog.find((item) => item.id === itemId)?.name || "Objeto"}: +${purchased} por ${cost} Gemas${adjusted ? " · ajustado al máximo" : ""}.`);
    } catch { toast("No se pudo conectar con la tienda.", true); }
    finally { state.busy = false; renderDetail(); }
  }

  function karmaModifiers(karma) {
    if (karma > 0) return { hp: 10 + (karma - 1) * 2.5, defense: 5 + (karma - 1) * 2, physicalDamage: 0, spiritualDamage: 0, critical: 0 };
    if (karma < 0) {
      const points = Math.abs(karma);
      return { hp: -(20 + (points - 1) * 5), defense: -(10 + (points - 1) * 2.5), physicalDamage: 15 + (points - 1) * 2.5, spiritualDamage: 20 + (points - 1) * 4, critical: 10 + (points - 1) * 2.5 };
    }
    return { hp: 0, defense: 0, physicalDamage: 0, spiritualDamage: 0, critical: 0 };
  }

  function calculateBuild() {
    const base = { hp: 100, physicalAttack: 10, spiritualAttack: 10, physicalDefense: 10, spiritualDefense: 10, dexterity: 0, critical: 0, karma: 0 };
    Object.values(state.equipment).forEach((itemId) => {
      const item = state.catalog.find((entry) => entry.id === itemId && entry.kind === "armor");
      if (!item) return;
      Object.entries(item.stats || {}).forEach(([key, value]) => { if (key in base) base[key] += Number(value || 0); });
    });
    const modifiers = karmaModifiers(base.karma);
    const calculatedHp = round(base.hp * (1 + modifiers.hp / 100));
    const undead = calculatedHp <= 0;
    return {
      ...base,
      hp: calculatedHp,
      maxHp: undead ? round(base.hp * 1.5) : calculatedHp,
      physicalDefense: undead ? 0 : Math.max(0, round(base.physicalDefense * (1 + modifiers.defense / 100))),
      spiritualDefense: Math.max(0, round(base.spiritualDefense * (1 + modifiers.defense / 100))),
      critical: clamp(base.critical + modifiers.critical, 0, 100),
      physicalDamageBonus: modifiers.physicalDamage + (undead ? 15 : 0),
      spiritualDamageBonus: modifiers.spiritualDamage,
      undead
    };
  }

  function renderEquipment() {
    const build = calculateBuild();
    $("#rpgBuildState").textContent = build.undead ? "UNDEAD" : "NORMAL";
    $("#rpgBuildState").style.color = build.undead ? "#df5b79" : "var(--cyan)";
    const displayed = [["HP", `${build.hp} / ${build.maxHp}`], ["ATQ F", build.physicalAttack], ["ATQ E", build.spiritualAttack], ["DEF F", build.physicalDefense], ["DEF E", build.spiritualDefense], ["Destreza", `${build.dexterity}%`], ["Crítico", `${build.critical}%`], ["Karma", build.karma]];
    $("#rpgStats").innerHTML = displayed.map(([label, value]) => `<div class="stat-cell"><span>${label}</span><b>${value}</b></div>`).join("");
    $("#rpgArmorSlots").innerHTML = Object.entries(slotLabels).map(([slot, label]) => {
      const owned = state.catalog.filter((item) => item.kind === "armor" && item.slot === slot && Number(state.inventory[item.id] || 0) > 0);
      const current = state.equipment[slot] || "";
      const options = [`<option value="">Sin equipar</option>`, ...owned.map((item) => `<option value="${escapeHtml(item.id)}" ${current === item.id ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.setName || "")}</option>`)].join("");
      return `<article class="armor-slot"><header><span>${label}</span><b>${current ? "EQUIPADO" : "VACÍO"}</b></header><select data-armor-slot="${slot}" ${owned.length ? "" : "disabled"}>${options}</select><small>${current ? escapeHtml(formatArmorStats(state.catalog.find((item) => item.id === current)?.stats || {})) : "No hay pieza equipada"}</small></article>`;
    }).join("");
    const ownedBattleItems = state.catalog.filter((item) => ["weapon", "potion", "shield"].includes(item.kind) && Number(state.inventory[item.id] || 0) > 0);
    $("#rpgLoadout").innerHTML = ownedBattleItems.map((item) => {
      const active = state.loadout.includes(item.id);
      return `<article class="loadout-item">${itemVisual(item)}<div><strong>${escapeHtml(item.name)}</strong><small>×${state.inventory[item.id]} · máximo ${item.maxQuantity}</small></div><button type="button" class="${active ? "active" : ""}" data-loadout-id="${escapeHtml(item.id)}" data-enabled="${active ? "false" : "true"}">${active ? "ACTIVO" : "AÑADIR"}</button></article>`;
    }).join("") || '<p class="equipment-help">Compra armas, pociones o escudos para preparar tu selección de combate.</p>';
  }

  async function equipArmor(slot, itemId) {
    if (!itemId) { toast("Por ahora una ranura equipada se cambia eligiendo otra pieza.", true); renderEquipment(); return; }
    try {
      const data = await api("publicShopRpgEquipArmor", { slot, itemId });
      if (!data?.ok) throw new Error(data?.error || "equip_failed");
      state.combat = null;
      applyServerState(data);
      toast("Armadura equipada. El siguiente combate usará la nueva build.");
    } catch { toast("No se pudo equipar la pieza.", true); renderEquipment(); }
  }

  async function setLoadout(itemId, enabled) {
    try {
      const data = await api("publicShopRpgSetLoadout", { itemId, enabled });
      if (!data?.ok) throw new Error(data?.error || "loadout_failed");
      applyServerState(data);
      toast(enabled ? "Objeto añadido al combate." : "Objeto retirado del combate.");
    } catch { toast("No se pudo cambiar la selección de combate.", true); }
  }

  function normalizeSavedCombat(saved) {
    const build = calculateBuild();
    return {
      round: Math.max(1, Number(saved.round || 1)), phase: "player", result: null,
      player: { ...build, hp: Number(saved.playerHp), maxHp: Number(saved.playerMaxHp), grace: Boolean(saved.undead && Number(saved.round || 1) === 1), statuses: Array.isArray(saved.playerStatuses) ? saved.playerStatuses : [] },
      enemy: { hp: Number(saved.enemyHp), maxHp: Number(saved.enemyMaxHp || 5000), physicalAttack: 20, spiritualAttack: 15, physicalDefense: 60, spiritualDefense: 30, royalShellUsed: (saved.enemyStatuses || []).some((status) => status.id === "royal-shell"), statuses: Array.isArray(saved.enemyStatuses) ? saved.enemyStatuses : [] },
      log: Array.isArray(saved.log) && saved.log.length ? saved.log : ["El Rey Cangrosio IV bloquea el camino."]
    };
  }

  function newCombat() {
    const build = calculateBuild();
    state.combat = {
      round: 1, phase: "player", result: null,
      player: { ...build, hp: build.hp, grace: build.undead, statuses: build.undead ? [{ id: "undead", label: "Undead", turns: 0 }] : [] },
      enemy: { hp: 5000, maxHp: 5000, physicalAttack: 20, spiritualAttack: 15, physicalDefense: 60, spiritualDefense: 30, royalShellUsed: false, statuses: [] },
      log: [build.undead ? "El Karma consume tu vida. Despiertas como Undead: supera 0 HP esta ronda." : "El Rey Cangrosio IV bloquea el camino.", "Elige tu primera acción. Después puedes usarla o añadir una segunda."]
    };
    state.queue = [];
    state.combatMenu = "root";
    $("#combatResult").hidden = true;
    $("#combatReward").hidden = true;
    setEnemyPose("idle-1");
    renderCombat();
    saveCombat();
  }

  function hpPercent(value, max) { return clamp((Math.max(0, value) / Math.max(1, max)) * 100, 0, 100); }
  function updateStatus(statuses, next) { return [...statuses.filter((status) => status.id !== next.id), next]; }
  function defenseDamage(raw, defense) { return Math.max(1, round(raw * (100 / (100 + Math.max(0, defense))))); }
  function setEnemyPose(name) { $("#enemySprite").src = posePath(name); }
  function catalogItem(id) { return state.catalog.find((item) => item.id === id); }
  function loadedItems(kind) { return state.catalog.filter((item) => item.kind === kind && state.loadout.includes(item.id) && Number(state.inventory[item.id] || 0) > 0); }

  function statusHtml(statuses) {
    return statuses.length ? statuses.map((status) => `<span class="status-chip" title="${escapeHtml(status.label)}">${escapeHtml(status.label)}${status.turns > 0 ? ` · ${status.turns}` : ""}</span>`).join("") : "Sin efectos activos";
  }

  function renderCombatMenu() {
    const combat = state.combat;
    if (!combat) return;
    const root = state.combatMenu === "root";
    const entries = root ? [] : state.combatMenu === "attack" ? loadedItems("weapon") : state.combatMenu === "items" ? loadedItems("potion") : loadedItems("shield");
    let html = "";
    if (root) {
      html = `<button class="combat-button" data-combat-menu="attack">Ataque</button><button class="combat-button" data-combat-menu="items">Objetos</button><button class="combat-button" data-combat-menu="defense" ${combat.player.undead ? "disabled" : ""}>Defenderse</button>`;
    } else {
      html = entries.map((item) => `<button class="combat-button combat-item-button" data-action-id="${escapeHtml(item.id)}">${itemVisual(item)}<span class="combat-button-copy"><b>×${state.inventory[item.id]}</b>${escapeHtml(item.name)}<small>${escapeHtml(itemEffect(item))}</small></span></button>`).join("") || '<button class="combat-button" disabled>No tienes objetos preparados</button>';
      html += '<button class="combat-button" data-combat-menu="root">‹ Volver</button>';
    }
    $("#combatMenu").innerHTML = html;
    $("#combatMenu").classList.toggle("has-list", !root);
    $(".command-panel").classList.toggle("has-list", !root);
  }

  function renderCombat() {
    if (!state.combat) newCombat();
    const combat = state.combat;
    $("#enemyHpText").textContent = `${round(combat.enemy.hp)} / ${combat.enemy.maxHp}`;
    $("#enemyHpBar").style.width = `${hpPercent(combat.enemy.hp, combat.enemy.maxHp)}%`;
    $("#playerKind").childNodes[0].nodeValue = `${combat.player.undead ? "UNDEAD" : "VIAJERO"} `;
    $("#playerHpText").textContent = `${round(combat.player.hp)} / ${round(combat.player.maxHp)}`;
    $("#playerHpBar").style.width = `${hpPercent(combat.player.hp, combat.player.maxHp)}%`;
    $("#enemyStatuses").innerHTML = statusHtml(combat.enemy.statuses).replace("Sin efectos activos", "Sin alteraciones");
    $("#playerStatuses").innerHTML = statusHtml(combat.player.statuses);
    $("#combatRound").textContent = `Turno de combate ${combat.round}`;
    $("#combatPhase").textContent = combat.phase === "player" ? "Tu decisión" : combat.phase === "resolving" ? "Resolviendo" : "Finalizado";
    $("#combatMessages").innerHTML = combat.log.slice(-9).map((line) => `<p>› ${escapeHtml(line)}</p>`).join("");
    $("#actionOne").textContent = state.queue[0]?.name || "Primera acción";
    $("#actionTwo").textContent = state.queue[1]?.name || (state.queue[0]?.turnCost === 2 ? "Ocupada por la primera acción" : state.queue[0] ? "Elige otra acción" : "Segunda acción opcional");
    $("#clearActions").disabled = !state.queue.length || combat.phase !== "player";
    $("#useActions").disabled = !state.queue.length || combat.phase !== "player";
    renderCombatMenu();
  }

  function chooseAction(itemId) {
    const item = catalogItem(itemId);
    const combat = state.combat;
    if (!item || combat.phase !== "player") return;
    const action = { id: item.id, name: item.name, kind: item.kind, turnCost: Number(item.stats?.turnCost || 1), pairedDefense: false };
    const usedTurns = state.queue.reduce((sum, queued) => sum + queued.turnCost, 0);
    if (item.kind === "shield") {
      if (combat.player.undead) return;
      if (!state.queue.length) action.turnCost = 2;
      else {
        const first = state.queue[0];
        if (state.queue.length !== 1 || !first.id.startsWith("sword-") || usedTurns !== 1) { toast("Solo una espada permite usar escudo como segunda acción.", true); return; }
        action.pairedDefense = true;
      }
    }
    if (usedTurns + action.turnCost > 2) { toast("No quedan acciones disponibles en este turno.", true); return; }
    state.queue.push(action);
    state.combatMenu = "root";
    renderCombat();
  }

  async function consumeItem(itemId) {
    try {
      const data = await api("publicShopRpgConsume", { itemId });
      if (!data?.ok) { toast("Ese objeto ya no está disponible.", true); return false; }
      const quantity = Math.max(0, Number(data.consumption?.quantity || 0));
      state.inventory[itemId] = quantity;
      if (quantity === 0) state.loadout = state.loadout.filter((id) => id !== itemId);
      return true;
    } catch { toast("No se pudo confirmar el consumo en Supabase.", true); return false; }
  }

  function playerBuff(player, id) { return Number(player.statuses.find((status) => status.id === id)?.strength || 0); }
  function enemyShield(enemy) { return enemy.statuses.some((status) => status.id === "royal-shell" && status.turns > 0); }

  async function performPlayerAction(action) {
    const combat = state.combat;
    const item = catalogItem(action.id);
    if (!item || !(await consumeItem(action.id))) return false;
    let message = "";
    if (item.kind === "weapon") {
      setEnemyPose("attack");
      const spiritual = item.stats.damageType === "spiritual";
      const dexterity = combat.player.dexterity + playerBuff(combat.player, "potion-master");
      const criticalChance = combat.player.critical + playerBuff(combat.player, "potion-critical") + Number(item.stats.criticalBonus || 0);
      const modifier = 1 + (spiritual ? combat.player.spiritualDamageBonus : combat.player.physicalDamageBonus) / 100;
      const healthBonus = item.family === "Mandobles" ? .5 * (combat.enemy.hp / combat.enemy.maxHp) : 0;
      const hits = Number(item.stats.hits || 1);
      const damages = [];
      let criticals = 0;
      for (let index = 0; index < hits; index += 1) {
        let raw = (Number(item.stats.damage || 0) * (1 + dexterity / 100) + (spiritual ? combat.player.spiritualAttack : combat.player.physicalAttack)) * modifier * (1 + healthBonus);
        if (!spiritual && Math.random() * 100 < criticalChance) { raw *= 1.5; criticals += 1; }
        let damage = defenseDamage(raw, spiritual ? combat.enemy.spiritualDefense : combat.enemy.physicalDefense);
        if (!spiritual && enemyShield(combat.enemy)) damage = Math.max(1, round(damage * .8));
        damages.push(damage);
      }
      const total = damages.reduce((sum, value) => sum + value, 0);
      combat.enemy.hp = Math.max(0, combat.enemy.hp - total);
      if (combat.player.undead) combat.player.hp = Math.min(combat.player.maxHp, combat.player.hp + Math.max(1, Math.floor(total * (spiritual ? .05 : .1))));
      if (item.family === "Mandobles" && combat.enemy.hp > 0 && Math.random() < .2) combat.enemy.statuses = updateStatus(combat.enemy.statuses, { id: "stunned", label: "Aturdido", turns: 1 });
      message = `${item.name} causa ${total} de daño ${spiritual ? "espiritual" : "físico"}${criticals ? ` · ${criticals} crítico${criticals > 1 ? "s" : ""}` : ""}.`;
      await wait(180); setEnemyPose(enemyShield(combat.enemy) ? "shield-1" : "hurt-1"); await wait(150);
    } else if (item.kind === "potion") {
      if (item.stats.heal) {
        const before = combat.player.hp;
        combat.player.hp = Math.min(combat.player.maxHp, combat.player.hp + Number(item.stats.heal));
        message = `${item.name} recupera ${round(combat.player.hp - before)} HP.`;
      } else {
        const status = item.id === "potion-armor" ? { id: item.id, label: "+30 ambas defensas", strength: 30, turns: 3 } : item.id === "potion-critical" ? { id: item.id, label: "+15% Crítico", strength: 15, turns: 3 } : { id: item.id, label: "+20% Destreza", strength: 20, turns: 3 };
        combat.player.statuses = updateStatus(combat.player.statuses, status);
        message = `${item.name} activa ${status.label} durante 3 turnos.`;
      }
    } else if (item.kind === "shield") {
      const status = { id: item.id, label: item.name, turns: 1, ...item.stats };
      combat.player.statuses = updateStatus(combat.player.statuses, status);
      message = action.pairedDefense ? `${item.name} se equipa tras la espada.` : `${item.name} ocupa las dos acciones; el enemigo solo tendrá una.`;
    }
    if (!combat.enemy.royalShellUsed && combat.enemy.hp > 0 && combat.enemy.hp <= combat.enemy.maxHp / 2) {
      combat.enemy.royalShellUsed = true;
      combat.enemy.statuses = updateStatus(combat.enemy.statuses, { id: "royal-shell", label: "Caparazón Real", turns: 3 });
      message += " Rey Cangrosio IV alza su Caparazón Real.";
    }
    combat.log.push(message);
    setEnemyPose(enemyShield(combat.enemy) ? "shield-1" : "idle-1");
    renderCombat();
    return true;
  }

  async function performEnemyAction(index) {
    const combat = state.combat;
    const stunned = combat.enemy.statuses.find((status) => status.id === "stunned");
    if (stunned) {
      combat.enemy.statuses = combat.enemy.statuses.filter((status) => status.id !== "stunned");
      combat.log.push("Rey Cangrosio IV está aturdido y pierde esta acción.");
      renderCombat(); await wait(260); return;
    }
    setEnemyPose(enemyShield(combat.enemy) ? "shield-2" : "attack"); await wait(180);
    const spiritual = (combat.round + index) % 3 === 0;
    const armor = playerBuff(combat.player, "potion-armor");
    let damage = defenseDamage(spiritual ? combat.enemy.spiritualAttack : combat.enemy.physicalAttack, (spiritual ? combat.player.spiritualDefense : combat.player.physicalDefense) + armor);
    const metal = combat.player.statuses.find((status) => status.id === "shield-metal");
    const broken = combat.player.statuses.find((status) => status.id === "shield-broken");
    const oak = combat.player.statuses.find((status) => status.id === "shield-oak");
    if (metal) damage = Math.max(1, round(damage * .5));
    else if (oak) damage = Math.max(1, round(damage * (spiritual ? .8 : .65)));
    else if (!spiritual && broken) damage = Math.max(1, round(damage * .8));
    combat.player.hp -= damage;
    combat.log.push(`Rey Cangrosio IV usa ${spiritual ? "Eco vacío" : "Zarpazo de piedra"}: recibes ${damage} de daño ${spiritual ? "espiritual" : "físico"}.`);
    renderCombat(); await wait(260); setEnemyPose(enemyShield(combat.enemy) ? "shield-1" : "idle-1");
  }

  async function executeActions() {
    const combat = state.combat;
    if (!state.queue.length || combat.phase !== "player") return;
    const selected = state.queue.slice();
    const executed = [];
    combat.phase = "resolving";
    renderCombat();
    for (const action of selected) {
      if (await performPlayerAction(action)) executed.push(action);
      if (combat.enemy.hp <= 0) break;
    }
    if (combat.enemy.hp > 0 && executed.length) {
      const enemyActions = executed[0].kind === "shield" ? 1 : executed.reduce((sum, action) => sum + action.turnCost, 0);
      for (let index = 0; index < enemyActions; index += 1) {
        await performEnemyAction(index);
        if (!combat.player.grace && combat.player.hp <= 0) break;
      }
    }
    finishRound();
  }

  function finishRound() {
    const combat = state.combat;
    if (combat.player.undead && combat.player.hp > 0) {
      const loss = Math.max(1, Math.ceil(combat.player.hp * .05));
      combat.player.hp -= loss;
      combat.log.push(`Undead consume ${loss} HP, el 5% de tu vida actual.`);
    }
    combat.player.statuses = combat.player.statuses.map((status) => status.turns > 0 ? { ...status, turns: status.turns - 1 } : status).filter((status) => status.id === "undead" || status.turns > 0);
    combat.enemy.statuses = combat.enemy.statuses.map((status) => ({ ...status, turns: status.turns - 1 })).filter((status) => status.turns > 0);
    const lost = combat.player.hp <= 0;
    const won = combat.enemy.hp <= 0;
    combat.player.grace = false;
    combat.phase = won || lost ? "ended" : "player";
    combat.result = won ? "victory" : lost ? "defeat" : null;
    if (!combat.result) combat.round += 1;
    state.queue = [];
    state.combatMenu = "root";
    if (combat.result) {
      $("#combatResultTag").textContent = won ? "VICTORIA" : "DERROTA";
      $("#combatResultTitle").textContent = won ? "El umbral se abre" : "Tu esencia se desvanece";
      $("#combatResult").hidden = false;
      if (won) setEnemyPose("defeat");
    }
    renderCombat(); renderEquipment();
    if (combat.result) finalizeCombat();
    else saveCombat();
  }

  async function saveCombat() {
    if (!state.sessionToken || !state.combat) return;
    const combat = state.combat;
    try {
      const data = await api("publicShopRpgSaveCombat", { combat: { round: combat.round, playerHp: combat.player.hp, playerMaxHp: combat.player.maxHp, enemyHp: combat.enemy.hp, enemyMaxHp: combat.enemy.maxHp, undead: combat.player.undead, playerStatuses: combat.player.statuses, enemyStatuses: combat.enemy.statuses, log: combat.log } });
      if (data?.bossDefeated) {
        toast("¡Logro desbloqueado: Me gusta el marisco!");
        const reward = data.bossReward;
        if (reward?.ok) {
          $("#combatReward").hidden = !reward.granted;
          if (reward.granted) toast("¡Has conseguido una Pinza Real!");
        }
        window.parent.postMessage({ type: "perrirpg-achievement-unlocked", inventory: data.inventory, profile: data.profile, achievementSystem: data.achievementSystem }, window.location.origin);
      }
      return data;
    } catch (error) {
      return null;
    }
  }

  async function clearRemoteCombat() {
    if (!state.sessionToken) return;
    try { await api("publicShopRpgClearCombat"); } catch (error) {}
  }

  async function finalizeCombat() {
    await saveCombat();
    await clearRemoteCombat();
  }

  function discardCombat() {
    state.combat = null;
    state.queue = [];
    state.combatMenu = "root";
    stopAnimation();
    $("#combatResult").hidden = true;
    setCombatNavigation(false);
    clearRemoteCombat();
  }

  function setCombatNavigation(active) {
    $(".rpg-main-tabs").classList.toggle("is-combat-mode", active);
    $("#abandonCombat").hidden = !active;
    $$('[data-main-tab="shop"], [data-main-tab="info"]').forEach((button) => { button.hidden = active; });
    const subtitle = $('[data-main-tab="combat"] small');
    if (subtitle) subtitle.textContent = active ? "Partida activa" : "Nueva partida";
  }

  function requestCombat() {
    $("#combatConfirm").hidden = false;
  }

  function cancelCombatRequest() {
    $("#combatConfirm").hidden = true;
  }

  function requestAbandonCombat() {
    if (state.combat) $("#combatAbandonConfirm").hidden = false;
  }

  function cancelAbandonCombat() {
    $("#combatAbandonConfirm").hidden = true;
  }

  function syncInfoCardAccessibility() {
    $$(infoCardSelector).forEach((card) => {
      if (mobileInfoMedia.matches) {
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", `Ampliar: ${card.querySelector("b, h2")?.textContent.trim() || "información"}`);
      } else {
        card.removeAttribute("role");
        card.removeAttribute("tabindex");
        card.removeAttribute("aria-label");
      }
    });
  }

  function openInfoDetail(card) {
    if (!mobileInfoMedia.matches || state.mainTab !== "info" || !card) return false;
    const titleElement = card.querySelector("b, h2");
    const paragraph = card.matches(".rule-grid p") ? card : card.querySelector("p");
    const title = titleElement?.textContent.trim().replace(/:$/, "") || "Información";
    let detail = paragraph?.textContent.trim() || card.textContent.trim();
    if (paragraph === card && titleElement) detail = detail.slice(titleElement.textContent.trim().length).trim();
    $("#infoDetailTitle").textContent = title;
    $("#infoDetailText").textContent = detail;
    $("#infoDetailModal").hidden = false;
    $("#closeInfoDetail").focus();
    return true;
  }

  function closeInfoDetail() {
    $("#infoDetailModal").hidden = true;
  }

  function confirmAbandonCombat() {
    cancelAbandonCombat();
    discardCombat();
    showMainTab("shop");
    toast("Combate abandonado. La partida ha sido eliminada.");
  }

  async function confirmCombatRequest() {
    const button = $("#confirmCombat");
    button.disabled = true;
    try {
      await api("publicShopRpgClearCombat");
      state.combat = null;
      newCombat();
      cancelCombatRequest();
      showMainTab("combat");
      setCombatNavigation(true);
    } catch (error) {
      toast("No se pudo preparar una partida nueva.", true);
    } finally {
      button.disabled = false;
    }
  }

  function showMainTab(tab) {
    if (tab !== "info") closeInfoDetail();
    state.mainTab = tab;
    $("#rpgShop").hidden = tab !== "shop";
    $("#rpgInfo").hidden = tab !== "info";
    $("#rpgCombat").hidden = tab !== "combat";
    $$("[data-main-tab]").forEach((button) => button.classList.toggle("active", button.dataset.mainTab === tab));
    if (tab === "combat") { renderCombat(); startAnimation(); }
    else stopAnimation();
  }

  function showShopTab(tab) {
    state.shopTab = tab;
    $("#rpgCatalogView").hidden = tab !== "catalog";
    $("#rpgEquipmentView").hidden = tab !== "equipment";
    $$("[data-shop-tab]").forEach((button) => button.classList.toggle("active", button.dataset.shopTab === tab));
    if (tab === "equipment") renderEquipment(); else renderCatalog();
  }

  function startAnimation() {
    stopAnimation();
    state.animationTimer = window.setInterval(() => {
      if (state.mainTab !== "combat" || state.combat?.phase !== "player" || state.combat?.result) return;
      const poses = enemyShield(state.combat.enemy) ? ["shield-1", "shield-2", "shield-3"] : idleSequence;
      state.animationIndex = (state.animationIndex + 1) % poses.length;
      setEnemyPose(poses[state.animationIndex]);
    }, 420);
  }
  function stopAnimation() { window.clearInterval(state.animationTimer); state.animationTimer = 0; }

  function renderAll() { renderCatalog(); renderEquipment(); if (state.combat) renderCombat(); }

  document.addEventListener("click", (event) => {
    const infoCard = event.target.closest(infoCardSelector);
    if (infoCard && openInfoDetail(infoCard)) return;
    const main = event.target.closest("[data-main-tab]");
    if (main) {
      if (main.dataset.mainTab === "combat") return state.mainTab === "combat" ? undefined : requestCombat();
      if (state.mainTab === "combat") discardCombat();
      return showMainTab(main.dataset.mainTab);
    }
    const shop = event.target.closest("[data-shop-tab]"); if (shop) return showShopTab(shop.dataset.shopTab);
    const filter = event.target.closest("[data-filter]"); if (filter) { state.filter = filter.dataset.filter; const first = filteredCatalog()[0]; if (first) state.selectedId = first.id; return renderCatalog(); }
    const card = event.target.closest("[data-item-id]"); if (card) { state.selectedId = card.dataset.itemId; return renderCatalog(); }
    const buy = event.target.closest("[data-buy-id]"); if (buy) return buyItem(buy.dataset.buyId, Number(buy.dataset.buyQuantity || 1));
    const loadout = event.target.closest("[data-loadout-id]"); if (loadout) return setLoadout(loadout.dataset.loadoutId, loadout.dataset.enabled === "true");
    const combatMenu = event.target.closest("[data-combat-menu]"); if (combatMenu) { state.combatMenu = combatMenu.dataset.combatMenu; return renderCombat(); }
    const action = event.target.closest("[data-action-id]"); if (action) return chooseAction(action.dataset.actionId);
  });
  document.addEventListener("change", (event) => { const select = event.target.closest("[data-armor-slot]"); if (select) equipArmor(select.dataset.armorSlot, select.value); });
  $("#clearActions").addEventListener("click", () => { state.queue = []; state.combatMenu = "root"; renderCombat(); });
  $("#useActions").addEventListener("click", executeActions);
  $("#newCombat").addEventListener("click", () => { discardCombat(); showMainTab("shop"); requestCombat(); });
  $("#cancelCombat").addEventListener("click", cancelCombatRequest);
  $("#confirmCombat").addEventListener("click", confirmCombatRequest);
  $("#abandonCombat").addEventListener("click", requestAbandonCombat);
  $("#cancelAbandonCombat").addEventListener("click", cancelAbandonCombat);
  $("#confirmAbandonCombat").addEventListener("click", confirmAbandonCombat);
  $("#closeInfoDetail").addEventListener("click", closeInfoDetail);
  $("#infoDetailModal").addEventListener("click", (event) => { if (event.target === $("#infoDetailModal")) closeInfoDetail(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#infoDetailModal").hidden) return closeInfoDetail();
    if ((event.key === "Enter" || event.key === " ") && event.target.matches?.(infoCardSelector)) {
      event.preventDefault();
      openInfoDetail(event.target);
    }
  });
  mobileInfoMedia.addEventListener?.("change", syncInfoCardAccessibility);
  syncInfoCardAccessibility();

  window.addEventListener("message", (event) => {
    if (event.origin === window.location.origin && event.data?.type === "perrirpg-close") {
      cancelCombatRequest();
      cancelAbandonCombat();
      closeInfoDetail();
      discardCombat();
      showMainTab("shop");
      return;
    }
    if (event.origin !== window.location.origin || event.data?.type !== "perrirpg-session") return;
    const token = String(event.data.sessionToken || "");
    if (!token || token === state.sessionToken) return;
    state.sessionToken = token;
    loadState();
  });
  window.addEventListener("pagehide", () => {
    if (!state.sessionToken) return;
    const body = JSON.stringify({ action: "publicShopRpgClearCombat", sessionToken: state.sessionToken });
    navigator.sendBeacon("./shop-api", new Blob([body], { type: "application/json" }));
  });
  window.parent.postMessage({ type: "perrirpg-ready" }, window.location.origin);
})();
