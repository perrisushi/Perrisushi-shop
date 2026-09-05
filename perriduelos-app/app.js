const duelTabs = Array.from(document.querySelectorAll("[data-duel-tab]"));
const duelPanels = Array.from(document.querySelectorAll("[data-duel-panel]"));
const duelApp = document.querySelector(".duel-app");
const duelTab = document.querySelector('[data-duel-tab="duel"]');
const equipmentTab = document.querySelector('[data-duel-tab="equipment"]');
const duelExitButton = document.getElementById("duelExitButton");
const equipmentSlots = Array.from(document.querySelectorAll("[data-slot-name]"));
const duelArena = document.querySelector(".duel-arena");
const duelFrame = document.querySelector("[data-duel-frame]");
const equipmentGearGrid = document.getElementById("equipmentGearGrid");
const equipmentGemCount = document.getElementById("equipmentGemCount");
const equipmentPerricitaCount = document.getElementById("equipmentPerricitaCount");
const equipmentUpgradeDetails = document.getElementById("equipmentUpgradeDetails");
const equipmentUpgradeVisual = document.getElementById("equipmentUpgradeVisual");
const equipmentUpgradeImage = document.getElementById("equipmentUpgradeImage");
const equipmentUpgradeType = document.getElementById("equipmentUpgradeType");
const equipmentUpgradeName = document.getElementById("equipmentUpgradeName");
const equipmentUpgradeNext = document.getElementById("equipmentUpgradeNext");
const equipmentUpgradeCost = document.getElementById("equipmentUpgradeCost");
const equipmentUpgradeChance = document.getElementById("equipmentUpgradeChance");
const equipmentUsePerricita = document.getElementById("equipmentUsePerricita");
const equipmentPerricitaBonus = document.getElementById("equipmentPerricitaBonus");
const equipmentUpgradeButton = document.getElementById("equipmentUpgradeButton");
const equipmentSystemMessage = document.getElementById("equipmentSystemMessage");
const equipmentHelpButton = document.getElementById("equipmentHelpButton");
const equipmentHelpModal = document.getElementById("equipmentHelpModal");
const equipmentHelpClose = document.getElementById("equipmentHelpClose");
const duelHelpButton = document.getElementById("duelHelpButton");
const duelHelpModal = document.getElementById("duelHelpModal");
const duelHelpClose = document.getElementById("duelHelpClose");
const duelAttackerName = document.getElementById("duelAttackerName");
const duelDefenderName = document.getElementById("duelDefenderName");
const duelAttackerWeaponName = document.getElementById("duelAttackerWeaponName");
const duelAttackerWeaponLevel = document.getElementById("duelAttackerWeaponLevel");
const duelAttackerSuitCount = document.getElementById("duelAttackerSuitCount");
const duelAttackerPower = document.getElementById("duelAttackerPower");
const duelAttackerTicketCount = document.getElementById("duelAttackerTicketCount");
const duelDefenderShieldName = document.getElementById("duelDefenderShieldName");
const duelDefenderShieldLevel = document.getElementById("duelDefenderShieldLevel");
const duelDefenderSuitCount = document.getElementById("duelDefenderSuitCount");
const duelDefenderDefense = document.getElementById("duelDefenderDefense");
const duelDefenderPcAtStake = document.getElementById("duelDefenderPcAtStake");
const duelAttackButton = document.getElementById("duelAttackButton");
const duelAttackerStatus = document.getElementById("duelAttackerStatus");
const duelDefenderStatus = document.getElementById("duelDefenderStatus");
const duelAttackerNote = document.getElementById("duelAttackerNote");
const duelDefenderNote = document.getElementById("duelDefenderNote");
const duelAttackTimer = document.getElementById("duelAttackTimer");
const duelDefenderState = document.getElementById("duelDefenderState");
const attackerPanel = document.querySelector(".fighter-panel--attacker");
const defenderPanel = document.querySelector(".fighter-panel--defender");
const duelAttackerResult = document.getElementById("duelAttackerResult");
const duelDefenderResult = document.getElementById("duelDefenderResult");

const APP_DESIGN_WIDTH = 1920;
const APP_DESIGN_HEIGHT = 1015;
let currentAppScale = 1;
let currentAppScaleY = 1;

const DIRECT_API_URL = "https://www.perrisushi.com/shop-api";
const perriDuelosWebState = {
  sessionToken: "",
  nick: "",
  targetToken: "",
  defenderInventory: null
};

function getActiveDuelStorageKey() {
  return `perriduelos-active-${String(perriDuelosWebState.nick || "").trim().toLocaleLowerCase("es")}`;
}

function saveActiveDuel() {
  if (!perriDuelosWebState.nick || !perriDuelosWebState.targetToken) return;
  try {
    window.localStorage.setItem(getActiveDuelStorageKey(), JSON.stringify({
      targetToken: perriDuelosWebState.targetToken,
      defenderNick: duelDefenderName?.textContent || "",
      defenderInventory: perriDuelosWebState.defenderInventory || {},
      deadline: localDuelState.deadline
    }));
  } catch (error) {}
}

function readActiveDuel() {
  if (!perriDuelosWebState.nick) return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(getActiveDuelStorageKey()) || "null");
    return value && typeof value === "object" && value.targetToken ? value : null;
  } catch (error) {
    return null;
  }
}

function clearActiveDuel() {
  if (!perriDuelosWebState.nick) return;
  try { window.localStorage.removeItem(getActiveDuelStorageKey()); } catch (error) {}
}

function resolvePerriDuelosApiUrl() {
  return window.location.protocol === "file:" ? DIRECT_API_URL : "/shop-api";
}

async function callPerriDuelosApi(action, payload = {}) {
  const response = await fetch(resolvePerriDuelosApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok && !data) throw new Error(`http_${response.status}`);
  return data || { ok: false, error: `http_${response.status}` };
}

function notifyPerriDuelosInventoryUpdated(inventory) {
  if (window.parent === window) return;
  window.parent.postMessage({ type: "perriduelos-inventory-updated", inventory }, window.location.origin);
}

async function refreshRemoteEquipmentInventory() {
  if (!perriDuelosWebState.sessionToken) return;
  try {
    const result = await callPerriDuelosApi("publicShopRefresh", {
      sessionToken: perriDuelosWebState.sessionToken
    });
    if (!result?.ok || !result.inventory || typeof result.inventory !== "object") return;
    equipmentState.inventory = { ...result.inventory };
    renderEquipmentSystem();
  } catch (error) {
    // Se conserva el ultimo inventario recibido si la sincronizacion no esta disponible.
  }
}

const arenaBackgrounds = {
  duel: "./fondo-perriduelos.png?v=20260905-9",
  equipment: "./fondo-perriduelo-tienda.png"
};

const localDuelAttacker = "Perrisushi";
const localDuelDefenders = [
  "Croqueta",
  "Gambita",
  "Pelusa",
  "Mochi",
  "Nori",
  "Wasabi",
  "Amparo",
  "Kira",
  "Miso",
  "Sushito"
];

const localDefenderEquipment = {
  pc: 5000,
  espada: 1,
  escudo: 1,
  cascoSushi: 1,
  guantesSushi: 1,
  pecheraSushi: 1,
  pantalonesSushi: 1,
  botasSushi: 1
};

const localDuelDefenderInventories = Object.fromEntries(
  localDuelDefenders.map((defender) => [defender, { ...localDefenderEquipment }])
);

const localDuelCombatRules = {
  espadaLv1: { "": .6, escudo: .4, escudoMadera: .15, escudoMetal: 0, escudoLegendario: 0 },
  espadaLv2: { "": .65, escudo: .55, escudoMadera: .35, escudoMetal: .1, escudoLegendario: 0 },
  espadaLv3: { "": .7, escudo: .65, escudoMadera: .45, escudoMetal: .35, escudoLegendario: 0 },
  espadaLegendaria: { "": .8, escudo: .8, escudoMadera: .75, escudoMetal: .6, escudoLegendario: .3 }
};

const localDuelRewardRules = {
  attackerWinPc: 400,
  attackerLossPc: 200,
  minigameChestsOnWin: 1
};

const localDuelState = {
  deadline: 0,
  busy: false,
  roundComplete: false,
  autoResetPending: false,
  resultResetTimer: 0
};

function chooseLocalDefender(excludedDefender = "") {
  const candidates = localDuelDefenders.filter((defender) => defender !== excludedDefender);
  return candidates[Math.floor(Math.random() * candidates.length)] || localDuelDefenders[0];
}

function saveLockedLocalDefender(defender) {
  try {
    window.sessionStorage.setItem("perriduelos-local-defender", defender);
  } catch (error) {
    // El rival continúa bloqueado en memoria si el navegador impide guardar la sesión.
  }
}

function getLockedLocalDefender() {
  const storageKey = "perriduelos-local-defender";
  try {
    const savedDefender = window.sessionStorage.getItem(storageKey);
    if (localDuelDefenders.includes(savedDefender)) return savedDefender;
  } catch (error) {
    // Algunos navegadores bloquean sessionStorage al abrir archivos locales.
  }

  const selectedDefender = chooseLocalDefender();
  saveLockedLocalDefender(selectedDefender);
  return selectedDefender;
}

function loadLocalDuelUsers() {
  if (duelAttackerName) duelAttackerName.textContent = "Cargando usuario...";
  if (duelDefenderName) duelDefenderName.textContent = "Esperando rival...";
  localDuelState.deadline = 0;
  renderLocalDuelEquipment();
  if (duelAttackTimer) duelAttackTimer.textContent = "30:00 PARA ATACAR";
}

const equipmentGearItems = [
  { key: "shieldChain", name: "Escudo", image: "./assets/escudo-madera.png", area: "shield" },
  { key: "swordChain", name: "Espada", image: "./assets/espada.png", area: "sword" },
  { key: "cascoSushi", name: "Casco de Sushi", image: "./assets/casco-sushi.png", area: "helmet" },
  { key: "guantesSushi", name: "Guantes de Sushi", image: "./assets/guantes-sushi.png", area: "gloves" },
  { key: "pecheraSushi", name: "Pechera de Sushi", image: "./assets/pechera-sushi.png", area: "chest" },
  { key: "botasSushi", name: "Botas de Sushi", image: "./assets/botas-sushi.png", area: "boots" },
  { key: "pantalonesSushi", name: "Pantalones de Sushi", image: "./assets/pantalones-sushi.png", area: "pants" }
];

const equipmentUpgradeRules = {
  swordChain: [
    { currentKey: "espada", currentLabel: "Espada Lv 1", nextKey: "espadaLv2", nextLabel: "Espada Lv 2", image: "./assets/espada.png", cost: 2000, baseChance: 35, perricitaBonus: 50 },
    { currentKey: "espadaLv2", currentLabel: "Espada Lv 2", nextKey: "espadaLv3", nextLabel: "Espada Lv 3", image: "./assets/espada.png", cost: 3000, baseChance: 20, perricitaBonus: 15 },
    { currentKey: "espadaLv3", currentLabel: "Espada Lv 3", nextKey: "espadaLegendaria", nextLabel: "Espada Legendaria", image: "./assets/espada.png", cost: 5000, baseChance: 10, perricitaBonus: 5 },
    { currentKey: "espadaLegendaria", currentLabel: "Espada Legendaria", nextLabel: "Nivel máximo", image: "./assets/espada-legendaria.png", isMax: true }
  ],
  shieldChain: [
    { currentKey: "escudo", currentLabel: "Escudo Lv 1", nextKey: "escudoMadera", nextLabel: "Escudo Lv 2", image: "./assets/escudo-madera.png", cost: 2000, baseChance: 35, perricitaBonus: 50 },
    { currentKey: "escudoMadera", currentLabel: "Escudo Lv 2", nextKey: "escudoMetal", nextLabel: "Escudo Lv 3", image: "./assets/escudo-madera.png", cost: 3000, baseChance: 20, perricitaBonus: 15 },
    { currentKey: "escudoMetal", currentLabel: "Escudo Lv 3", nextKey: "escudoLegendario", nextLabel: "Escudo Legendario", image: "./assets/escudo-metal.png", cost: 5000, baseChance: 10, perricitaBonus: 5 },
    { currentKey: "escudoLegendario", currentLabel: "Escudo Legendario", nextLabel: "Nivel máximo", image: "./assets/escudo-legendario.png", isMax: true }
  ]
};

const equipmentState = {
  inventory: null,
  selectedKey: "",
  upgradeHandler: runRemoteEquipmentUpgrade,
  upgrading: false
};

async function runRemoteEquipmentUpgrade({ gearType, usePerricita }) {
  const result = await callPerriDuelosApi("publicShopUpgradeEquipment", {
    sessionToken: perriDuelosWebState.sessionToken,
    gearType,
    usePerricita
  });
  if (result?.inventory) {
    equipmentState.inventory = { ...result.inventory };
    notifyPerriDuelosInventoryUpdated(equipmentState.inventory);
  }
  if (!result?.ok) throw new Error(result?.error || "equipment_upgrade_failed");
  return result;
}

function equipmentAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function runLocalEquipmentUpgrade({ gearType, usePerricita }) {
  const chainKey = gearType === "espada" ? "swordChain" : gearType === "escudo" ? "shieldChain" : "";
  const stages = equipmentUpgradeRules[chainKey] || [];
  const inventory = { ...(equipmentState.inventory || {}) };
  const currentStage = [...stages].reverse().find((stage) => equipmentAmount(inventory[stage.currentKey]) > 0);

  if (!currentStage || currentStage.isMax) {
    throw new Error("invalid_upgrade_stage");
  }
  if (equipmentAmount(inventory.polvoGema) < currentStage.cost) {
    throw new Error("not_enough_gems");
  }
  if (usePerricita && equipmentAmount(inventory.perricita) < 1) {
    throw new Error("not_enough_perricita");
  }

  const successChance = Math.min(100, currentStage.baseChance + (usePerricita ? currentStage.perricitaBonus : 0));
  const success = Math.random() * 100 < successChance;
  inventory.polvoGema = equipmentAmount(inventory.polvoGema) - currentStage.cost;

  if (usePerricita) {
    inventory.perricita = equipmentAmount(inventory.perricita) - 1;
  }
  if (success) {
    inventory[currentStage.currentKey] = equipmentAmount(inventory[currentStage.currentKey]) - 1;
    inventory[currentStage.nextKey] = equipmentAmount(inventory[currentStage.nextKey]) + 1;
  }

  return {
    ok: true,
    success,
    inventory,
    currentTier: currentStage.currentLabel,
    nextTier: currentStage.nextLabel,
    successChance,
    usedPerricita: Boolean(usePerricita)
  };
}

function getEquipmentUpgradeState(chainKey, allowPreview = false) {
  return getUpgradeStateForInventory(chainKey, equipmentState.inventory, allowPreview);
}

function getUpgradeStateForInventory(chainKey, inventory, allowPreview = false) {
  const stages = equipmentUpgradeRules[chainKey] || [];
  if (!inventory) return allowPreview ? stages[0] || null : null;

  for (let index = stages.length - 1; index >= 0; index -= 1) {
    if (equipmentAmount(inventory[stages[index].currentKey]) > 0) {
      return stages[index];
    }
  }
  return null;
}

function getSuitPieceCount(inventory) {
  return ["cascoSushi", "guantesSushi", "pecheraSushi", "pantalonesSushi", "botasSushi"]
    .reduce((total, key) => total + (equipmentAmount(inventory?.[key]) > 0 ? 1 : 0), 0);
}

function hasFullLocalSuit(inventory) {
  return getSuitPieceCount(inventory) === 5;
}

function getLocalAttackSuitBonus(inventory) {
  return (equipmentAmount(inventory?.guantesSushi) > 0 ? .05 : 0) + (hasFullLocalSuit(inventory) ? .03 : 0);
}

function getLocalDefenseSuitBonus(inventory) {
  const protectivePieces = ["cascoSushi", "pecheraSushi", "pantalonesSushi", "botasSushi"]
    .reduce((total, key) => total + (equipmentAmount(inventory?.[key]) > 0 ? .02 : 0), 0);
  return protectivePieces + (hasFullLocalSuit(inventory) ? .04 : 0);
}

function getLocalDuelChance(attackerInventory, defenderInventory, weaponState, shieldState) {
  const weaponKey = weaponState?.currentKey === "espada" ? "espadaLv1" : weaponState?.currentKey || "";
  const shieldKey = shieldState?.currentKey || "";
  const baseChance = localDuelCombatRules[weaponKey]?.[shieldKey] ?? 0;
  const ignoresSuit = weaponKey === "espadaLegendaria" || shieldKey === "escudoLegendario";
  const attackBonus = ignoresSuit ? 0 : getLocalAttackSuitBonus(attackerInventory);
  const defenseBonus = ignoresSuit ? 0 : getLocalDefenseSuitBonus(defenderInventory);
  return Math.max(0, Math.min(1, baseChance + attackBonus - defenseBonus));
}

function getDisplayedEquipmentLevel(state) {
  if (!state) return "Nv. —";
  if (state.isMax) return "Nv. MAX";
  return `Nv. ${state.currentLabel.match(/Lv (\d)/)?.[1] || "—"}`;
}

function renderLocalDuelEquipment() {
  const attackerInventory = equipmentState.inventory || {};
  const attackerWeapon = getUpgradeStateForInventory("swordChain", attackerInventory);
  const defenderInventory = perriDuelosWebState.defenderInventory || {};
  const defenderShield = getUpgradeStateForInventory("shieldChain", defenderInventory);
  const attackerChance = getLocalDuelChance(attackerInventory, defenderInventory, attackerWeapon, defenderShield);

  if (duelAttackerWeaponName) duelAttackerWeaponName.textContent = attackerWeapon?.currentLabel || "Sin equipar";
  if (duelAttackerWeaponLevel) duelAttackerWeaponLevel.textContent = getDisplayedEquipmentLevel(attackerWeapon);
  if (duelAttackerSuitCount) duelAttackerSuitCount.textContent = `${getSuitPieceCount(attackerInventory)}/5`;
  if (duelAttackerPower) duelAttackerPower.textContent = `${Math.round(attackerChance * 100)}%`;
  if (duelAttackerTicketCount) duelAttackerTicketCount.textContent = equipmentAmount(attackerInventory.duelo).toLocaleString("es-ES");
  if (duelAttackButton) duelAttackButton.disabled = equipmentAmount(attackerInventory.duelo) < 1
    || localDuelState.busy
    || localDuelState.autoResetPending
    || !perriDuelosWebState.sessionToken
    || (!localDuelState.roundComplete && !perriDuelosWebState.targetToken);
  if (duelDefenderShieldName) duelDefenderShieldName.textContent = defenderShield?.currentLabel || "Sin escudo";
  if (duelDefenderShieldLevel) duelDefenderShieldLevel.textContent = getDisplayedEquipmentLevel(defenderShield);
  if (duelDefenderSuitCount) duelDefenderSuitCount.textContent = `${getSuitPieceCount(defenderInventory)}/5`;
  if (duelDefenderDefense) duelDefenderDefense.textContent = `${Math.round((1 - attackerChance) * 100)}%`;
  if (duelDefenderPcAtStake) {
    duelDefenderPcAtStake.textContent = `${Math.min(equipmentAmount(defenderInventory.pc), localDuelRewardRules.attackerWinPc)} PC`;
  }
}

function setLocalDuelOutcomeClass(element, outcomeClass = "") {
  if (!element) return;
  element.classList.remove("is-duel-success", "is-duel-danger", "is-duel-active");
  if (outcomeClass) element.classList.add(outcomeClass);
}

function hideLocalDuelResults() {
  [duelAttackerResult, duelDefenderResult].forEach((result) => {
    if (!result) return;
    result.hidden = true;
    result.textContent = "";
    result.classList.remove("is-win", "is-lose");
  });
}

function setLocalDuelResult(element, word, pcText, didWin) {
  if (!element) return;
  const pcAmount = document.createElement("span");
  const resultWord = document.createElement("span");
  pcAmount.className = "duel-result__pc";
  resultWord.className = "duel-result__word";
  pcAmount.textContent = pcText;
  resultWord.textContent = word;
  element.replaceChildren(pcAmount, resultWord);
  element.classList.toggle("is-win", didWin);
  element.classList.toggle("is-lose", !didWin);
  element.hidden = false;
}

function showLocalDuelResults(attackerWon, transferredPc) {
  if (duelAttackerResult) {
    setLocalDuelResult(
      duelAttackerResult,
      attackerWon ? "WIN" : "LOSE",
      `${attackerWon ? "+" : "-"}${transferredPc} PC`,
      attackerWon
    );
  }
  if (duelDefenderResult) {
    setLocalDuelResult(
      duelDefenderResult,
      attackerWon ? "LOSE" : "WIN",
      `${attackerWon ? "-" : "+"}${transferredPc} PC`,
      !attackerWon
    );
  }
}

function getCurrentLocalDuelContext() {
  const attackerInventory = equipmentState.inventory || {};
  const defenderInventory = perriDuelosWebState.defenderInventory || {};
  const attackerWeapon = getUpgradeStateForInventory("swordChain", attackerInventory);
  const defenderShield = getUpgradeStateForInventory("shieldChain", defenderInventory);
  return {
    attackerInventory,
    defenderInventory,
    chance: getLocalDuelChance(attackerInventory, defenderInventory, attackerWeapon, defenderShield)
  };
}

async function finishExpiredLocalDuel() {
  if (localDuelState.roundComplete || localDuelState.busy) return;
  const expiredTargetToken = perriDuelosWebState.targetToken;
  perriDuelosWebState.targetToken = "";
  clearActiveDuel();
  localDuelState.roundComplete = true;
  hideLocalDuelResults();
  duelAttackerStatus.textContent = "CANCELADO";
  duelDefenderStatus.textContent = "LIBERADO";
  duelAttackerNote.textContent = "El tiempo terminó y se perdió 1 ticket.";
  duelDefenderNote.textContent = "El duelo ha caducado sin ataque.";
  duelAttackTimer.textContent = "00:00 PARA ATACAR";
  duelDefenderState.textContent = "DUELO CANCELADO";
  duelAttackButton.textContent = "Atacar";
  setLocalDuelOutcomeClass(duelAttackerStatus, "is-duel-danger");
  setLocalDuelOutcomeClass(duelDefenderStatus);
  setLocalDuelOutcomeClass(attackerPanel, "is-duel-danger");
  setLocalDuelOutcomeClass(defenderPanel);
  renderLocalDuelEquipment();
  if (!expiredTargetToken || !perriDuelosWebState.sessionToken) return;
  try {
    const result = await callPerriDuelosApi("publicShopExpireDuelTarget", {
      sessionToken: perriDuelosWebState.sessionToken,
      targetToken: expiredTargetToken
    });
    if (result?.attackerInventory) {
      equipmentState.inventory = { ...result.attackerInventory };
      notifyPerriDuelosInventoryUpdated(equipmentState.inventory);
      renderEquipmentSystem();
    }
  } catch (error) {
    // El servidor volverá a validar la caducidad cuando se solicite el siguiente rival.
  }
}

function updateLocalDuelTimer() {
  if (!duelAttackTimer || localDuelState.roundComplete || localDuelState.busy || !localDuelState.deadline) return;
  const remainingMs = Math.max(0, localDuelState.deadline - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  duelAttackTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} PARA ATACAR`;
  if (remainingMs <= 0) finishExpiredLocalDuel();
}

async function startNextLocalDuel() {
  window.clearTimeout(localDuelState.resultResetTimer);
  localDuelState.resultResetTimer = 0;
  localDuelState.autoResetPending = false;
  hideLocalDuelResults();
  if (!perriDuelosWebState.sessionToken || localDuelState.busy) return;
  localDuelState.busy = true;
  localDuelState.roundComplete = false;
  perriDuelosWebState.targetToken = "";
  perriDuelosWebState.defenderInventory = null;
  duelDefenderName.textContent = "Seleccionando rival...";
  duelAttackerStatus.textContent = "CARGANDO";
  duelDefenderStatus.textContent = "SORTEANDO";
  renderLocalDuelEquipment();
  try {
    const result = await callPerriDuelosApi("publicShopGetDuelTarget", {
      sessionToken: perriDuelosWebState.sessionToken
    });
    if (!result?.ok) throw new Error(result?.error || "duel_target_failed");
    equipmentState.inventory = { ...(result.attackerInventory || equipmentState.inventory || {}) };
    perriDuelosWebState.defenderInventory = { ...(result.defenderInventory || {}) };
    perriDuelosWebState.targetToken = String(result.targetToken || "");
    perriDuelosWebState.nick = String(result.attackerNick || perriDuelosWebState.nick || "");
    duelAttackerName.textContent = perriDuelosWebState.nick || "Tu usuario";
    duelDefenderName.textContent = String(result.defenderNick || "Rival");
    localDuelState.deadline = Date.now() + (30 * 60 * 1000);
    saveActiveDuel();
    duelAttackerStatus.textContent = "LISTO";
    duelDefenderStatus.textContent = "ASIGNADO";
    duelAttackerNote.textContent = "";
    duelDefenderNote.textContent = "";
    duelDefenderState.textContent = "";
    duelAttackButton.textContent = "Atacar";
    notifyPerriDuelosInventoryUpdated(equipmentState.inventory);
    updateLocalDuelTimer();
  } catch (error) {
    localDuelState.roundComplete = true;
    duelAttackerStatus.textContent = "SIN DUELO";
    duelDefenderStatus.textContent = "NO DISPONIBLE";
    duelDefenderName.textContent = error?.message === "no_duel_opponents" ? "No hay rivales" : "No se pudo cargar";
  } finally {
    localDuelState.busy = false;
  }
  [duelAttackerStatus, duelDefenderStatus, attackerPanel, defenderPanel].forEach((element) => setLocalDuelOutcomeClass(element));
  renderEquipmentSystem();
}

function scheduleNextLocalDuel() {
  window.clearTimeout(localDuelState.resultResetTimer);
  localDuelState.autoResetPending = true;
  renderLocalDuelEquipment();
  localDuelState.resultResetTimer = window.setTimeout(() => {
    localDuelState.resultResetTimer = 0;
    hideLocalDuelResults();
    if (equipmentAmount(equipmentState.inventory?.duelo) > 0) {
      startNextLocalDuel();
      return;
    }
    localDuelState.autoResetPending = false;
    renderLocalDuelEquipment();
  }, 5000);
}

async function performLocalDuelAttack() {
  if (localDuelState.roundComplete) {
    startNextLocalDuel();
    return;
  }
  if (localDuelState.busy || equipmentAmount(equipmentState.inventory?.duelo) < 1 || !perriDuelosWebState.targetToken) return;

  hideLocalDuelResults();
  localDuelState.busy = true;
  duelAttackButton.disabled = true;
  duelAttackerStatus.textContent = "ATACANDO";
  duelDefenderStatus.textContent = "DEFENDIENDO";
  duelAttackerNote.textContent = "Lanzando ataque...";
  duelDefenderNote.textContent = "Intentando bloquear el golpe...";
  setLocalDuelOutcomeClass(duelAttackerStatus, "is-duel-active");
  setLocalDuelOutcomeClass(duelDefenderStatus, "is-duel-active");
  setLocalDuelOutcomeClass(attackerPanel, "is-duel-active");
  setLocalDuelOutcomeClass(defenderPanel, "is-duel-active");
  const targetToken = perriDuelosWebState.targetToken;
  try {
    const result = await callPerriDuelosApi("publicShopPerformAttack", {
      sessionToken: perriDuelosWebState.sessionToken,
      targetToken
    });
    if (!result?.ok) throw new Error(result?.error || "duel_attack_failed");
    const didHit = String(result.outcome || "") === "Impacto";
    const transferredPc = Math.max(0, Number(result.transferredPc || 0));
    equipmentState.inventory = { ...(result.attackerInventory || equipmentState.inventory || {}) };
    perriDuelosWebState.defenderInventory = { ...(result.defenderInventory || perriDuelosWebState.defenderInventory || {}) };
    perriDuelosWebState.targetToken = "";
    clearActiveDuel();
    localDuelState.busy = false;
    localDuelState.roundComplete = true;

    duelAttackerStatus.textContent = didHit ? "VICTORIA" : "BLOQUEADO";
    duelDefenderStatus.textContent = didHit ? "DERROTADO" : "DEFENSA";
    duelAttackerNote.textContent = didHit
      ? `Robas ${transferredPc} PC y ganas 1 Perricofre de minijuego.`
      : `Pierdes ${transferredPc} PC.`;
    duelDefenderNote.textContent = didHit
      ? `Pierde ${transferredPc} PC.`
      : `Gana ${transferredPc} PC por bloquear el ataque.`;
    duelDefenderState.textContent = didHit ? "DERROTA" : "BLOQUEO";
    showLocalDuelResults(didHit, transferredPc);
    duelAttackButton.textContent = "Atacar";
    setLocalDuelOutcomeClass(duelAttackerStatus, didHit ? "is-duel-success" : "is-duel-danger");
    setLocalDuelOutcomeClass(duelDefenderStatus, didHit ? "is-duel-danger" : "is-duel-success");
    setLocalDuelOutcomeClass(attackerPanel, didHit ? "is-duel-success" : "is-duel-danger");
    setLocalDuelOutcomeClass(defenderPanel, didHit ? "is-duel-danger" : "is-duel-success");
    notifyPerriDuelosInventoryUpdated(equipmentState.inventory);
    renderEquipmentSystem();
    scheduleNextLocalDuel();
  } catch (error) {
    localDuelState.busy = false;
    localDuelState.roundComplete = true;
    perriDuelosWebState.targetToken = "";
    clearActiveDuel();
    duelAttackerStatus.textContent = "ERROR";
    duelDefenderStatus.textContent = "CANCELADO";
    renderLocalDuelEquipment();
  }
}

function getEquipmentOwnedCount(itemKey) {
  const inventory = equipmentState.inventory;
  if (!inventory) return null;

  if (itemKey === "swordChain") {
    return ["espada", "espadaLv2", "espadaLv3", "espadaLegendaria"]
      .reduce((total, key) => total + equipmentAmount(inventory[key]), 0);
  }
  if (itemKey === "shieldChain") {
    return ["escudo", "escudoMadera", "escudoMetal", "escudoLegendario"]
      .reduce((total, key) => total + equipmentAmount(inventory[key]), 0);
  }
  return equipmentAmount(inventory[itemKey]);
}

function getEquipmentTileImage(item) {
  if (!equipmentUpgradeRules[item.key]) return item.image;
  return getEquipmentUpgradeState(item.key, true)?.image || item.image;
}

function renderEquipmentUpgradePanel() {
  const isUpgradeable = Boolean(equipmentUpgradeRules[equipmentState.selectedKey]);
  const state = isUpgradeable ? getEquipmentUpgradeState(equipmentState.selectedKey, true) : null;
  const ownedCount = isUpgradeable ? getEquipmentOwnedCount(equipmentState.selectedKey) : 0;
  const hasOwnedItem = ownedCount !== null && ownedCount > 0;

  equipmentUpgradeDetails.hidden = !state;

  if (!state) {
    if (equipmentState.selectedKey) {
      equipmentSystemMessage.textContent = "Las piezas de traje no se pueden mejorar.";
    }
    return;
  }

  const hasPerricita = equipmentState.inventory
    ? equipmentAmount(equipmentState.inventory.perricita) > 0
    : false;
  equipmentUsePerricita.disabled = Boolean(state.isMax) || !hasPerricita;
  if (equipmentUsePerricita.disabled) equipmentUsePerricita.checked = false;

  const effectiveChance = state.isMax
    ? "—"
    : `${Math.min(100, state.baseChance + (equipmentUsePerricita.checked ? state.perricitaBonus : 0))}%`;

  equipmentUpgradeImage.src = state.image;
  equipmentUpgradeImage.alt = state.currentLabel;
  equipmentUpgradeType.textContent = equipmentState.selectedKey === "swordChain" ? "ARMA" : "DEFENSA";
  equipmentUpgradeName.textContent = state.currentLabel;
  equipmentUpgradeNext.textContent = state.isMax ? "Has alcanzado el nivel máximo" : `Siguiente: ${state.nextLabel}`;
  equipmentUpgradeCost.textContent = state.isMax ? "MAX" : `${state.cost} G`;
  equipmentUpgradeChance.textContent = effectiveChance;
  equipmentPerricitaBonus.textContent = state.isMax ? "MAX" : `+${state.perricitaBonus}%`;
  equipmentUpgradeButton.disabled = state.isMax
    || !hasOwnedItem
    || equipmentState.upgrading
    || equipmentAmount(equipmentState.inventory?.polvoGema) < equipmentAmount(state.cost)
    || (equipmentUsePerricita.checked && equipmentAmount(equipmentState.inventory?.perricita) < 1)
    || typeof equipmentState.upgradeHandler !== "function";

  if (!equipmentState.inventory) {
    equipmentSystemMessage.textContent = "Vista previa: falta conectar el inventario del usuario.";
  } else if (!hasOwnedItem) {
    equipmentSystemMessage.textContent = `No tienes ${equipmentState.selectedKey === "swordChain" ? "una espada" : "un escudo"} para mejorar.`;
  }
}

function renderEquipmentSystem() {
  if (!equipmentGearGrid) return;

  const inventory = equipmentState.inventory;
  equipmentGemCount.textContent = inventory ? equipmentAmount(inventory.polvoGema).toLocaleString("es-ES") : "—";
  equipmentPerricitaCount.textContent = inventory ? equipmentAmount(inventory.perricita).toLocaleString("es-ES") : "—";

  equipmentGearGrid.innerHTML = equipmentGearItems.map((item) => {
    const ownedCount = getEquipmentOwnedCount(item.key);
    const upgradeState = equipmentUpgradeRules[item.key] ? getEquipmentUpgradeState(item.key, true) : null;
    const classes = [
      "equipment-gear-tile",
      ownedCount === 0 ? "is-missing" : "",
      equipmentState.selectedKey === item.key ? "is-selected" : ""
    ].filter(Boolean).join(" ");
    const level = upgradeState
      ? `<span class="equipment-gear-tile__level">${upgradeState.isMax ? "MAX" : upgradeState.currentLabel.match(/Lv \d/)?.[0] || "Lv —"}</span>`
      : "";

    return `<button class="${classes}" type="button" data-equipment-gear="${item.key}" title="${item.name}" aria-label="${item.name}">
      ${level}
      <img src="${getEquipmentTileImage(item)}" alt="${item.name}">
      <span class="equipment-gear-tile__count">${ownedCount === null ? "—" : ownedCount}</span>
    </button>`;
  }).join("");

  renderEquipmentUpgradePanel();
  renderLocalDuelEquipment();
}

function launchEquipmentSuccessParticles() {
  if (!equipmentUpgradeVisual || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  equipmentUpgradeVisual.querySelector(".equipment-upgrade-particles")?.remove();
  const particleLayer = document.createElement("span");
  particleLayer.className = "equipment-upgrade-particles";
  particleLayer.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 30; index += 1) {
    const angle = (Math.PI * 2 * index) / 30 + (Math.random() - .5) * .25;
    const distance = 58 + Math.random() * 72;
    const particle = document.createElement("i");
    particle.className = "equipment-upgrade-particle";
    particle.style.setProperty("--particle-x", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--particle-y", `${Math.sin(angle) * distance}px`);
    particle.style.setProperty("--particle-size", `${3 + Math.random() * 6}px`);
    particle.style.setProperty("--particle-delay", `${Math.random() * 120}ms`);
    particle.style.setProperty("--particle-rotation", `${180 + Math.random() * 420}deg`);
    particleLayer.append(particle);
  }

  equipmentUpgradeVisual.append(particleLayer);
  window.setTimeout(() => particleLayer.remove(), 1250);
}

function resizePerriDuelosApp() {
  if (!duelApp) return;
  const viewportWidth = window.visualViewport?.width || window.innerWidth;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const isMobileLandscape = window.matchMedia("(pointer: coarse)").matches
    && viewportWidth > viewportHeight;
  const widthScale = viewportWidth / (isMobileLandscape ? 1747 : APP_DESIGN_WIDTH);
  const heightScale = viewportHeight / (isMobileLandscape ? 974 : APP_DESIGN_HEIGHT);
  const uniformScale = Math.max(.1, Math.min(widthScale, heightScale));
  const horizontalScale = Math.max(.1, isMobileLandscape ? widthScale : uniformScale);
  const verticalScale = Math.max(.1, isMobileLandscape ? heightScale : uniformScale);
  currentAppScale = horizontalScale;
  currentAppScaleY = verticalScale;
  duelApp.classList.toggle("is-mobile-cover", isMobileLandscape);
  duelApp.style.setProperty("--app-scale-x", String(horizontalScale));
  duelApp.style.setProperty("--app-scale-y", String(verticalScale));
}

function alignEquipmentTab() {
  if (!duelTab || !equipmentTab) return;

  equipmentTab.style.left = "0px";
  const duelBounds = duelTab.getBoundingClientRect();
  const equipmentBounds = equipmentTab.getBoundingClientRect();
  equipmentTab.style.left = `${(duelBounds.right - equipmentBounds.left) / currentAppScale}px`;
  if (duelExitButton) {
    duelExitButton.style.width = `${duelBounds.width / currentAppScale}px`;
    duelExitButton.style.height = `${duelBounds.height / currentAppScaleY}px`;
  }
}

function handlePerriDuelosResize() {
  resizePerriDuelosApp();
  requestAnimationFrame(alignEquipmentTab);
}

function selectDuelTab(tabName) {
  const isEquipment = tabName === "equipment";

  duelTabs.forEach((tab) => {
    const isActive = tab.dataset.duelTab === tabName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });

  duelPanels.forEach((panel) => {
    panel.hidden = panel.dataset.duelPanel !== tabName;
  });

  if (duelArena) {
    duelArena.classList.toggle("is-equipment", isEquipment);
  }

  if (duelFrame) {
    duelFrame.src = arenaBackgrounds[tabName] || arenaBackgrounds.duel;
  }

  requestAnimationFrame(() => {
    resizePerriDuelosApp();
    alignEquipmentTab();
  });
}

duelTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectDuelTab(tab.dataset.duelTab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = duelTabs[(index + direction + duelTabs.length) % duelTabs.length];
    selectDuelTab(nextTab.dataset.duelTab);
    nextTab.focus();
  });
});

duelExitButton?.addEventListener("click", () => {
  if (window.parent !== window) {
    window.parent.postMessage({ type: "perriduelos-exit" }, window.location.origin);
    return;
  }
  window.history.back();
});

equipmentSlots.forEach((slot) => {
  slot.addEventListener("click", () => {
    const equipmentPane = slot.closest(".equipment-pane");
    if (!equipmentPane) return;

    equipmentPane.querySelectorAll(".equipment-slot").forEach((candidate) => {
      candidate.classList.toggle("is-selected", candidate === slot);
    });

    const selection = equipmentPane.querySelector(".equipment-selection");
    if (selection) {
      selection.textContent = `${slot.dataset.slotName}: sin equipar`;
    }
  });
});

equipmentGearGrid?.addEventListener("click", (event) => {
  const tile = event.target.closest("[data-equipment-gear]");
  if (!tile) return;

  equipmentState.selectedKey = tile.dataset.equipmentGear || "";
  equipmentUsePerricita.checked = false;
  renderEquipmentSystem();
});

equipmentUsePerricita?.addEventListener("change", renderEquipmentUpgradePanel);
duelAttackButton?.addEventListener("click", performLocalDuelAttack);

function openEquipmentHelp() {
  equipmentHelpModal.hidden = false;
  equipmentHelpClose?.focus();
}

function closeEquipmentHelp() {
  equipmentHelpModal.hidden = true;
  equipmentHelpButton?.focus();
}

equipmentHelpButton?.addEventListener("click", openEquipmentHelp);
document.querySelectorAll("[data-close-equipment-help]").forEach((button) => {
  button.addEventListener("click", closeEquipmentHelp);
});

function openDuelHelp() {
  duelHelpModal.hidden = false;
  duelHelpClose?.focus();
}

function closeDuelHelp() {
  duelHelpModal.hidden = true;
  duelHelpButton?.focus();
}

duelHelpButton?.addEventListener("click", openDuelHelp);
document.querySelectorAll("[data-close-duel-help]").forEach((button) => {
  button.addEventListener("click", closeDuelHelp);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && equipmentHelpModal && !equipmentHelpModal.hidden) {
    closeEquipmentHelp();
  }
  if (event.key === "Escape" && duelHelpModal && !duelHelpModal.hidden) {
    closeDuelHelp();
  }
});

equipmentUpgradeButton?.addEventListener("click", async () => {
  const state = getEquipmentUpgradeState(equipmentState.selectedKey);
  if (!state || state.isMax || typeof equipmentState.upgradeHandler !== "function" || equipmentState.upgrading) return;

  const gearType = equipmentState.selectedKey === "swordChain" ? "espada" : "escudo";
  equipmentState.upgrading = true;
  equipmentSystemMessage.textContent = "Intentando mejorar el objeto...";
  renderEquipmentUpgradePanel();

  try {
    const response = await equipmentState.upgradeHandler({
      gearType,
      usePerricita: equipmentUsePerricita.checked
    });
    const result = response?.data || response || {};

    if (result.inventory) equipmentState.inventory = { ...result.inventory };
    equipmentUpgradeVisual.classList.remove("is-success", "is-fail");
    void equipmentUpgradeVisual.offsetWidth;
    equipmentUpgradeVisual.classList.add(result.success ? "is-success" : "is-fail");
    if (result.success) launchEquipmentSuccessParticles();
    window.setTimeout(() => equipmentUpgradeVisual.classList.remove("is-success", "is-fail"), 900);
    equipmentSystemMessage.textContent = result.success
      ? `${result.currentTier || state.currentLabel} mejora a ${result.nextTier || state.nextLabel}.`
      : `La mejora de ${result.currentTier || state.currentLabel} ha fallado.`;
  } catch (error) {
    equipmentSystemMessage.textContent = "No se pudo completar la mejora.";
  } finally {
    equipmentState.upgrading = false;
    equipmentUsePerricita.checked = false;
    renderEquipmentSystem();
  }
});

window.PerriDuelosEquipment = {
  setInventory(inventory) {
    equipmentState.inventory = inventory && typeof inventory === "object" ? { ...inventory } : null;
    renderEquipmentSystem();
  },
  setUpgradeHandler(handler) {
    equipmentState.upgradeHandler = typeof handler === "function" ? handler : null;
    renderEquipmentUpgradePanel();
  },
  clear() {
    equipmentState.inventory = null;
    equipmentState.selectedKey = "";
    equipmentState.upgradeHandler = null;
    equipmentUsePerricita.checked = false;
    renderEquipmentSystem();
  }
};

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
  if (event.data.type === "perriduelos-close") {
    window.clearTimeout(localDuelState.resultResetTimer);
    localDuelState.resultResetTimer = 0;
    return;
  }
  if (event.data.type !== "perriduelos-session") return;

  const nextSessionToken = String(event.data.sessionToken || "");
  const sessionChanged = nextSessionToken && nextSessionToken !== perriDuelosWebState.sessionToken;
  perriDuelosWebState.sessionToken = nextSessionToken;
  perriDuelosWebState.nick = String(event.data.nick || perriDuelosWebState.nick || "");
  if (event.data.inventory && typeof event.data.inventory === "object") {
    equipmentState.inventory = { ...event.data.inventory };
  }
  equipmentState.upgradeHandler = runRemoteEquipmentUpgrade;
  if (duelAttackerName) duelAttackerName.textContent = perriDuelosWebState.nick || "Tu usuario";
  renderEquipmentSystem();
  refreshRemoteEquipmentInventory();
  if (sessionChanged) {
    const savedDuel = readActiveDuel();
    if (savedDuel) {
      perriDuelosWebState.targetToken = String(savedDuel.targetToken || "");
      perriDuelosWebState.defenderInventory = { ...(savedDuel.defenderInventory || {}) };
      localDuelState.deadline = Number(savedDuel.deadline || 0);
      localDuelState.roundComplete = false;
      if (duelDefenderName) duelDefenderName.textContent = String(savedDuel.defenderNick || "Rival asignado");
      duelAttackerStatus.textContent = "LISTO";
      duelDefenderStatus.textContent = "ASIGNADO";
      renderEquipmentSystem();
      if (localDuelState.deadline <= Date.now()) finishExpiredLocalDuel();
      else updateLocalDuelTimer();
      return;
    }
  }
  if (!perriDuelosWebState.targetToken
    && !localDuelState.roundComplete
    && !localDuelState.autoResetPending
    && !localDuelState.busy) {
    startNextLocalDuel();
  }
});

window.addEventListener("resize", handlePerriDuelosResize);
window.visualViewport?.addEventListener("resize", handlePerriDuelosResize);
window.setInterval(updateLocalDuelTimer, 1000);
resizePerriDuelosApp();
requestAnimationFrame(alignEquipmentTab);
renderEquipmentSystem();
loadLocalDuelUsers();
if (window.parent !== window) {
  window.parent.postMessage({ type: "perriduelos-ready" }, window.location.origin);
}
