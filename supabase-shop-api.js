const crypto = require("node:crypto");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SESSION_TTL_MS = Number(process.env.SHOP_SESSION_TTL_MS || 6 * 60 * 60 * 1000);
const PERRI_CHEST_LINK_BASE_URL = String(process.env.PERRI_CHEST_LINK_BASE_URL || "https://www.perrisushi.com").trim().replace(/\/+$/, "");
const ACCOUNT_ACTIVATION_LINK_BASE_URL = String(process.env.ACCOUNT_ACTIVATION_LINK_BASE_URL || "https://www.perrisushi.com").trim().replace(/\/+$/, "");
const DEFAULT_LOGO_ID = "logo-pelusa-1";
const DEFAULT_LOGO_ASSET_PATH = "./assets/logos-usuario/logo-pelusa-1.png";

const INVENTORY_KEYS = [
  "monedas",
  "llaves",
  "gemas",
  "polvoGema",
  "fragmentoKey",
  "perriCofres",
  "duelo",
  "perricita",
  "pc",
  "espada",
  "espadaLv2",
  "espadaLv3",
  "espadaLegendaria",
  "escudo",
  "escudoMadera",
  "escudoMetal",
  "escudoLegendario",
  "cuchillo",
  "collar",
  "randomKey",
  "cascoSushi",
  "guantesSushi",
  "pecheraSushi",
  "pantalonesSushi",
  "botasSushi"
];

const SHOP_ITEMS = {
  llaves: { label: "Llave", price: 5000, currencyKey: "polvoGema", currencyLabel: "PG" },
  espada: { label: "Espada", price: 1500, currencyKey: "pc", currencyLabel: "PC" },
  escudo: { label: "Escudo", price: 1500, currencyKey: "pc", currencyLabel: "PC" },
  cascoSushi: { label: "Casco de Sushi", price: 2000, currencyKey: "pc", currencyLabel: "PC" },
  guantesSushi: { label: "Guantes de Sushi", price: 3000, currencyKey: "pc", currencyLabel: "PC" },
  pecheraSushi: { label: "Pechera de Sushi", price: 2000, currencyKey: "pc", currencyLabel: "PC" },
  pantalonesSushi: { label: "Pantalones de Sushi", price: 2000, currencyKey: "pc", currencyLabel: "PC" },
  botasSushi: { label: "Botas de Sushi", price: 2000, currencyKey: "pc", currencyLabel: "PC" }
};

const PUBLIC_SHOP_ITEMS = [
  { key: "llaves", label: "Llave", price: 5000, category: "keys", currencyKey: "polvoGema", currencyLabel: "PG", effect: "Permite abrir un cofre." },
  { key: "escudo", label: "Escudo", price: 1500, category: "equipment", currencyKey: "pc", currencyLabel: "PC", effect: "Defensa base para el minijuego de ataque" },
  { key: "espada", label: "Espada", price: 1500, category: "equipment", currencyKey: "pc", currencyLabel: "PC", effect: "Arma base para el minijuego de ataque" },
  { key: "cascoSushi", label: "Casco de Sushi", price: 2000, category: "equipment", currencyKey: "pc", currencyLabel: "PC", effect: "+2% proteccion contra ataque" },
  { key: "guantesSushi", label: "Guantes de Sushi", price: 3000, category: "equipment", currencyKey: "pc", currencyLabel: "PC", effect: "+5% acierto de ataque" },
  { key: "pecheraSushi", label: "Pechera de Sushi", price: 2000, category: "equipment", currencyKey: "pc", currencyLabel: "PC", effect: "+2% proteccion contra ataque" },
  { key: "pantalonesSushi", label: "Pantalones de Sushi", price: 2000, category: "equipment", currencyKey: "pc", currencyLabel: "PC", effect: "+2% proteccion contra ataque" },
  { key: "botasSushi", label: "Botas de Sushi", price: 2000, category: "equipment", currencyKey: "pc", currencyLabel: "PC", effect: "+2% proteccion contra ataque" }
];

const UPGRADE_PATHS = {
  espada: [
    { currentKey: "espada", currentLabel: "Espada Lv 1", nextKey: "espadaLv2", nextLabel: "Espada Lv 2", cost: 2000, baseChance: 35, perricitaBonus: 50 },
    { currentKey: "espadaLv2", currentLabel: "Espada Lv 2", nextKey: "espadaLv3", nextLabel: "Espada Lv 3", cost: 3000, baseChance: 20, perricitaBonus: 15 },
    { currentKey: "espadaLv3", currentLabel: "Espada Lv 3", nextKey: "espadaLegendaria", nextLabel: "Espada Legendaria", cost: 5000, baseChance: 10, perricitaBonus: 5 },
    { currentKey: "espadaLegendaria", currentLabel: "Espada Legendaria", nextKey: "", nextLabel: "", cost: 0, baseChance: 0, perricitaBonus: 0, isMax: true }
  ],
  escudo: [
    { currentKey: "escudo", currentLabel: "Escudo Lv 1", nextKey: "escudoMadera", nextLabel: "Escudo Lv 2", cost: 2000, baseChance: 35, perricitaBonus: 50 },
    { currentKey: "escudoMadera", currentLabel: "Escudo Lv 2", nextKey: "escudoMetal", nextLabel: "Escudo Lv 3", cost: 3000, baseChance: 20, perricitaBonus: 15 },
    { currentKey: "escudoMetal", currentLabel: "Escudo Lv 3", nextKey: "escudoLegendario", nextLabel: "Escudo Legendario", cost: 5000, baseChance: 10, perricitaBonus: 5 },
    { currentKey: "escudoLegendario", currentLabel: "Escudo Legendario", nextKey: "", nextLabel: "", cost: 0, baseChance: 0, perricitaBonus: 0, isMax: true }
  ]
};

const LOGO_CATALOG_SEED = [
  { id: "logo-pelusa-1", name: "Pelusa", src: "./assets/logos-usuario/logo-pelusa-1.png", sortOrder: 10, isDefault: true },
  { id: "logo-abeja-1", name: "Abeja", src: "./assets/logos-usuario/logo-abeja-1.png", sortOrder: 20, isDefault: false },
  { id: "logo-abuela-1", name: "Abuela", src: "./assets/logos-usuario/logo-abuela-1.png", sortOrder: 30, isDefault: false },
  { id: "logo-amparo-1", name: "Amparo", src: "./assets/logos-usuario/logo-amparo-1.png", sortOrder: 40, isDefault: false },
  { id: "logo-buho-1", name: "Buho", src: "./assets/logos-usuario/logo-buho-1.png", sortOrder: 50, isDefault: false },
  { id: "logo-cabra-1", name: "Cabra", src: "./assets/logos-usuario/logo-cabra-1.png", sortOrder: 60, isDefault: false },
  { id: "logo-cami-1", name: "Cami", src: "./assets/logos-usuario/logo-cami-1.png", sortOrder: 70, isDefault: false },
  { id: "logo-croqueta-1", name: "Croqueta", src: "./assets/logos-usuario/logo-croqueta-1.png", sortOrder: 80, isDefault: false },
  { id: "logo-esq-1", name: "Esqueleto", src: "./assets/logos-usuario/logo-esq-1.png", sortOrder: 90, isDefault: false },
  { id: "logo-estresario-1", name: "Estresario", src: "./assets/logos-usuario/logo-estresario-1.png", sortOrder: 100, isDefault: false },
  { id: "logo-gato-1", name: "Gato", src: "./assets/logos-usuario/logo-gato-1.png", sortOrder: 110, isDefault: false },
  { id: "logo-panda-1", name: "Panda", src: "./assets/logos-usuario/logo-panda-1.png", sortOrder: 120, isDefault: false },
  { id: "logo-slime-1", name: "Slime 1", src: "./assets/logos-usuario/logo-slime-1.png", sortOrder: 130, isDefault: false },
  { id: "logo-slime-2", name: "Slime 2", src: "./assets/logos-usuario/logo-slime-2.png", sortOrder: 140, isDefault: false }
];
const FALLBACK_LOGO_ID_SET = new Set(LOGO_CATALOG_SEED.map((entry) => entry.id));
let logoCatalogSeedAttempted = false;
let logoCatalogCache = [];
let logoCatalogCacheAt = 0;

const CHEST_REWARD_CONFIG = [
  {
    variant: "coins",
    label: "Cofre monedas",
    weight: 35,
    rewards: [
      { label: "1000 PC", weight: 65, inventoryDelta: { pc: 1000 } },
      { label: "1500 PC", weight: 32, inventoryDelta: { pc: 1500 } },
      { label: "5000 PC", weight: 3, inventoryDelta: { pc: 5000 } }
    ]
  },
  {
    variant: "purple",
    label: "Cofre morado",
    weight: 60,
    rewards: [
      { label: "Polvo de Gema 1000", weight: 50, inventoryDelta: { polvoGema: 1000 } },
      { label: "Polvo de Gema 2000", weight: 25, inventoryDelta: { polvoGema: 2000 } },
      { label: "Polvo de Gema 5000", weight: 2, inventoryDelta: { polvoGema: 5000 } },
      { label: "Perricita", weight: 23, inventoryDelta: { perricita: 1 } }
    ]
  },
  {
    variant: "red",
    label: "Cofre rojo",
    weight: 5,
    rewards: [
      { label: "Random Key", weight: 100, inventoryDelta: { randomKey: 1 } }
    ]
  }
];

const RANDOM_KEY_CONFIG = {
  availableStatus: "Disponible",
  deliveredStatus: "Entregada",
  ticketActiveStatus: "Activa",
  ticketRedeemedStatus: "Canjeada",
  ticketExpiredStatus: "Expirada",
  ticketLifetimeDays: 30
};

const PERRI_CHEST_STATUS = {
  issued: "issued",
  opening: "opening",
  redeemed: "redeemed",
  revoked: "revoked",
  expired: "expired"
};

const ACCOUNT_ACTIVATION_STATUS = {
  issued: "issued",
  used: "used",
  revoked: "revoked",
  expired: "expired"
};

const NOTIFICATION_KINDS = {
  fragmento: "fragmento",
  ticket: "ticket",
  monedas: "monedas",
  gemas: "gemas",
  llaves: "llaves",
  random_key: "random_key",
  welcome: "welcome",
  twitch: "twitch",
  youtube: "youtube"
};

const PERRI_CHEST_EXTRA_TRIGGER_CHANCE = 60;
const PERRI_CHEST_GUARANTEED_REWARDS = {
  monedas: [
    { quantity: 1, weight: 55 },
    { quantity: 2, weight: 30 },
    { quantity: 3, weight: 15 }
  ],
  pc: [
    { quantity: 100, weight: 25 },
    { quantity: 200, weight: 25 },
    { quantity: 300, weight: 20 },
    { quantity: 400, weight: 18 },
    { quantity: 500, weight: 12 }
  ],
  polvoGema: [
    { quantity: 200, weight: 24 },
    { quantity: 300, weight: 22 },
    { quantity: 400, weight: 18 },
    { quantity: 500, weight: 16 },
    { quantity: 600, weight: 12 },
    { quantity: 700, weight: 8 }
  ]
};

const PERRI_CHEST_EXTRA_REWARD_POOL = [
  { kind: "fragmentoKey", weight: 10 },
  { kind: "logo", weight: 10 },
  { kind: "gemas", weight: 20 },
  { kind: "llaves", weight: 35 }
];

const PUBLIC_DUEL_COMBAT_RULES = {
  espadaLv1: { "": 0.6, escudo: 0.4, escudoMadera: 0.15, escudoMetal: 0, escudoLegendario: 0 },
  espadaLv2: { "": 0.65, escudo: 0.55, escudoMadera: 0.35, escudoMetal: 0.1, escudoLegendario: 0 },
  espadaLv3: { "": 0.7, escudo: 0.65, escudoMadera: 0.45, escudoMetal: 0.35, escudoLegendario: 0 },
  espadaLegendaria: { "": 0.8, escudo: 0.8, escudoMadera: 0.75, escudoMetal: 0.6, escudoLegendario: 0.3 }
};

const loginStateByNick = new Map();
const nickLocks = new Map();

function getSupabaseUrl() {
  return SUPABASE_URL;
}

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  return new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
}

function toNumber(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : 0;
}

function normalizeNick(value) {
  return String(value || "").trim();
}

function normalizeNickKey(value) {
  return normalizeNick(value).toLowerCase();
}

function toSnakeCase(key) {
  return String(key || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function inventoryToRow(nick, inventory) {
  const row = {
    nick,
    updated_at: nowIso()
  };

  INVENTORY_KEYS.forEach((key) => {
    row[toSnakeCase(key)] = toNumber(inventory[key]);
  });

  return row;
}

function defaultInventory() {
  return INVENTORY_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function rowToInventory(row) {
  const inventory = defaultInventory();
  if (!row || typeof row !== "object") {
    return inventory;
  }

  INVENTORY_KEYS.forEach((key) => {
    inventory[key] = toNumber(row[toSnakeCase(key)]);
  });

  return inventory;
}

function normalizePublicLogoId(logoId, knownLogoIds = FALLBACK_LOGO_ID_SET) {
  const normalizedLogoId = String(logoId || "").trim();
  if (!normalizedLogoId) {
    return "";
  }
  if (knownLogoIds instanceof Set) {
    return knownLogoIds.has(normalizedLogoId) ? normalizedLogoId : "";
  }
  if (Array.isArray(knownLogoIds)) {
    return knownLogoIds.includes(normalizedLogoId) ? normalizedLogoId : "";
  }
  return normalizedLogoId;
}

function normalizeOwnedLogoIds(logoIds, knownLogoIds = FALLBACK_LOGO_ID_SET) {
  const seen = new Set();
  const normalized = [];
  const values = Array.isArray(logoIds) ? logoIds : [];

  values.forEach((logoId) => {
    const normalizedLogoId = normalizePublicLogoId(logoId, knownLogoIds);
    if (!normalizedLogoId || seen.has(normalizedLogoId)) {
      return;
    }
    seen.add(normalizedLogoId);
    normalized.push(normalizedLogoId);
  });

  if (!seen.has(DEFAULT_LOGO_ID)) {
    normalized.unshift(DEFAULT_LOGO_ID);
  }

  return normalized;
}

function defaultProfile(nick) {
  return {
    nick,
    selectedLogoId: DEFAULT_LOGO_ID,
    ownedLogoIds: [DEFAULT_LOGO_ID],
    karma: "",
    achievements: []
  };
}

function rowToProfile(nick, row, knownLogoIds = FALLBACK_LOGO_ID_SET) {
  const fallback = defaultProfile(nick);
  if (!row || typeof row !== "object") {
    return fallback;
  }

  const ownedLogoIds = normalizeOwnedLogoIds(Array.isArray(row.owned_logo_ids) ? row.owned_logo_ids : [], knownLogoIds);
  const selectedLogoId = normalizePublicLogoId(row.selected_logo_id, knownLogoIds) || ownedLogoIds[0] || DEFAULT_LOGO_ID;

  return {
    nick,
    selectedLogoId,
    ownedLogoIds,
    karma: String(row.karma || "").trim(),
    achievements: Array.isArray(row.achievements) ? row.achievements.map((entry) => String(entry || "").trim()).filter(Boolean) : []
  };
}

function profileToRow(nick, profile, knownLogoIds = FALLBACK_LOGO_ID_SET) {
  const normalizedProfile = profile && typeof profile === "object" ? profile : defaultProfile(nick);
  const ownedLogoIds = normalizeOwnedLogoIds(normalizedProfile.ownedLogoIds || [], knownLogoIds);
  const selectedLogoId = normalizePublicLogoId(normalizedProfile.selectedLogoId, knownLogoIds) || ownedLogoIds[0] || DEFAULT_LOGO_ID;

  return {
    nick,
    selected_logo_id: selectedLogoId,
    owned_logo_ids: ownedLogoIds,
    karma: String(normalizedProfile.karma || "").trim(),
    achievements: Array.isArray(normalizedProfile.achievements) ? normalizedProfile.achievements.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
    updated_at: nowIso()
  };
}

function normalizeLogoCatalogEntry(row, index = 0) {
  const logoId = String(row?.logo_id || row?.id || "").trim();
  if (!logoId) {
    return null;
  }

  const name = String(row?.name || logoId).trim() || logoId;
  const src = String(row?.asset_path || row?.src || `./assets/logos-usuario/${logoId}.png`).trim() || `./assets/logos-usuario/${logoId}.png`;
  const enabled = row?.enabled !== false;
  if (!enabled) {
    return null;
  }

  const numericSortOrder = Number(row?.sort_order);
  const sortOrder = Number.isFinite(numericSortOrder) ? numericSortOrder : ((index + 1) * 10);
  const isDefault = Boolean(row?.is_default) || logoId === DEFAULT_LOGO_ID;

  return {
    id: logoId,
    name,
    src,
    sortOrder,
    isDefault
  };
}

async function ensureLogoCatalogSeed() {
  if (logoCatalogSeedAttempted) {
    return;
  }
  logoCatalogSeedAttempted = true;

  try {
    for (const logo of LOGO_CATALOG_SEED) {
      await upsertRow("shop_logo_catalog", {
        logo_id: logo.id,
        name: logo.name,
        asset_path: logo.src,
        sort_order: logo.sortOrder,
        enabled: true,
        is_default: Boolean(logo.isDefault),
        updated_at: nowIso()
      }, "logo_id", { returning: "minimal" });
    }
  } catch (error) {
    // Fallback silently when the table has not been migrated yet.
  }
}

async function listLogoCatalog() {
  const now = Date.now();
  if (logoCatalogCache.length && (now - logoCatalogCacheAt) < 30000) {
    return logoCatalogCache;
  }

  await ensureLogoCatalogSeed();

  let catalogRows = [];
  try {
    catalogRows = await fetchRows("shop_logo_catalog", {
      select: "logo_id,name,asset_path,sort_order,enabled,is_default",
      filters: {
        enabled: "eq.true"
      },
      orderBy: "sort_order.asc,logo_id.asc"
    });
  } catch (error) {
    catalogRows = [];
  }

  const normalizedCatalog = (catalogRows.length ? catalogRows : LOGO_CATALOG_SEED)
    .map((row, index) => normalizeLogoCatalogEntry(row, index))
    .filter(Boolean);

  const defaultEntry = normalizedCatalog.find((entry) => entry.isDefault) || normalizedCatalog.find((entry) => entry.id === DEFAULT_LOGO_ID) || normalizedCatalog[0] || {
    id: DEFAULT_LOGO_ID,
    name: "Pelusa",
    src: DEFAULT_LOGO_ASSET_PATH,
    sortOrder: 10,
    isDefault: true
  };

  if (!normalizedCatalog.some((entry) => entry.id === defaultEntry.id)) {
    normalizedCatalog.unshift(defaultEntry);
  }

  logoCatalogCache = normalizedCatalog.slice().sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.id.localeCompare(b.id, "es");
  });
  logoCatalogCacheAt = now;
  return logoCatalogCache;
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;
  if (!response.ok) {
    const detail = body && typeof body === "object" ? JSON.stringify(body) : text;
    throw new Error(`supabase_${response.status}_${detail.slice(0, 300)}`);
  }

  return body;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function buildFilterParams(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    params.set(key, value);
  });
  return params;
}

async function fetchRows(tableName, { select = "*", filters = {}, orderBy = "", limit = 0 } = {}) {
  const params = buildFilterParams(filters);
  params.set("select", select);
  if (orderBy) {
    params.set("order", orderBy);
  }
  if (limit > 0) {
    params.set("limit", String(limit));
  }
  const rows = await supabaseRequest(`${tableName}?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

async function fetchRow(tableName, options) {
  const rows = await fetchRows(tableName, { ...options, limit: 1 });
  return rows[0] || null;
}

async function fetchNickRowCaseInsensitive(tableName, nick, options = {}) {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return null;
  }

  const baseFilters = options.filters || {};
  const exactRow = await fetchRow(tableName, {
    ...options,
    filters: {
      ...baseFilters,
      nick: `eq.${normalizedNick}`
    }
  });
  if (exactRow) {
    return exactRow;
  }

  const normalizedKey = normalizeNickKey(normalizedNick);
  const candidateRows = await fetchRows(tableName, {
    ...options,
    filters: {
      ...baseFilters,
      nick: `ilike.${normalizedNick}`
    },
    limit: Math.max(Number(options.limit || 0), 50)
  });

  return candidateRows.find((row) => normalizeNickKey(row?.nick) === normalizedKey) || null;
}

async function insertRow(tableName, row, { returning = "representation" } = {}) {
  const params = new URLSearchParams();
  const prefer = returning === "minimal" ? "return=minimal" : "return=representation";
  return supabaseRequest(`${tableName}?${params.toString()}`, {
    method: "POST",
    headers: {
      Prefer: prefer
    },
    body: JSON.stringify(row)
  });
}

async function upsertRow(tableName, row, conflictColumn, { returning = "representation" } = {}) {
  const params = new URLSearchParams();
  if (conflictColumn) {
    params.set("on_conflict", conflictColumn);
  }
  const preferParts = ["resolution=merge-duplicates"];
  preferParts.push(returning === "minimal" ? "return=minimal" : "return=representation");
  return supabaseRequest(`${tableName}?${params.toString()}`, {
    method: "POST",
    headers: {
      Prefer: preferParts.join(",")
    },
    body: JSON.stringify(row)
  });
}

async function updateRows(tableName, patch, filters = {}, { returning = "representation" } = {}) {
  const params = buildFilterParams(filters);
  const prefer = returning === "minimal" ? "return=minimal" : "return=representation";
  return supabaseRequest(`${tableName}?${params.toString()}`, {
    method: "PATCH",
    headers: {
      Prefer: prefer
    },
    body: JSON.stringify(patch)
  });
}

async function deleteRows(tableName, filters = {}, { returning = "representation" } = {}) {
  const params = buildFilterParams(filters);
  const prefer = returning === "minimal" ? "return=minimal" : "return=representation";
  return supabaseRequest(`${tableName}?${params.toString()}`, {
    method: "DELETE",
    headers: {
      Prefer: prefer
    }
  });
}

async function ensurePlayer(nick) {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return null;
  }
  await upsertRow("shop_players", { nick: normalizedNick, active: true, updated_at: nowIso() }, "nick", { returning: "minimal" });
  return normalizedNick;
}

async function getInventory(nick) {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return defaultInventory();
  }

  const row = await fetchRow("shop_inventories", {
    filters: {
      nick: `eq.${normalizedNick}`
    }
  });

  if (!row) {
    const inventory = defaultInventory();
    await upsertRow("shop_inventories", inventoryToRow(normalizedNick, inventory), "nick", { returning: "minimal" });
    return inventory;
  }

  return rowToInventory(row);
}

async function saveInventory(nick, inventory) {
  const normalizedNick = await ensurePlayer(nick);
  await upsertRow("shop_inventories", inventoryToRow(normalizedNick, inventory), "nick", { returning: "minimal" });
  return rowToInventory(inventoryToRow(normalizedNick, inventory));
}

async function getProfile(nick) {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return defaultProfile("");
  }
  const logoCatalog = await listLogoCatalog();
  const knownLogoIds = new Set(logoCatalog.map((entry) => entry.id));

  const row = await fetchRow("shop_profiles", {
    filters: {
      nick: `eq.${normalizedNick}`
    }
  });

  if (!row) {
    const profile = defaultProfile(normalizedNick);
    await upsertRow("shop_profiles", profileToRow(normalizedNick, profile, knownLogoIds), "nick", { returning: "minimal" });
    return profile;
  }

  const profile = rowToProfile(normalizedNick, row, knownLogoIds);
  const normalizedRow = profileToRow(normalizedNick, profile, knownLogoIds);
  const rowOwned = Array.isArray(row.owned_logo_ids) ? row.owned_logo_ids : [];
  const rowSelected = String(row.selected_logo_id || "").trim();
  const shouldResave = rowSelected !== normalizedRow.selected_logo_id || JSON.stringify(rowOwned) !== JSON.stringify(normalizedRow.owned_logo_ids);
  if (shouldResave) {
    await upsertRow("shop_profiles", normalizedRow, "nick", { returning: "minimal" });
  }
  return profile;
}

async function saveProfile(nick, profile) {
  const normalizedNick = await ensurePlayer(nick);
  const logoCatalog = await listLogoCatalog();
  const knownLogoIds = new Set(logoCatalog.map((entry) => entry.id));
  const normalizedProfile = rowToProfile(normalizedNick, profileToRow(normalizedNick, profile, knownLogoIds), knownLogoIds);
  await upsertRow("shop_profiles", profileToRow(normalizedNick, normalizedProfile, knownLogoIds), "nick", { returning: "minimal" });
  return normalizedProfile;
}

async function touchPublicUser(nick, inventory, profile) {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return;
  }

  await upsertRow("shop_public_users", {
    nick: normalizedNick,
    pc: toNumber(inventory.pc),
    logo_id: normalizePublicLogoId(profile.selectedLogoId) || DEFAULT_LOGO_ID,
    karma: String(profile.karma || "").trim(),
    achievements: Array.isArray(profile.achievements) ? profile.achievements : [],
    updated_at: nowIso()
  }, "nick", { returning: "minimal" });
}

async function appendActivity(nick, game, result, details) {
  await insertRow("shop_activity", {
    nick: normalizeNick(nick),
    game: String(game || "").trim(),
    result: String(result || "").trim(),
    details: String(details || "").trim(),
    created_at: nowIso()
  }, { returning: "minimal" });
}

function mapNotificationRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  return {
    id: String(row.id || "").trim(),
    kind: String(row.kind || "").trim(),
    title: String(row.title || "").trim(),
    message: String(row.message || "").trim(),
    actionUrl: String(row.action_url || "").trim(),
    payload: row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {},
    readAt: String(row.read_at || "").trim(),
    createdAt: String(row.created_at || "").trim()
  };
}

async function appendNotification(nick, kind, title, message, payload = {}, actionUrl = "") {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return;
  }

  await insertRow("shop_notifications", {
    nick: normalizedNick,
    kind: String(kind || "").trim(),
    title: String(title || "").trim(),
    message: String(message || "").trim(),
    action_url: String(actionUrl || "").trim(),
    payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {},
    created_at: nowIso(),
    updated_at: nowIso()
  }, { returning: "minimal" });
}

async function listNotificationsForNick(nick, limit = 20) {
  const rows = await fetchRows("shop_notifications", {
    select: "id,kind,title,message,action_url,payload,read_at,created_at",
    filters: {
      nick: `eq.${normalizeNick(nick)}`
    },
    orderBy: "created_at.desc",
    limit: Math.max(1, Math.min(50, Math.floor(Number(limit || 20))))
  });

  return rows.map(mapNotificationRow).filter(Boolean);
}

async function countUnreadNotificationsForNick(nick) {
  const rows = await fetchRows("shop_notifications", {
    select: "id",
    filters: {
      nick: `eq.${normalizeNick(nick)}`,
      read_at: "is.null"
    },
    limit: 200
  });

  return rows.length;
}

async function markNotificationRead(nick, notificationId) {
  const normalizedNick = normalizeNick(nick);
  const normalizedNotificationId = String(notificationId || "").trim();
  if (!normalizedNick || !normalizedNotificationId) {
    return false;
  }

  await updateRows("shop_notifications", {
    read_at: nowIso(),
    updated_at: nowIso()
  }, {
    nick: `eq.${normalizedNick}`,
    id: `eq.${normalizedNotificationId}`,
    read_at: "is.null"
  }, { returning: "minimal" });

  return true;
}

async function markAllNotificationsRead(nick) {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return false;
  }

  await updateRows("shop_notifications", {
    read_at: nowIso(),
    updated_at: nowIso()
  }, {
    nick: `eq.${normalizedNick}`,
    read_at: "is.null"
  }, { returning: "minimal" });

  return true;
}

async function listActivityForNick(nick, limit = 30) {
  const rows = await fetchRows("shop_activity", {
    select: "game,result,details,created_at",
    filters: {
      nick: `eq.${normalizeNick(nick)}`
    },
    orderBy: "created_at.desc",
    limit: Math.max(1, Math.min(100, Math.floor(Number(limit || 30))))
  });

  return rows.map((row) => ({
    game: String(row.game || "").trim(),
    result: String(row.result || "").trim(),
    details: String(row.details || "").trim(),
    createdAt: String(row.created_at || "").trim()
  }));
}

async function getMenuRanking() {
  const rows = await fetchRows("shop_inventories", {
    select: "nick,pc",
    orderBy: "pc.desc,nick.asc",
    limit: 10
  });

  return rows
    .map((row) => ({
      nick: normalizeNick(row.nick),
      pc: toNumber(row.pc)
    }))
    .filter((entry) => entry.nick);
}

async function countAvailableRandomKeys() {
  const rows = await fetchRows("shop_random_key_pool", {
    select: "id",
    filters: {
      status: `eq.${RANDOM_KEY_CONFIG.availableStatus}`
    }
  });
  return rows.length;
}

async function listRandomKeyClaimsForNick(nick) {
  const rows = await fetchRows("shop_random_key_claims", {
    select: "claimed_at,game,key",
    filters: {
      nick: `eq.${normalizeNick(nick)}`
    },
    orderBy: "claimed_at.desc"
  });

  return rows.map((row) => ({
    claimedAt: String(row.claimed_at || ""),
    game: String(row.game || "").trim(),
    key: String(row.key || "").trim()
  }));
}

async function listActiveRandomKeyTicketsForNick(nick) {
  const rows = await fetchRows("shop_random_key_tickets", {
    select: "obtained_at,expires_at",
    filters: {
      nick: `eq.${normalizeNick(nick)}`,
      status: `eq.${RANDOM_KEY_CONFIG.ticketActiveStatus}`
    },
    orderBy: "obtained_at.asc"
  });

  return rows.map((row) => ({
    obtainedAt: String(row.obtained_at || ""),
    expiresAt: String(row.expires_at || "")
  }));
}

async function appendRandomKeyTicket(nick, obtainedAtIso) {
  await insertRow("shop_random_key_tickets", {
    id: crypto.randomUUID(),
    nick: normalizeNick(nick),
    status: RANDOM_KEY_CONFIG.ticketActiveStatus,
    obtained_at: obtainedAtIso,
    expires_at: new Date(new Date(obtainedAtIso).getTime() + (RANDOM_KEY_CONFIG.ticketLifetimeDays * 24 * 60 * 60 * 1000)).toISOString(),
    updated_at: nowIso()
  }, { returning: "minimal" });

}

async function syncRandomKeyState(nick, inventory) {
  const normalizedNick = normalizeNick(nick);
  const now = nowIso();
  const expiredRows = await fetchRows("shop_random_key_tickets", {
    select: "id",
    filters: {
      nick: `eq.${normalizedNick}`,
      status: `eq.${RANDOM_KEY_CONFIG.ticketActiveStatus}`,
      expires_at: `lt.${now}`
    }
  });

  if (expiredRows.length) {
    await Promise.all(expiredRows.map((row) => updateRows("shop_random_key_tickets", {
      status: RANDOM_KEY_CONFIG.ticketExpiredStatus,
      updated_at: nowIso()
    }, {
      id: `eq.${row.id}`
    }, { returning: "minimal" })));
  }

  const activeTickets = await listActiveRandomKeyTicketsForNick(normalizedNick);
  const nextInventory = { ...inventory, randomKey: activeTickets.length };
  if (toNumber(inventory.randomKey) !== activeTickets.length) {
    await saveInventory(normalizedNick, nextInventory);
  }

  return {
    inventory: nextInventory,
    randomKeyTickets: activeTickets
  };
}

async function createSession(nick) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await insertRow("shop_sessions", {
    token,
    nick: normalizeNick(nick),
    expires_at: expiresAt,
    created_at: nowIso(),
    updated_at: nowIso()
  }, { returning: "minimal" });
  return token;
}

async function deleteSession(token) {
  await deleteRows("shop_sessions", { token: `eq.${String(token || "").trim()}` }, { returning: "minimal" });
}

async function requireSession(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!token) {
    return { ok: false, error: "missing_session" };
  }

  const sessionRow = await fetchRow("shop_sessions", {
    filters: {
      token: `eq.${token}`
    }
  });

  if (!sessionRow) {
    return { ok: false, error: "session_expired" };
  }

  if (new Date(String(sessionRow.expires_at || 0)).getTime() <= Date.now()) {
    await deleteSession(token);
    return { ok: false, error: "session_expired" };
  }

  const accessRow = await fetchRow("shop_access", {
    filters: {
      nick: `eq.${normalizeNick(sessionRow.nick)}`
    }
  });

  if (!accessRow) {
    return { ok: false, error: "access_not_configured" };
  }

  if (accessRow.active === false) {
    return { ok: false, error: "access_disabled" };
  }

  await updateRows("shop_sessions", {
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    updated_at: nowIso()
  }, {
    token: `eq.${token}`
  }, { returning: "minimal" });

  return {
    ok: true,
    token,
    nick: normalizeNick(sessionRow.nick)
  };
}

function getLoginAttemptState(nick) {
  const key = normalizeNickKey(nick);
  if (!key) {
    return { blocked: false, retryAfterSec: 0 };
  }

  const state = loginStateByNick.get(key);
  if (!state) {
    return { blocked: false, retryAfterSec: 0 };
  }

  const now = Date.now();
  if (state.blockedUntil && state.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSec: Math.max(1, Math.ceil((state.blockedUntil - now) / 1000))
    };
  }

  if (state.windowEndsAt && state.windowEndsAt <= now) {
    loginStateByNick.delete(key);
  } else if (state.blockedUntil && state.blockedUntil <= now) {
    loginStateByNick.set(key, {
      count: 0,
      windowEndsAt: 0,
      blockedUntil: 0
    });
  }

  return { blocked: false, retryAfterSec: 0 };
}

function registerFailedLogin(nick) {
  const key = normalizeNickKey(nick);
  if (!key) {
    return { blocked: false, retryAfterSec: 0 };
  }

  const now = Date.now();
  const state = loginStateByNick.get(key) || { count: 0, windowEndsAt: 0, blockedUntil: 0 };
  if (!state.windowEndsAt || state.windowEndsAt <= now) {
    state.count = 0;
    state.windowEndsAt = now + (15 * 60 * 1000);
  }
  state.count += 1;

  if (state.count >= 8) {
    state.blockedUntil = now + (30 * 60 * 1000);
    state.count = 0;
    loginStateByNick.set(key, state);
    return {
      blocked: true,
      retryAfterSec: 30 * 60
    };
  }

  loginStateByNick.set(key, state);
  return { blocked: false, retryAfterSec: 0 };
}

function clearFailedLogins(nick) {
  loginStateByNick.delete(normalizeNickKey(nick));
}

async function withNickLock(nick, worker) {
  const key = normalizeNickKey(nick);
  const previous = nickLocks.get(key) || Promise.resolve();

  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  nickLocks.set(key, previous.finally(() => current));
  await previous;

  try {
    return await worker();
  } finally {
    release();
    if (nickLocks.get(key) === current) {
      nickLocks.delete(key);
    }
  }
}

async function getStoredOperation(operationId) {
  const row = await fetchRow("shop_operations", {
    filters: {
      operation_id: `eq.${String(operationId || "").trim()}`
    }
  });
  return row && row.response ? row.response : null;
}

async function storeOperation(operationId, action, nick, response) {
  await upsertRow("shop_operations", {
    operation_id: String(operationId || "").trim(),
    action: String(action || "").trim(),
    nick: normalizeNick(nick),
    response,
    created_at: nowIso()
  }, "operation_id", { returning: "minimal" });
}

async function runIdempotentOperation(operationId, action, nick, worker) {
  const normalizedOperationId = String(operationId || "").trim();
  if (!normalizedOperationId) {
    return worker();
  }

  const stored = await getStoredOperation(normalizedOperationId);
  if (stored) {
    return stored;
  }

  const freshResponse = await worker();
  await storeOperation(normalizedOperationId, action, nick, freshResponse);
  return freshResponse;
}

function pickWeightedEntry(pool) {
  const entries = Array.isArray(pool) ? pool : [];
  if (!entries.length) {
    return null;
  }

  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight || 0)), 0);
  if (totalWeight <= 0) {
    return entries[0];
  }

  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= Math.max(0, Number(entry.weight || 0));
    if (roll <= 0) {
      return entry;
    }
  }

  return entries[entries.length - 1];
}

function rollChestReward() {
  const chest = pickWeightedEntry(CHEST_REWARD_CONFIG);
  const reward = chest ? pickWeightedEntry(chest.rewards || []) : null;
  return { chest, reward };
}

function mergeInventoryDelta(baseDelta, extraDelta) {
  const merged = {};
  INVENTORY_KEYS.forEach((key) => {
    const baseValue = Number((baseDelta && baseDelta[key]) || 0);
    const extraValue = Number((extraDelta && extraDelta[key]) || 0);
    const totalValue = baseValue + extraValue;
    if (totalValue !== 0) {
      merged[key] = totalValue;
    }
  });
  return merged;
}

function applyInventoryDelta(inventory, delta) {
  const nextInventory = { ...defaultInventory(), ...inventory };
  INVENTORY_KEYS.forEach((key) => {
    nextInventory[key] = Math.max(0, toNumber(nextInventory[key]) + Number((delta && delta[key]) || 0));
  });
  return nextInventory;
}

function buildCardRewardDelta(reward) {
  const normalizedReward = String(reward || "").trim();
  if (!normalizedReward) {
    return null;
  }

  if (normalizedReward === "+3 Monedas") {
    return { monedas: 3 };
  }
  if (normalizedReward === "+1 Llave") {
    return { llaves: 1 };
  }
  if (normalizedReward === "Duelo") {
    return { duelo: 1 };
  }

  const pcMatch = normalizedReward.match(/^(\d+)\s+PC$/);
  if (pcMatch) {
    return { pc: Number(pcMatch[1] || 0) };
  }

  return null;
}

function buildRuletaRewardDelta(reward) {
  const normalizedReward = String(reward || "").trim();
  if (!normalizedReward) {
    return null;
  }

  if (normalizedReward === "Gema") {
    return { gemas: 1 };
  }
  if (normalizedReward === "Llave") {
    return { llaves: 1 };
  }
  if (normalizedReward === "Llave +1") {
    return { llaves: 1 };
  }
  if (normalizedReward === "Llave +2") {
    return { llaves: 2 };
  }
  if (normalizedReward === "Sub canal") {
    return {};
  }

  const coinMatch = normalizedReward.match(/^Moneda \+(\d+)$/);
  if (coinMatch) {
    return { monedas: Number(coinMatch[1] || 0) };
  }

  return null;
}

function getChestRewardEntryByLabel(rewardLabel) {
  const normalizedRewardLabel = String(rewardLabel || "").trim();
  if (!normalizedRewardLabel) {
    return null;
  }

  for (const chest of CHEST_REWARD_CONFIG) {
    const rewards = Array.isArray(chest.rewards) ? chest.rewards : [];
    const reward = rewards.find((entry) => String(entry.label || "").trim() === normalizedRewardLabel);
    if (reward) {
      return { chest, reward };
    }
  }

  return null;
}

function createPerriChestToken() {
  return crypto.randomBytes(24).toString("hex");
}

function createAccountActivationToken() {
  return crypto.randomBytes(24).toString("hex");
}

function randomInt(min, max) {
  const normalizedMin = Math.min(Number(min || 0), Number(max || 0));
  const normalizedMax = Math.max(Number(min || 0), Number(max || 0));
  return Math.floor(Math.random() * ((normalizedMax - normalizedMin) + 1)) + normalizedMin;
}

function formatRewardLabel(quantity, singularLabel, pluralLabel = `${singularLabel}s`) {
  return `${quantity} ${quantity === 1 ? singularLabel : pluralLabel}`;
}

function buildInventoryReward(kind, quantity) {
  const normalizedQuantity = Math.max(0, toNumber(quantity));
  if (!normalizedQuantity) {
    return null;
  }

  if (kind === "monedas") {
    return {
      kind,
      label: formatRewardLabel(normalizedQuantity, "Moneda"),
      quantity: normalizedQuantity,
      inventoryDelta: { monedas: normalizedQuantity }
    };
  }

  if (kind === "pc") {
    return {
      kind,
      label: `${normalizedQuantity} PC`,
      quantity: normalizedQuantity,
      inventoryDelta: { pc: normalizedQuantity }
    };
  }

  if (kind === "polvoGema") {
    return {
      kind,
      label: `${normalizedQuantity} PG`,
      quantity: normalizedQuantity,
      inventoryDelta: { polvoGema: normalizedQuantity }
    };
  }

  if (kind === "llaves") {
    return {
      kind,
      label: formatRewardLabel(normalizedQuantity, "Llave"),
      quantity: normalizedQuantity,
      inventoryDelta: { llaves: normalizedQuantity }
    };
  }

  if (kind === "gemas") {
    return {
      kind,
      label: formatRewardLabel(normalizedQuantity, "Gema"),
      quantity: normalizedQuantity,
      inventoryDelta: { gemas: normalizedQuantity }
    };
  }

  if (kind === "fragmentoKey") {
    return {
      kind,
      label: formatRewardLabel(normalizedQuantity, "Fragmento de Key"),
      quantity: normalizedQuantity,
      inventoryDelta: { fragmentoKey: normalizedQuantity }
    };
  }

  return null;
}

function listUnknownLogos(profile, logoCatalog) {
  const ownedLogoIds = new Set(Array.isArray(profile?.ownedLogoIds) ? profile.ownedLogoIds : []);
  return (Array.isArray(logoCatalog) ? logoCatalog : []).filter((logo) => logo && logo.id && !ownedLogoIds.has(logo.id));
}

function buildPerriChestGuaranteedRewards() {
  const coinRoll = pickWeightedEntry(PERRI_CHEST_GUARANTEED_REWARDS.monedas);
  const pcRoll = pickWeightedEntry(PERRI_CHEST_GUARANTEED_REWARDS.pc);
  const dustRoll = pickWeightedEntry(PERRI_CHEST_GUARANTEED_REWARDS.polvoGema);

  return [
    buildInventoryReward("monedas", coinRoll?.quantity || 1),
    buildInventoryReward("pc", pcRoll?.quantity || 100),
    buildInventoryReward("polvoGema", dustRoll?.quantity || 200)
  ].filter(Boolean);
}

function buildPerriChestExtraReward(profile, logoCatalog) {
  if ((Math.random() * 100) >= PERRI_CHEST_EXTRA_TRIGGER_CHANCE) {
    return null;
  }

  const unknownLogos = listUnknownLogos(profile, logoCatalog);
  const rewardPool = PERRI_CHEST_EXTRA_REWARD_POOL.filter((entry) => entry.kind !== "logo" || unknownLogos.length > 0);
  const selectedReward = pickWeightedEntry(rewardPool);
  if (!selectedReward) {
    return null;
  }

  if (selectedReward.kind === "logo") {
    const selectedLogo = unknownLogos[randomInt(0, unknownLogos.length - 1)] || null;
    if (!selectedLogo) {
      return null;
    }

    return {
      kind: "logo",
      label: `Perrilogo: ${selectedLogo.name}`,
      quantity: 1,
      logoId: selectedLogo.id,
      logoName: selectedLogo.name,
      assetPath: selectedLogo.src
    };
  }

  return buildInventoryReward(selectedReward.kind, 1);
}

function buildPerriChestRewards(profile, logoCatalog) {
  const guaranteedRewards = buildPerriChestGuaranteedRewards();
  const extraReward = buildPerriChestExtraReward(profile, logoCatalog);
  const rewards = extraReward ? guaranteedRewards.concat(extraReward) : guaranteedRewards.slice();

  return {
    guaranteedRewards,
    extraReward,
    rewards
  };
}

function getPerriChestInventoryDelta(rewardBundle) {
  return (Array.isArray(rewardBundle?.rewards) ? rewardBundle.rewards : []).reduce((acc, reward) => (
    mergeInventoryDelta(acc, reward && reward.inventoryDelta ? reward.inventoryDelta : {})
  ), {});
}

function applyPerriChestProfileRewards(profile, rewardBundle, knownLogoIds = FALLBACK_LOGO_ID_SET) {
  const nextProfile = profile && typeof profile === "object" ? { ...profile } : defaultProfile("");
  const rewards = Array.isArray(rewardBundle?.rewards) ? rewardBundle.rewards : [];
  const ownedLogoIds = normalizeOwnedLogoIds(nextProfile.ownedLogoIds || [], knownLogoIds);
  const ownedSet = new Set(ownedLogoIds);

  rewards.forEach((reward) => {
    const logoId = String(reward?.logoId || "").trim();
    if (!logoId || ownedSet.has(logoId)) {
      return;
    }
    ownedSet.add(logoId);
    ownedLogoIds.push(logoId);
  });

  nextProfile.ownedLogoIds = normalizeOwnedLogoIds(ownedLogoIds, knownLogoIds);
  nextProfile.selectedLogoId = normalizePublicLogoId(nextProfile.selectedLogoId, knownLogoIds) || nextProfile.ownedLogoIds[0] || DEFAULT_LOGO_ID;
  return nextProfile;
}

function formatPerriChestSummary(rewardBundle) {
  const rewards = Array.isArray(rewardBundle?.rewards) ? rewardBundle.rewards : [];
  return rewards.map((reward) => String(reward?.label || "").trim()).filter(Boolean).join(" | ");
}

function getEquippedAttackWeaponKey(inventory) {
  const source = inventory && typeof inventory === "object" ? inventory : {};
  if (toNumber(source.espadaLegendaria) > 0) {
    return "espadaLegendaria";
  }
  if (toNumber(source.espadaLv3) > 0) {
    return "espadaLv3";
  }
  if (toNumber(source.espadaLv2) > 0) {
    return "espadaLv2";
  }
  if (toNumber(source.espada) > 0) {
    return "espadaLv1";
  }
  return "";
}

function getEquippedDefenseShieldKey(inventory) {
  const source = inventory && typeof inventory === "object" ? inventory : {};
  if (toNumber(source.escudoLegendario) > 0) {
    return "escudoLegendario";
  }
  if (toNumber(source.escudoMetal) > 0) {
    return "escudoMetal";
  }
  if (toNumber(source.escudoMadera) > 0) {
    return "escudoMadera";
  }
  if (toNumber(source.escudo) > 0) {
    return "escudo";
  }
  return "";
}

function hasFullSushiSetInventory(inventory) {
  const source = inventory && typeof inventory === "object" ? inventory : {};
  return toNumber(source.cascoSushi) > 0
    && toNumber(source.guantesSushi) > 0
    && toNumber(source.pecheraSushi) > 0
    && toNumber(source.pantalonesSushi) > 0
    && toNumber(source.botasSushi) > 0;
}

function getAttackSushiBonus(inventory) {
  const source = inventory && typeof inventory === "object" ? inventory : {};
  let bonus = toNumber(source.guantesSushi) > 0 ? 0.05 : 0;
  if (hasFullSushiSetInventory(source)) {
    bonus += 0.03;
  }
  return bonus;
}

function getDefenseSushiBonus(inventory) {
  const source = inventory && typeof inventory === "object" ? inventory : {};
  let bonus = 0;
  if (toNumber(source.cascoSushi) > 0) bonus += 0.02;
  if (toNumber(source.pecheraSushi) > 0) bonus += 0.02;
  if (toNumber(source.pantalonesSushi) > 0) bonus += 0.02;
  if (toNumber(source.botasSushi) > 0) bonus += 0.02;
  if (hasFullSushiSetInventory(source)) {
    bonus += 0.04;
  }
  return bonus;
}

function clampChance(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function resolvePublicDuelOutcome(attackerInventory, defenderInventory, weaponKey, shieldKey) {
  const normalizedWeaponKey = String(weaponKey || "").trim();
  const normalizedShieldKey = String(shieldKey || "").trim();
  const baseChanceToWin = PUBLIC_DUEL_COMBAT_RULES[normalizedWeaponKey]?.[normalizedShieldKey] ?? 0;
  const ignoreSushiModifiers = normalizedWeaponKey === "espadaLegendaria" || normalizedShieldKey === "escudoLegendario";
  const sushiAttackBonus = ignoreSushiModifiers ? 0 : getAttackSushiBonus(attackerInventory);
  const sushiDefenseBonus = ignoreSushiModifiers ? 0 : getDefenseSushiBonus(defenderInventory);
  const chanceToWin = clampChance(baseChanceToWin + sushiAttackBonus - sushiDefenseBonus);
  const roll = Math.random();
  if (roll < chanceToWin) {
    return "Impacto";
  }
  return normalizedShieldKey ? "Bloqueado" : "Fallo";
}

function mapPerriChestRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  return {
    chestId: String(row.chest_id || "").trim(),
    token: String(row.redeem_token || "").trim(),
    status: String(row.status || "").trim() || PERRI_CHEST_STATUS.issued,
    issuedLabel: String(row.issued_label || "").trim(),
    issuedNote: String(row.issued_note || "").trim(),
    guaranteedRewards: Array.isArray(row.guaranteed_rewards) ? row.guaranteed_rewards : [],
    extraReward: row.extra_reward && typeof row.extra_reward === "object" ? row.extra_reward : null,
    rewards: Array.isArray(row.rewards) ? row.rewards : [],
    redeemedBy: String(row.redeemed_by || "").trim(),
    issuedAt: String(row.issued_at || "").trim(),
    openingAt: String(row.opening_at || "").trim(),
    redeemedAt: String(row.redeemed_at || "").trim(),
    expiresAt: String(row.expires_at || "").trim(),
    updatedAt: String(row.updated_at || "").trim()
  };
}

function buildPerriChestRedeemUrl(token) {
  const normalizedToken = String(token || "").trim();
  return normalizedToken ? `${PERRI_CHEST_LINK_BASE_URL}/?perricofre=${encodeURIComponent(normalizedToken)}` : "";
}

function mapAccountActivationRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  return {
    inviteId: String(row.invite_id || "").trim(),
    nick: normalizeNick(row.nick),
    token: String(row.activation_token || "").trim(),
    status: String(row.status || "").trim() || ACCOUNT_ACTIVATION_STATUS.issued,
    issuedNote: String(row.issued_note || "").trim(),
    createdAt: String(row.created_at || "").trim(),
    expiresAt: String(row.expires_at || "").trim(),
    usedAt: String(row.used_at || "").trim(),
    updatedAt: String(row.updated_at || "").trim()
  };
}

function buildAccountActivationUrl(token) {
  const normalizedToken = String(token || "").trim();
  return normalizedToken ? `${ACCOUNT_ACTIVATION_LINK_BASE_URL}/?activar=${encodeURIComponent(normalizedToken)}` : "";
}

function getOwnedChainCount(snapshot, itemKey) {
  if (itemKey === "espada") {
    return toNumber(snapshot.espada) + toNumber(snapshot.espadaLv2) + toNumber(snapshot.espadaLv3) + toNumber(snapshot.espadaLegendaria);
  }
  if (itemKey === "escudo") {
    return toNumber(snapshot.escudo) + toNumber(snapshot.escudoMadera) + toNumber(snapshot.escudoMetal) + toNumber(snapshot.escudoLegendario);
  }
  return toNumber(snapshot[itemKey]);
}

function getUpgradeStage(snapshot, gearType) {
  const stages = UPGRADE_PATHS[gearType];
  if (!stages) {
    return null;
  }

  for (let index = stages.length - 1; index >= 0; index -= 1) {
    const stage = stages[index];
    if (toNumber(snapshot[stage.currentKey]) > 0) {
      return stage;
    }
  }

  return null;
}

async function buildShopState(nick) {
  const inventory = await getInventory(nick);
  const syncResult = await syncRandomKeyState(nick, inventory);
  const profile = await getProfile(nick);
  const logoCatalog = await listLogoCatalog();
  await touchPublicUser(nick, syncResult.inventory, profile);

  const [
    menuRanking,
    randomKeyClaims,
    availableRandomKeys,
    notifications,
    unreadNotificationCount
  ] = await Promise.all([
    getMenuRanking(),
    listRandomKeyClaimsForNick(nick),
    countAvailableRandomKeys(),
    listNotificationsForNick(nick),
    countUnreadNotificationsForNick(nick)
  ]);

  return {
    nick: normalizeNick(nick),
    inventory: syncResult.inventory,
    profile,
    logoCatalog,
    menuRanking,
    randomKeyTickets: syncResult.randomKeyTickets,
    randomKeyClaims,
    availableRandomKeys,
    notifications,
    unreadNotificationCount,
    items: PUBLIC_SHOP_ITEMS
  };
}

async function buildProfileState(nick) {
  const normalizedNick = normalizeNick(nick);
  const inventory = await getInventory(normalizedNick);
  const profile = await getProfile(normalizedNick);
  const logoCatalog = await listLogoCatalog();
  await touchPublicUser(normalizedNick, inventory, profile);

  const [activityHistory, notifications, unreadNotificationCount] = await Promise.all([
    listActivityForNick(normalizedNick),
    listNotificationsForNick(normalizedNick),
    countUnreadNotificationsForNick(normalizedNick)
  ]);

  return {
    nick: normalizedNick,
    inventory,
    profile,
    logoCatalog,
    activityHistory,
    notifications,
    unreadNotificationCount
  };
}

async function playerExists(nick) {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return false;
  }
  const row = await fetchRow("shop_players", {
    filters: {
      nick: `eq.${normalizedNick}`
    }
  });
  return Boolean(row);
}

async function hasActiveWebAccess(nick) {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return false;
  }
  const row = await fetchRow("shop_access", {
    filters: {
      nick: `eq.${normalizedNick}`
    }
  });
  return Boolean(row && row.active !== false && String(row.code_hash || "").trim());
}

async function getAccountActivationByToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return null;
  }
  const row = await fetchRow("shop_account_activation_links", {
    filters: {
      activation_token: `eq.${normalizedToken}`
    }
  });
  return mapAccountActivationRow(row);
}

async function markAccountActivationExpiredIfNeeded(link) {
  if (!link || !link.expiresAt) {
    return link;
  }
  if (link.status !== ACCOUNT_ACTIVATION_STATUS.issued) {
    return link;
  }
  const expiresAtMs = new Date(link.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs > Date.now()) {
    return link;
  }
  await updateRows("shop_account_activation_links", {
    status: ACCOUNT_ACTIVATION_STATUS.expired,
    updated_at: nowIso()
  }, {
    invite_id: `eq.${link.inviteId}`
  }, { returning: "minimal" });
  return {
    ...link,
    status: ACCOUNT_ACTIVATION_STATUS.expired
  };
}

async function getPerriChestByToken(chestToken) {
  const normalizedToken = String(chestToken || "").trim();
  if (!normalizedToken) {
    return null;
  }

  const row = await fetchRow("shop_perri_chests", {
    filters: {
      redeem_token: `eq.${normalizedToken}`
    }
  });

  return mapPerriChestRow(row);
}

async function markPerriChestExpiredIfNeeded(perriChest) {
  if (!perriChest || !perriChest.expiresAt) {
    return perriChest;
  }

  if (perriChest.status !== PERRI_CHEST_STATUS.issued && perriChest.status !== PERRI_CHEST_STATUS.opening) {
    return perriChest;
  }

  const expiresAtMs = new Date(perriChest.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs > Date.now()) {
    return perriChest;
  }

  await updateRows("shop_perri_chests", {
    status: PERRI_CHEST_STATUS.expired,
    updated_at: nowIso()
  }, {
    chest_id: `eq.${perriChest.chestId}`
  }, { returning: "minimal" });

  return {
    ...perriChest,
    status: PERRI_CHEST_STATUS.expired
  };
}

async function adminCreatePerriChests(quantity, issuedLabel = "", issuedNote = "", expiresAt = "") {
  const total = Math.max(1, Math.min(200, Math.floor(Number(quantity || 1))));
  const normalizedLabel = String(issuedLabel || "").trim();
  const normalizedNote = String(issuedNote || "").trim();
  const normalizedExpiresAt = String(expiresAt || "").trim();
  const created = [];

  for (let index = 0; index < total; index += 1) {
    const token = createPerriChestToken();
    const row = {
      chest_id: crypto.randomUUID(),
      redeem_token: token,
      status: PERRI_CHEST_STATUS.issued,
      issued_label: normalizedLabel,
      issued_note: normalizedNote,
      guaranteed_rewards: [],
      extra_reward: null,
      rewards: [],
      issued_at: nowIso(),
      expires_at: normalizedExpiresAt || null,
      updated_at: nowIso()
    };

    await insertRow("shop_perri_chests", row, { returning: "minimal" });
    created.push({
      chestId: row.chest_id,
      token,
      redeemUrl: buildPerriChestRedeemUrl(token),
      status: row.status,
      issuedLabel: normalizedLabel,
      issuedNote: normalizedNote,
      expiresAt: normalizedExpiresAt
    });
  }

  return {
    ok: true,
    quantity: created.length,
    perriChests: created
  };
}

async function adminListPerriChests(limit = 50) {
  const rows = await fetchRows("shop_perri_chests", {
    select: "*",
    orderBy: "issued_at.desc",
    limit: Math.max(1, Math.min(200, Math.floor(Number(limit || 50))))
  });

  return {
    ok: true,
    perriChests: rows
      .map((row) => mapPerriChestRow(row))
      .filter(Boolean)
      .map((row) => ({
        ...row,
        redeemUrl: buildPerriChestRedeemUrl(row.token)
      }))
  };
}

async function adminCreateAccountActivationLink(nick, expiresAt = "", issuedNote = "") {
  const normalizedNick = normalizeNick(nick);
  const normalizedExpiresAt = String(expiresAt || "").trim();
  const normalizedNote = String(issuedNote || "").trim();

  if (!normalizedNick) {
    return { ok: false, error: "missing_nick" };
  }
  if (!(await playerExists(normalizedNick))) {
    return { ok: false, error: "nick_not_found", nick: normalizedNick };
  }

  await updateRows("shop_account_activation_links", {
    status: ACCOUNT_ACTIVATION_STATUS.revoked,
    updated_at: nowIso()
  }, {
    nick: `eq.${normalizedNick}`,
    status: `eq.${ACCOUNT_ACTIVATION_STATUS.issued}`
  }, { returning: "minimal" });

  const token = createAccountActivationToken();
  const row = {
    invite_id: crypto.randomUUID(),
    nick: normalizedNick,
    activation_token: token,
    status: ACCOUNT_ACTIVATION_STATUS.issued,
    issued_note: normalizedNote,
    created_at: nowIso(),
    expires_at: normalizedExpiresAt || null,
    used_at: null,
    updated_at: nowIso()
  };

  await insertRow("shop_account_activation_links", row, { returning: "minimal" });
  return {
    ok: true,
    activationLink: {
      inviteId: row.invite_id,
      nick: normalizedNick,
      token,
      status: row.status,
      issuedNote: normalizedNote,
      expiresAt: normalizedExpiresAt,
      activationUrl: buildAccountActivationUrl(token)
    }
  };
}

async function adminListAccountActivationLinks(limit = 50) {
  const rows = await fetchRows("shop_account_activation_links", {
    select: "*",
    orderBy: "created_at.desc",
    limit: Math.max(1, Math.min(200, Math.floor(Number(limit || 50))))
  });

  return {
    ok: true,
    activationLinks: rows
      .map((row) => mapAccountActivationRow(row))
      .filter(Boolean)
      .map((row) => ({
        ...row,
        activationUrl: buildAccountActivationUrl(row.token)
      }))
  };
}

async function publicShopGetActivationLink(token) {
  let activationLink = await getAccountActivationByToken(token);
  if (!activationLink) {
    return { ok: false, error: "invalid_activation_link" };
  }

  activationLink = await markAccountActivationExpiredIfNeeded(activationLink);
  if (activationLink.status === ACCOUNT_ACTIVATION_STATUS.revoked) {
    return { ok: false, error: "activation_link_revoked", nick: activationLink.nick };
  }
  if (activationLink.status === ACCOUNT_ACTIVATION_STATUS.expired) {
    return { ok: false, error: "activation_link_expired", nick: activationLink.nick };
  }
  if (activationLink.status === ACCOUNT_ACTIVATION_STATUS.used) {
    return { ok: false, error: "activation_link_used", nick: activationLink.nick };
  }
  if (await hasActiveWebAccess(activationLink.nick)) {
    return { ok: false, error: "account_already_active", nick: activationLink.nick };
  }

  return {
    ok: true,
    activationLink: {
      inviteId: activationLink.inviteId,
      nick: activationLink.nick,
      status: activationLink.status,
      expiresAt: activationLink.expiresAt,
      issuedNote: activationLink.issuedNote
    }
  };
}

async function publicShopActivateAccount(token, password) {
  const normalizedPassword = String(password || "").trim();
  if (!normalizedPassword) {
    return { ok: false, error: "missing_password" };
  }
  if (normalizedPassword.length < 6) {
    return { ok: false, error: "password_too_short" };
  }

  let activationLink = await getAccountActivationByToken(token);
  if (!activationLink) {
    return { ok: false, error: "invalid_activation_link" };
  }

  activationLink = await markAccountActivationExpiredIfNeeded(activationLink);
  if (activationLink.status === ACCOUNT_ACTIVATION_STATUS.revoked) {
    return { ok: false, error: "activation_link_revoked", nick: activationLink.nick };
  }
  if (activationLink.status === ACCOUNT_ACTIVATION_STATUS.expired) {
    return { ok: false, error: "activation_link_expired", nick: activationLink.nick };
  }
  if (activationLink.status === ACCOUNT_ACTIVATION_STATUS.used) {
    return { ok: false, error: "activation_link_used", nick: activationLink.nick };
  }
  if (!(await playerExists(activationLink.nick))) {
    return { ok: false, error: "nick_not_found", nick: activationLink.nick };
  }
  if (await hasActiveWebAccess(activationLink.nick)) {
    return { ok: false, error: "account_already_active", nick: activationLink.nick };
  }

  return withNickLock(activationLink.nick, async () => {
    await ensurePlayer(activationLink.nick);
    const inventory = await getInventory(activationLink.nick);
    const profile = await getProfile(activationLink.nick);

    await upsertRow("shop_access", {
      nick: activationLink.nick,
      code_hash: sha256(normalizedPassword),
      active: true,
      last_access_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso()
    }, "nick", { returning: "minimal" });

    await updateRows("shop_account_activation_links", {
      status: ACCOUNT_ACTIVATION_STATUS.used,
      used_at: nowIso(),
      updated_at: nowIso()
    }, {
      invite_id: `eq.${activationLink.inviteId}`,
      status: `eq.${ACCOUNT_ACTIVATION_STATUS.issued}`
    }, { returning: "minimal" });

    await touchPublicUser(activationLink.nick, inventory, profile);
    await appendNotification(
      activationLink.nick,
      NOTIFICATION_KINDS.welcome,
      "Cuenta activada",
      "Bienvenido a Perrisushi World."
    );
    const sessionToken = await createSession(activationLink.nick);
    const state = await buildShopState(activationLink.nick);
    return {
      ok: true,
      activated: true,
      nick: activationLink.nick,
      sessionToken,
      ...state
    };
  });
}

async function publicShopGetPerriChest(sessionToken, chestToken) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  let perriChest = await getPerriChestByToken(chestToken);
  if (!perriChest) {
    return {
      ok: false,
      error: "invalid_perri_chest",
      nick: sessionResult.nick
    };
  }

  perriChest = await markPerriChestExpiredIfNeeded(perriChest);
  if (perriChest.status === PERRI_CHEST_STATUS.revoked) {
    return {
      ok: false,
      error: "perri_chest_revoked",
      nick: sessionResult.nick
    };
  }

  if (perriChest.status === PERRI_CHEST_STATUS.expired) {
    return {
      ok: false,
      error: "perri_chest_expired",
      nick: sessionResult.nick
    };
  }

  if (perriChest.status === PERRI_CHEST_STATUS.redeemed && perriChest.redeemedBy && perriChest.redeemedBy !== sessionResult.nick) {
    return {
      ok: false,
      error: "perri_chest_already_redeemed",
      nick: sessionResult.nick
    };
  }

  return {
    ok: true,
    nick: sessionResult.nick,
    perriChest: {
      chestId: perriChest.chestId,
      token: perriChest.token,
      status: perriChest.status,
      issuedLabel: perriChest.issuedLabel,
      issuedNote: perriChest.issuedNote,
      rewards: perriChest.rewards,
      guaranteedRewards: perriChest.guaranteedRewards,
      extraReward: perriChest.extraReward,
      redeemedBy: perriChest.redeemedBy,
      redeemedAt: perriChest.redeemedAt,
      expiresAt: perriChest.expiresAt
    }
  };
}

async function publicShopRedeemPerriChest(sessionToken, chestToken, redeemId) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const normalizedToken = String(chestToken || "").trim();
  if (!normalizedToken) {
    return {
      ok: false,
      error: "missing_perri_chest_token",
      nick: sessionResult.nick
    };
  }

  return withNickLock(sessionResult.nick, async () => runIdempotentOperation(redeemId, "publicShopRedeemPerriChest", sessionResult.nick, async () => {
    let perriChest = await getPerriChestByToken(normalizedToken);
    if (!perriChest) {
      return {
        ok: false,
        error: "invalid_perri_chest",
        nick: sessionResult.nick
      };
    }

    perriChest = await markPerriChestExpiredIfNeeded(perriChest);
    if (perriChest.status === PERRI_CHEST_STATUS.revoked) {
      return {
        ok: false,
        error: "perri_chest_revoked",
        nick: sessionResult.nick
      };
    }

    if (perriChest.status === PERRI_CHEST_STATUS.expired) {
      return {
        ok: false,
        error: "perri_chest_expired",
        nick: sessionResult.nick
      };
    }

    if (perriChest.status === PERRI_CHEST_STATUS.redeemed) {
      const inventory = await getInventory(sessionResult.nick);
      const profile = await getProfile(sessionResult.nick);
      if (perriChest.redeemedBy && perriChest.redeemedBy !== sessionResult.nick) {
        return {
          ok: false,
          error: "perri_chest_already_redeemed",
          nick: sessionResult.nick,
          inventory,
          profile
        };
      }

      return {
        ok: true,
        alreadyRedeemed: true,
        nick: sessionResult.nick,
        inventory,
        profile,
        perriChest
      };
    }

    const openingRows = await updateRows("shop_perri_chests", {
      status: PERRI_CHEST_STATUS.opening,
      redeemed_by: sessionResult.nick,
      opening_at: nowIso(),
      updated_at: nowIso()
    }, {
      chest_id: `eq.${perriChest.chestId}`,
      status: `eq.${PERRI_CHEST_STATUS.issued}`
    });

    if (!Array.isArray(openingRows) || !openingRows.length) {
      const latestChest = await getPerriChestByToken(normalizedToken);
      if (latestChest && latestChest.status === PERRI_CHEST_STATUS.redeemed) {
        return {
          ok: false,
          error: latestChest.redeemedBy === sessionResult.nick ? "perri_chest_already_redeemed" : "perri_chest_claimed_by_other_user",
          nick: sessionResult.nick
        };
      }

      return {
        ok: false,
        error: "perri_chest_unavailable",
        nick: sessionResult.nick
      };
    }

    let inventory = await getInventory(sessionResult.nick);
    const logoCatalog = await listLogoCatalog();
    const knownLogoIds = new Set(logoCatalog.map((entry) => entry.id));
    const profile = await getProfile(sessionResult.nick);
    const rewardBundle = buildPerriChestRewards(profile, logoCatalog);
    const nextInventory = applyInventoryDelta(inventory, getPerriChestInventoryDelta(rewardBundle));
    const nextProfile = applyPerriChestProfileRewards(profile, rewardBundle, knownLogoIds);
    const savedInventory = await saveInventory(sessionResult.nick, nextInventory);
    const savedProfile = await saveProfile(sessionResult.nick, nextProfile);
    await touchPublicUser(sessionResult.nick, savedInventory, savedProfile);

    const finalizedRows = await updateRows("shop_perri_chests", {
      status: PERRI_CHEST_STATUS.redeemed,
      guaranteed_rewards: rewardBundle.guaranteedRewards,
      extra_reward: rewardBundle.extraReward,
      rewards: rewardBundle.rewards,
      redeemed_at: nowIso(),
      updated_at: nowIso()
    }, {
      chest_id: `eq.${perriChest.chestId}`,
      status: `eq.${PERRI_CHEST_STATUS.opening}`,
      redeemed_by: `eq.${sessionResult.nick}`
    });

    const finalizedChest = mapPerriChestRow(Array.isArray(finalizedRows) && finalizedRows.length ? finalizedRows[0] : null) || {
      ...perriChest,
      status: PERRI_CHEST_STATUS.redeemed,
      redeemedBy: sessionResult.nick,
      guaranteedRewards: rewardBundle.guaranteedRewards,
      extraReward: rewardBundle.extraReward,
      rewards: rewardBundle.rewards,
      redeemedAt: nowIso()
    };

    await appendActivity(
      sessionResult.nick,
      "Perricofre",
      finalizedChest.issuedLabel || "Apertura",
      formatPerriChestSummary(rewardBundle)
    );

    return {
      ok: true,
      nick: sessionResult.nick,
      inventory: savedInventory,
      profile: savedProfile,
      perriChest: finalizedChest
    };
  }));
}

async function listPublicShopUsers() {
  const accessRows = await fetchRows("shop_access", {
    select: "nick,active",
    filters: {
      active: "eq.true"
    },
    orderBy: "nick.asc"
  });
  const inventories = await fetchRows("shop_inventories", {
    select: "nick,pc"
  });
  const profiles = await fetchRows("shop_profiles", {
    select: "nick,selected_logo_id,karma,achievements"
  });

  const inventoryByNick = new Map(inventories.map((row) => [normalizeNickKey(row.nick), row]));
  const profileByNick = new Map(profiles.map((row) => [normalizeNickKey(row.nick), row]));

  return accessRows
    .map((row) => {
      const nick = normalizeNick(row.nick);
      if (!nick) {
        return null;
      }
      const inventoryRow = inventoryByNick.get(normalizeNickKey(nick)) || null;
      const profileRow = profileByNick.get(normalizeNickKey(nick)) || null;
      return {
        nick,
        pc: toNumber(inventoryRow ? inventoryRow.pc : 0),
        achievements: profileRow && Array.isArray(profileRow.achievements) ? profileRow.achievements : [],
        logoId: normalizePublicLogoId(profileRow ? profileRow.selected_logo_id : "", null) || DEFAULT_LOGO_ID,
        karma: String(profileRow && profileRow.karma ? profileRow.karma : "").trim()
      };
    })
    .filter(Boolean);
}

async function publicShopLogin(nick, accessCode) {
  const normalizedNick = normalizeNick(nick);
  const normalizedCode = String(accessCode || "").trim();
  const blockState = getLoginAttemptState(normalizedNick);
  if (blockState.blocked) {
    return {
      ok: false,
      error: "too_many_attempts",
      retryAfterSec: blockState.retryAfterSec
    };
  }

  if (!normalizedNick || !normalizedCode) {
    return {
      ok: false,
      error: "missing_credentials"
    };
  }

  const accessRow = await fetchNickRowCaseInsensitive("shop_access", normalizedNick);

  if (!accessRow) {
    registerFailedLogin(normalizedNick);
    return {
      ok: false,
      error: "access_not_configured"
    };
  }

  if (accessRow.active === false) {
    return {
      ok: false,
      error: "access_disabled"
    };
  }

  if (String(accessRow.code_hash || "").trim() !== sha256(normalizedCode)) {
    const failedState = registerFailedLogin(normalizedNick);
    return failedState.blocked
      ? { ok: false, error: "too_many_attempts", retryAfterSec: failedState.retryAfterSec }
      : { ok: false, error: "invalid_code" };
  }

  const canonicalNick = normalizeNick(accessRow.nick) || normalizedNick;

  clearFailedLogins(canonicalNick);
  await ensurePlayer(canonicalNick);
  await updateRows("shop_access", {
    last_access_at: nowIso(),
    updated_at: nowIso()
  }, {
    nick: `eq.${canonicalNick}`
  }, { returning: "minimal" });

  const sessionToken = await createSession(canonicalNick);
  const state = await buildShopState(canonicalNick);
  return {
    ok: true,
    ...state,
    sessionToken
  };
}

async function publicShopRefresh(sessionToken) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  return {
    ok: true,
    ...(await buildShopState(sessionResult.nick))
  };
}

async function publicShopGetProfile(sessionToken) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const state = await buildProfileState(sessionResult.nick);
  return {
    ok: true,
    nick: state.nick,
    inventory: state.inventory,
    profile: state.profile,
    logoCatalog: state.logoCatalog,
    activityHistory: state.activityHistory
  };
}

async function publicShopSetLogo(sessionToken, logoId) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const logoCatalog = await listLogoCatalog();
  const knownLogoIds = new Set(logoCatalog.map((entry) => entry.id));

  const normalizedLogoId = normalizePublicLogoId(logoId, knownLogoIds);
  if (!normalizedLogoId) {
    return {
      ok: false,
      error: "invalid_logo"
    };
  }

  return withNickLock(sessionResult.nick, async () => {
    const profile = await getProfile(sessionResult.nick);
    if (!profile.ownedLogoIds.includes(normalizedLogoId)) {
      return {
        ok: false,
        error: "logo_not_owned",
        profile
      };
    }

    const nextProfile = {
      ...profile,
      selectedLogoId: normalizedLogoId
    };
    const savedProfile = await saveProfile(sessionResult.nick, nextProfile);
    const inventory = await getInventory(sessionResult.nick);
    await touchPublicUser(sessionResult.nick, inventory, savedProfile);
    return {
      ok: true,
      nick: sessionResult.nick,
      profile: savedProfile,
      logoCatalog
    };
  });
}

async function adminListLogoCatalog() {
  return {
    ok: true,
    logoCatalog: await listLogoCatalog()
  };
}

async function adminGrantLogo(nick, logoId) {
  const normalizedNick = await ensurePlayer(nick);
  if (!normalizedNick) {
    return { ok: false, error: "missing_nick" };
  }

  const logoCatalog = await listLogoCatalog();
  const knownLogoIds = new Set(logoCatalog.map((entry) => entry.id));
  const normalizedLogoId = normalizePublicLogoId(logoId, knownLogoIds);
  if (!normalizedLogoId) {
    return { ok: false, error: "invalid_logo", logoCatalog };
  }

  const profile = await getProfile(normalizedNick);
  const nextOwnedLogoIds = profile.ownedLogoIds.includes(normalizedLogoId)
    ? profile.ownedLogoIds.slice()
    : [...profile.ownedLogoIds, normalizedLogoId];
  const savedProfile = await saveProfile(normalizedNick, {
    ...profile,
    ownedLogoIds: nextOwnedLogoIds
  });
  const inventory = await getInventory(normalizedNick);
  await touchPublicUser(normalizedNick, inventory, savedProfile);

  return {
    ok: true,
    nick: normalizedNick,
    profile: savedProfile,
    logoCatalog
  };
}

async function adminRevokeLogo(nick, logoId) {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return { ok: false, error: "missing_nick" };
  }

  const logoCatalog = await listLogoCatalog();
  const knownLogoIds = new Set(logoCatalog.map((entry) => entry.id));
  const normalizedLogoId = normalizePublicLogoId(logoId, knownLogoIds);
  if (!normalizedLogoId) {
    return { ok: false, error: "invalid_logo", logoCatalog };
  }
  if (normalizedLogoId === DEFAULT_LOGO_ID) {
    return { ok: false, error: "cannot_revoke_default", logoCatalog };
  }

  const profile = await getProfile(normalizedNick);
  const nextOwnedLogoIds = profile.ownedLogoIds.filter((entry) => entry !== normalizedLogoId);
  const savedProfile = await saveProfile(normalizedNick, {
    ...profile,
    ownedLogoIds: nextOwnedLogoIds,
    selectedLogoId: profile.selectedLogoId === normalizedLogoId ? DEFAULT_LOGO_ID : profile.selectedLogoId
  });
  const inventory = await getInventory(normalizedNick);
  await touchPublicUser(normalizedNick, inventory, savedProfile);

  return {
    ok: true,
    nick: normalizedNick,
    profile: savedProfile,
    logoCatalog
  };
}

async function publicShopListUsers(sessionToken) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  return {
    ok: true,
    users: await listPublicShopUsers()
  };
}

async function publicShopPurchase(sessionToken, itemKey, amount) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  return withNickLock(sessionResult.nick, async () => {
    const normalizedItemKey = String(itemKey || "").trim();
    let normalizedAmount = Math.max(1, Math.floor(Number(amount || 1)));
    const item = SHOP_ITEMS[normalizedItemKey];
    const inventory = await getInventory(sessionResult.nick);
    if (!item) {
      return {
        ok: false,
        error: "invalid_item",
        nick: sessionResult.nick,
        inventory
      };
    }

    const currencyKey = String(item.currencyKey || "pc");
    const currencyLabel = String(item.currencyLabel || (currencyKey === "polvoGema" ? "PG" : "PC"));
    const totalPrice = item.price * normalizedAmount;
    if (toNumber(inventory[currencyKey]) < totalPrice) {
      return {
        ok: false,
        error: `not_enough_${currencyKey}`,
        nick: sessionResult.nick,
        inventory,
        price: totalPrice,
        currencyKey,
        currencyLabel
      };
    }

    if (normalizedItemKey !== "llaves") {
      normalizedAmount = 1;
      if (getOwnedChainCount(inventory, normalizedItemKey) > 0) {
        return {
          ok: false,
          error: "already_owned",
          nick: sessionResult.nick,
          inventory,
          price: totalPrice,
          currencyKey,
          currencyLabel
        };
      }
    }

    const nextInventory = { ...inventory };
    nextInventory[currencyKey] = Math.max(0, toNumber(nextInventory[currencyKey]) - (item.price * normalizedAmount));
    nextInventory[normalizedItemKey] = toNumber(nextInventory[normalizedItemKey]) + normalizedAmount;

    const savedInventory = await saveInventory(sessionResult.nick, nextInventory);
    const profile = await getProfile(sessionResult.nick);
    await touchPublicUser(sessionResult.nick, savedInventory, profile);
    await updateRows("shop_access", {
      last_purchase_at: nowIso(),
      updated_at: nowIso()
    }, {
      nick: `eq.${sessionResult.nick}`
    }, { returning: "minimal" });
    await appendActivity(sessionResult.nick, "Tienda", `Compra ${item.label}`, `Compra de ${normalizedAmount} ${item.label} por ${item.price * normalizedAmount} ${currencyLabel}`);

    return {
      ok: true,
      nick: sessionResult.nick,
      itemKey: normalizedItemKey,
      amount: normalizedAmount,
      price: item.price * normalizedAmount,
      currencyKey,
      currencyLabel,
      inventory: savedInventory
    };
  });
}

async function publicShopUpgradeEquipment(sessionToken, gearType, usePerricita) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  return withNickLock(sessionResult.nick, async () => {
    const normalizedGearType = String(gearType || "").trim();
    if (!UPGRADE_PATHS[normalizedGearType]) {
      return {
        ok: false,
        error: "invalid_gear_type",
        nick: sessionResult.nick,
        inventory: await getInventory(sessionResult.nick)
      };
    }

    const inventory = await getInventory(sessionResult.nick);
    const currentStage = getUpgradeStage(inventory, normalizedGearType);
    if (!currentStage) {
      return {
        ok: false,
        error: "gear_not_owned",
        nick: sessionResult.nick,
        inventory
      };
    }

    if (currentStage.isMax) {
      return {
        ok: false,
        error: "already_max_tier",
        nick: sessionResult.nick,
        inventory,
        currentTier: currentStage.currentLabel
      };
    }

    if (toNumber(inventory.polvoGema) < currentStage.cost) {
      return {
        ok: false,
        error: "not_enough_polvoGema",
        nick: sessionResult.nick,
        inventory,
        currentTier: currentStage.currentLabel,
        nextTier: currentStage.nextLabel,
        requiredDust: currentStage.cost
      };
    }

    if (usePerricita && toNumber(inventory.perricita) <= 0) {
      return {
        ok: false,
        error: "not_enough_perricita",
        nick: sessionResult.nick,
        inventory,
        currentTier: currentStage.currentLabel,
        nextTier: currentStage.nextLabel
      };
    }

    const effectiveChance = Math.min(100, currentStage.baseChance + (usePerricita ? currentStage.perricitaBonus : 0));
    const success = Math.random() * 100 < effectiveChance;
    const nextInventory = { ...inventory };
    nextInventory.polvoGema = Math.max(0, toNumber(nextInventory.polvoGema) - currentStage.cost);
    if (usePerricita) {
      nextInventory.perricita = Math.max(0, toNumber(nextInventory.perricita) - 1);
    }
    if (success) {
      nextInventory[currentStage.currentKey] = Math.max(0, toNumber(nextInventory[currentStage.currentKey]) - 1);
      nextInventory[currentStage.nextKey] = toNumber(nextInventory[currentStage.nextKey]) + 1;
    }

    const savedInventory = await saveInventory(sessionResult.nick, nextInventory);
    const profile = await getProfile(sessionResult.nick);
    await touchPublicUser(sessionResult.nick, savedInventory, profile);
    await appendActivity(
      sessionResult.nick,
      "Equipamiento",
      success ? `Upgrade completado (${currentStage.nextLabel})` : `Upgrade fallido (${currentStage.currentLabel})`,
      `${currentStage.currentLabel} -> ${currentStage.nextLabel} | Coste: ${currentStage.cost} PG | Exito: ${effectiveChance}%${usePerricita ? " | Perricita: si" : " | Perricita: no"}`
    );

    return {
      ok: true,
      nick: sessionResult.nick,
      success,
      inventory: savedInventory,
      currentTier: currentStage.currentLabel,
      nextTier: currentStage.nextLabel,
      requiredDust: currentStage.cost,
      successChance: effectiveChance,
      usedPerricita: Boolean(usePerricita)
    };
  });
}

async function publicShopPlayCard(sessionToken, reward, cardNumber, forced, playId) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  return withNickLock(sessionResult.nick, async () => runIdempotentOperation(playId, "publicShopPlayCard", sessionResult.nick, async () => {
    const rewardDelta = buildCardRewardDelta(reward);
    let inventory = await getInventory(sessionResult.nick);
    if (!rewardDelta) {
      return {
        ok: false,
        error: "invalid_reward",
        nick: sessionResult.nick,
        inventory
      };
    }

    if (!forced && toNumber(inventory.monedas) <= 0) {
      return {
        ok: false,
        error: "no_monedas",
        nick: sessionResult.nick,
        inventory
      };
    }

    inventory = applyInventoryDelta(inventory, mergeInventoryDelta(forced ? {} : { monedas: -1 }, rewardDelta));
    const savedInventory = await saveInventory(sessionResult.nick, inventory);
    const profile = await getProfile(sessionResult.nick);
    await touchPublicUser(sessionResult.nick, savedInventory, profile);
    await appendActivity(sessionResult.nick, "Cartas", String(reward || "").trim(), `Carta ${Number(cardNumber || 0) || "?"}`);

    return {
      ok: true,
      nick: sessionResult.nick,
      reward: String(reward || "").trim(),
      inventory: savedInventory
    };
  }));
}

async function publicShopDestroyGem(sessionToken) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  return withNickLock(sessionResult.nick, async () => {
    const inventory = await getInventory(sessionResult.nick);
    if (toNumber(inventory.gemas) <= 0) {
      return {
        ok: false,
        error: "no_gemas",
        nick: sessionResult.nick,
        inventory
      };
    }

    const nextInventory = applyInventoryDelta(inventory, { gemas: -1, polvoGema: 3000 });
    const savedInventory = await saveInventory(sessionResult.nick, nextInventory);
    const profile = await getProfile(sessionResult.nick);
    await touchPublicUser(sessionResult.nick, savedInventory, profile);
    await appendActivity(sessionResult.nick, "Gemas", "Destruir gema", "Consumo de 1 gema para obtener 3000 de polvo de gema");

    return {
      ok: true,
      nick: sessionResult.nick,
      inventory: savedInventory
    };
  });
}

async function publicShopOpenChest(sessionToken, chestOpenId) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  if (!String(chestOpenId || "").trim()) {
    return {
      ok: false,
      error: "missing_chest_open_id",
      nick: sessionResult.nick,
      items: PUBLIC_SHOP_ITEMS
    };
  }

  return withNickLock(sessionResult.nick, async () => runIdempotentOperation(chestOpenId, "publicShopOpenChest", sessionResult.nick, async () => {
    let inventory = await getInventory(sessionResult.nick);
    const syncResult = await syncRandomKeyState(sessionResult.nick, inventory);
    inventory = syncResult.inventory;
    if (toNumber(inventory.llaves) <= 0) {
      return {
        ok: false,
        error: "no_llaves",
        nick: sessionResult.nick,
        inventory,
        randomKeyTickets: syncResult.randomKeyTickets,
        randomKeyClaims: await listRandomKeyClaimsForNick(sessionResult.nick),
        availableRandomKeys: await countAvailableRandomKeys(),
        items: PUBLIC_SHOP_ITEMS
      };
    }

    const rolledChest = rollChestReward();
    const timestamp = nowIso();
    let nextInventory = applyInventoryDelta(inventory, mergeInventoryDelta({ llaves: -1 }, rolledChest.reward.inventoryDelta));

    if (rolledChest.reward.label === "Random Key") {
      await appendRandomKeyTicket(sessionResult.nick, timestamp);
      nextInventory = { ...nextInventory, randomKey: toNumber(nextInventory.randomKey) + 1 };
    }

    const savedInventory = await saveInventory(sessionResult.nick, nextInventory);
    const finalSync = await syncRandomKeyState(sessionResult.nick, savedInventory);
    const profile = await getProfile(sessionResult.nick);
    await touchPublicUser(sessionResult.nick, finalSync.inventory, profile);
    await updateRows("shop_access", {
      last_purchase_at: nowIso(),
      updated_at: nowIso()
    }, {
      nick: `eq.${sessionResult.nick}`
    }, { returning: "minimal" });
    await appendActivity(sessionResult.nick, "Cofre", rolledChest.reward.label, rolledChest.chest.label);

    return {
      ok: true,
      nick: sessionResult.nick,
      chestVariant: rolledChest.chest.variant,
      chestLabel: rolledChest.chest.label,
      reward: rolledChest.reward.label,
      inventory: finalSync.inventory,
      randomKeyTickets: finalSync.randomKeyTickets,
      randomKeyClaims: await listRandomKeyClaimsForNick(sessionResult.nick),
      availableRandomKeys: await countAvailableRandomKeys(),
      items: PUBLIC_SHOP_ITEMS
    };
  }));
}

async function publicShopOpenInventoryChest(sessionToken, chestOpenId) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  if (!String(chestOpenId || "").trim()) {
    return {
      ok: false,
      error: "missing_chest_open_id",
      nick: sessionResult.nick,
      items: PUBLIC_SHOP_ITEMS
    };
  }

  return withNickLock(sessionResult.nick, async () => runIdempotentOperation(chestOpenId, "publicShopOpenInventoryChest", sessionResult.nick, async () => {
    const inventory = await getInventory(sessionResult.nick);
    if (toNumber(inventory.perriCofres) <= 0) {
      return {
        ok: false,
        error: "no_perri_chests",
        nick: sessionResult.nick,
        inventory,
        items: PUBLIC_SHOP_ITEMS
      };
    }
    if (toNumber(inventory.llaves) <= 0) {
      return {
        ok: false,
        error: "no_llaves",
        nick: sessionResult.nick,
        inventory,
        items: PUBLIC_SHOP_ITEMS
      };
    }

    const logoCatalog = await listLogoCatalog();
    const knownLogoIds = new Set(logoCatalog.map((entry) => entry.id));
    const profile = await getProfile(sessionResult.nick);
    const rewardBundle = buildPerriChestRewards(profile, logoCatalog);
    const nextInventory = applyInventoryDelta(
      inventory,
      mergeInventoryDelta({ llaves: -1, perriCofres: -1 }, getPerriChestInventoryDelta(rewardBundle))
    );
    const nextProfile = applyPerriChestProfileRewards(profile, rewardBundle, knownLogoIds);
    const savedInventory = await saveInventory(sessionResult.nick, nextInventory);
    const savedProfile = await saveProfile(sessionResult.nick, nextProfile);
    await touchPublicUser(sessionResult.nick, savedInventory, savedProfile);
    await updateRows("shop_access", {
      last_purchase_at: nowIso(),
      updated_at: nowIso()
    }, {
      nick: `eq.${sessionResult.nick}`
    }, { returning: "minimal" });
    await appendActivity(
      sessionResult.nick,
      "Perricofre",
      "Apertura desde inventario",
      formatPerriChestSummary(rewardBundle)
    );

    return {
      ok: true,
      nick: sessionResult.nick,
      inventory: savedInventory,
      profile: savedProfile,
      rewardBundle
    };
  }));
}

async function publicShopGetDuelTarget(sessionToken, defenderNick) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const normalizedDefenderNick = normalizeNick(defenderNick);
  if (!normalizedDefenderNick) {
    return {
      ok: false,
      error: "missing_defender_nick",
      nick: sessionResult.nick,
      attackerInventory: await getInventory(sessionResult.nick)
    };
  }

  if (normalizeNickKey(normalizedDefenderNick) === normalizeNickKey(sessionResult.nick)) {
    return {
      ok: false,
      error: "same_target",
      nick: sessionResult.nick,
      attackerInventory: await getInventory(sessionResult.nick)
    };
  }

  if (!await playerExists(normalizedDefenderNick)) {
    return {
      ok: false,
      error: "defender_not_found",
      nick: sessionResult.nick,
      attackerInventory: await getInventory(sessionResult.nick)
    };
  }

  const attackerInventory = await getInventory(sessionResult.nick);
  const defenderInventory = await getInventory(normalizedDefenderNick);
  return {
    ok: true,
    nick: sessionResult.nick,
    attackerNick: sessionResult.nick,
    defenderNick: normalizedDefenderNick,
    attackerInventory,
    defenderInventory,
    duelCount: toNumber(attackerInventory.duelo)
  };
}

async function publicShopPerformAttack(sessionToken, defenderNick) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const normalizedDefenderNick = normalizeNick(defenderNick);
  if (!normalizedDefenderNick) {
    return {
      ok: false,
      error: "missing_defender_nick",
      nick: sessionResult.nick,
      attackerInventory: await getInventory(sessionResult.nick)
    };
  }

  if (normalizeNickKey(normalizedDefenderNick) === normalizeNickKey(sessionResult.nick)) {
    return {
      ok: false,
      error: "same_target",
      nick: sessionResult.nick,
      attackerInventory: await getInventory(sessionResult.nick)
    };
  }

  if (!await playerExists(normalizedDefenderNick)) {
    return {
      ok: false,
      error: "defender_not_found",
      nick: sessionResult.nick,
      attackerInventory: await getInventory(sessionResult.nick)
    };
  }

  const attackerInventory = await getInventory(sessionResult.nick);
  const defenderInventory = await getInventory(normalizedDefenderNick);
  const weaponKey = getEquippedAttackWeaponKey(attackerInventory);
  const shieldKey = getEquippedDefenseShieldKey(defenderInventory);
  const outcome = resolvePublicDuelOutcome(attackerInventory, defenderInventory, weaponKey, shieldKey);
  const result = await adminPerformAttack(sessionResult.nick, normalizedDefenderNick, weaponKey, shieldKey, outcome, false);
  return {
    ...result,
    attackerNick: sessionResult.nick,
    defenderNick: normalizedDefenderNick,
    weapon: weaponKey,
    shieldType: shieldKey,
    outcome: result?.outcome || outcome
  };
}

async function publicShopRedeemRandomKey(sessionToken, redeemId) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  if (!String(redeemId || "").trim()) {
    return {
      ok: false,
      error: "missing_redeem_id",
      nick: sessionResult.nick,
      items: PUBLIC_SHOP_ITEMS
    };
  }

  return withNickLock(sessionResult.nick, async () => runIdempotentOperation(redeemId, "publicShopRedeemRandomKey", sessionResult.nick, async () => {
    let inventory = await getInventory(sessionResult.nick);
    const syncResult = await syncRandomKeyState(sessionResult.nick, inventory);
    inventory = syncResult.inventory;
    if (toNumber(inventory.randomKey) <= 0) {
      return {
        ok: false,
        error: "no_random_key",
        nick: sessionResult.nick,
        inventory,
        randomKeyTickets: syncResult.randomKeyTickets,
        randomKeyClaims: await listRandomKeyClaimsForNick(sessionResult.nick),
        availableRandomKeys: await countAvailableRandomKeys(),
        items: PUBLIC_SHOP_ITEMS
      };
    }

    const availableEntries = await fetchRows("shop_random_key_pool", {
      select: "id,game,key",
      filters: {
        status: `eq.${RANDOM_KEY_CONFIG.availableStatus}`
      }
    });

    if (!availableEntries.length) {
      return {
        ok: false,
        error: "no_random_keys_available",
        nick: sessionResult.nick,
        inventory,
        randomKeyTickets: syncResult.randomKeyTickets,
        randomKeyClaims: await listRandomKeyClaimsForNick(sessionResult.nick),
        availableRandomKeys: 0,
        items: PUBLIC_SHOP_ITEMS
      };
    }

    const selectedEntry = availableEntries[Math.floor(Math.random() * availableEntries.length)];
    const activeTicketRows = await fetchRows("shop_random_key_tickets", {
      select: "id,obtained_at",
      filters: {
        nick: `eq.${sessionResult.nick}`,
        status: `eq.${RANDOM_KEY_CONFIG.ticketActiveStatus}`
      },
      orderBy: "obtained_at.asc",
      limit: 1
    });
    const oldestTicket = activeTicketRows[0] || null;
    if (oldestTicket) {
      await updateRows("shop_random_key_tickets", {
        status: RANDOM_KEY_CONFIG.ticketRedeemedStatus,
        updated_at: nowIso()
      }, {
        id: `eq.${oldestTicket.id}`
      }, { returning: "minimal" });
    }

    await updateRows("shop_random_key_pool", {
      status: RANDOM_KEY_CONFIG.deliveredStatus,
      assigned_to: sessionResult.nick,
      delivered_at: nowIso()
    }, {
      id: `eq.${selectedEntry.id}`
    }, { returning: "minimal" });

    await insertRow("shop_random_key_claims", {
      id: crypto.randomUUID(),
      nick: sessionResult.nick,
      game: String(selectedEntry.game || "").trim(),
      key: String(selectedEntry.key || "").trim(),
      claimed_at: nowIso()
    }, { returning: "minimal" });

    const finalSync = await syncRandomKeyState(sessionResult.nick, inventory);
    const profile = await getProfile(sessionResult.nick);
    await touchPublicUser(sessionResult.nick, finalSync.inventory, profile);
    await updateRows("shop_access", {
      last_purchase_at: nowIso(),
      updated_at: nowIso()
    }, {
      nick: `eq.${sessionResult.nick}`
    }, { returning: "minimal" });
    await appendActivity(sessionResult.nick, "Random Key", `Canje ${selectedEntry.game}`, `Juego: ${selectedEntry.game}`);

    return {
      ok: true,
      nick: sessionResult.nick,
      inventory: finalSync.inventory,
      redeemedRandomKey: {
        game: String(selectedEntry.game || "").trim(),
        key: String(selectedEntry.key || "").trim(),
        claimedAt: nowIso()
      },
      randomKeyTickets: finalSync.randomKeyTickets,
      randomKeyClaims: await listRandomKeyClaimsForNick(sessionResult.nick),
      availableRandomKeys: await countAvailableRandomKeys(),
      items: PUBLIC_SHOP_ITEMS
    };
  }));
}

async function publicShopClearRandomKeyClaims(sessionToken, clearId) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  if (!String(clearId || "").trim()) {
    return {
      ok: false,
      error: "missing_clear_id",
      nick: sessionResult.nick,
      items: PUBLIC_SHOP_ITEMS
    };
  }

  return withNickLock(sessionResult.nick, async () => runIdempotentOperation(clearId, "publicShopClearRandomKeyClaims", sessionResult.nick, async () => {
    const deletedRows = await deleteRows("shop_random_key_claims", {
      nick: `eq.${sessionResult.nick}`
    });
    const inventory = await getInventory(sessionResult.nick);
    const syncResult = await syncRandomKeyState(sessionResult.nick, inventory);
    return {
      ok: true,
      nick: sessionResult.nick,
      removedCount: Array.isArray(deletedRows) ? deletedRows.length : 0,
      inventory: syncResult.inventory,
      randomKeyTickets: syncResult.randomKeyTickets,
      randomKeyClaims: [],
      availableRandomKeys: await countAvailableRandomKeys(),
      items: PUBLIC_SHOP_ITEMS
    };
  }));
}

async function publicShopCraftKey(sessionToken) {
  return publicShopPurchase(sessionToken, "llaves", 1);
}

async function adminGetInventory(nick) {
  const normalizedNick = normalizeNick(nick);
  if (!normalizedNick) {
    return {
      ok: true,
      nick: "",
      inventory: defaultInventory(),
      randomKeyTickets: []
    };
  }

  const row = await fetchRow("shop_inventories", {
    filters: {
      nick: `eq.${normalizedNick}`
    }
  });

  if (!row) {
    return {
      ok: true,
      nick: normalizedNick,
      inventory: defaultInventory(),
      randomKeyTickets: []
    };
  }

  const inventory = rowToInventory(row);
  const syncResult = await syncRandomKeyState(normalizedNick, inventory);
  return {
    ok: true,
    nick: normalizedNick,
    inventory: syncResult.inventory,
    randomKeyTickets: syncResult.randomKeyTickets
  };
}

async function adminListInventory() {
  const rows = await fetchRows("shop_inventories", {
    select: "*",
    orderBy: "nick.asc"
  });

  return {
    ok: true,
    players: rows
      .map((row) => ({
        nick: normalizeNick(row.nick),
        inventory: rowToInventory(row),
        updatedAt: String(row.updated_at || "")
      }))
      .filter((entry) => entry.nick)
  };
}

async function adminAddInventoryItem(nick, resourceKey, amount) {
  const normalizedNick = await ensurePlayer(nick);
  const normalizedKey = String(resourceKey || "").trim();
  const normalizedAmount = Math.max(1, Math.floor(Number(amount || 1)));
  if (!INVENTORY_KEYS.includes(normalizedKey)) {
    return {
      ok: false,
      error: "invalid_resource",
      nick: normalizedNick
    };
  }

  const inventory = await getInventory(normalizedNick);
  const nextInventory = { ...inventory, [normalizedKey]: toNumber(inventory[normalizedKey]) + normalizedAmount };
  const savedInventory = await saveInventory(normalizedNick, nextInventory);
  const profile = await getProfile(normalizedNick);
  await touchPublicUser(normalizedNick, savedInventory, profile);
  await appendActivity(normalizedNick, "Panel OBS", `+${normalizedAmount} ${normalizedKey}`, "Incremento manual desde overlay OBS");

  return {
    ok: true,
    nick: normalizedNick,
    inventory: savedInventory
  };
}

async function adminConsumeResource(nick, resourceKey, amount, activity = null) {
  const normalizedNick = await ensurePlayer(nick);
  const normalizedKey = String(resourceKey || "").trim();
  const normalizedAmount = Math.max(1, Math.floor(Number(amount || 1)));
  if (!INVENTORY_KEYS.includes(normalizedKey)) {
    return {
      ok: false,
      error: "invalid_resource",
      nick: normalizedNick
    };
  }

  const inventory = await getInventory(normalizedNick);
  if (toNumber(inventory[normalizedKey]) < normalizedAmount) {
    return {
      ok: false,
      error: `no_${normalizedKey}`,
      nick: normalizedNick,
      inventory
    };
  }

  const nextInventory = { ...inventory, [normalizedKey]: Math.max(0, toNumber(inventory[normalizedKey]) - normalizedAmount) };
  const savedInventory = await saveInventory(normalizedNick, nextInventory);
  const profile = await getProfile(normalizedNick);
  await touchPublicUser(normalizedNick, savedInventory, profile);
  if (activity && activity.game) {
    await appendActivity(normalizedNick, activity.game, activity.result || "", activity.details || "");
  }

  return {
    ok: true,
    nick: normalizedNick,
    inventory: savedInventory
  };
}

async function adminConsumeCoin(nick, operationId) {
  return withNickLock(nick, async () => runIdempotentOperation(operationId, "adminConsumeCoin", nick, async () => (
    adminConsumeResource(nick, "monedas", 1, {
      game: "Cartas",
      result: "Uso moneda",
      details: "Consumo de 1 moneda para jugar a Cartas"
    })
  )));
}

async function adminConsumeKey(nick) {
  return withNickLock(nick, async () => adminConsumeResource(nick, "llaves", 1));
}

async function adminActivatePremium(nick) {
  const normalizedNick = await ensurePlayer(nick);
  return withNickLock(normalizedNick, async () => {
    const inventory = await getInventory(normalizedNick);
    if (toNumber(inventory.polvoGema) < 500) {
      return {
        ok: false,
        error: "not_enough_polvoGema",
        nick: normalizedNick,
        inventory
      };
    }

    const nextInventory = applyInventoryDelta(inventory, { polvoGema: -500 });
    const savedInventory = await saveInventory(normalizedNick, nextInventory);
    const profile = await getProfile(normalizedNick);
    await touchPublicUser(normalizedNick, savedInventory, profile);
    await appendActivity(normalizedNick, "Ruleta", "Activacion Premium", "Coste: 500 PG | Tirada: 1");
    return {
      ok: true,
      nick: normalizedNick,
      inventory: savedInventory
    };
  });
}

async function adminPlayCard(nick, reward, cardNumber, forced, playId) {
  const normalizedNick = await ensurePlayer(nick);
  return withNickLock(normalizedNick, async () => runIdempotentOperation(playId, "adminPlayCard", normalizedNick, async () => {
    const rewardDelta = buildCardRewardDelta(reward);
    let inventory = await getInventory(normalizedNick);
    if (!rewardDelta) {
      return {
        ok: false,
        error: "invalid_reward",
        nick: normalizedNick,
        inventory
      };
    }
    if (!forced && toNumber(inventory.monedas) <= 0) {
      return {
        ok: false,
        error: "no_monedas",
        nick: normalizedNick,
        inventory
      };
    }

    inventory = applyInventoryDelta(inventory, mergeInventoryDelta(forced ? {} : { monedas: -1 }, rewardDelta));
    const savedInventory = await saveInventory(normalizedNick, inventory);
    const profile = await getProfile(normalizedNick);
    await touchPublicUser(normalizedNick, savedInventory, profile);
    await appendActivity(normalizedNick, "Cartas", String(reward || "").trim(), `Carta ${Number(cardNumber || 0) || "?"}${forced ? " | Tirada gratis" : ""}`);
    return {
      ok: true,
      nick: normalizedNick,
      reward: String(reward || "").trim(),
      inventory: savedInventory
    };
  }));
}

async function adminSpinRuleta(nick, reward, premiumMode, spinId) {
  const normalizedNick = await ensurePlayer(nick);
  return withNickLock(normalizedNick, async () => runIdempotentOperation(spinId, "adminSpinRuleta", normalizedNick, async () => {
    const rewardDelta = buildRuletaRewardDelta(reward);
    let inventory = await getInventory(normalizedNick);
    if (!rewardDelta) {
      return {
        ok: false,
        error: "invalid_reward",
        nick: normalizedNick,
        inventory
      };
    }

    inventory = applyInventoryDelta(inventory, rewardDelta);
    const savedInventory = await saveInventory(normalizedNick, inventory);
    const profile = await getProfile(normalizedNick);
    await touchPublicUser(normalizedNick, savedInventory, profile);
    await appendActivity(
      normalizedNick,
      "Ruleta",
      String(reward || "").trim(),
      premiumMode ? "Modo premium" : ""
    );
    return {
      ok: true,
      nick: normalizedNick,
      reward: String(reward || "").trim(),
      inventory: savedInventory
    };
  }));
}

async function adminOpenChest(nick, reward, forced, chestVariant, chestLabel, openId) {
  const normalizedNick = await ensurePlayer(nick);
  return withNickLock(normalizedNick, async () => runIdempotentOperation(openId, "adminOpenChest", normalizedNick, async () => {
    const rewardEntry = getChestRewardEntryByLabel(reward);
    let inventory = await getInventory(normalizedNick);
    if (!rewardEntry || !rewardEntry.reward) {
      return {
        ok: false,
        error: "invalid_reward",
        nick: normalizedNick,
        inventory
      };
    }
    if (!forced && toNumber(inventory.llaves) <= 0) {
      return {
        ok: false,
        error: "no_llaves",
        nick: normalizedNick,
        inventory
      };
    }

    const resolvedChestVariant = String(chestVariant || rewardEntry.chest.variant || "").trim();
    const resolvedChestLabel = String(chestLabel || rewardEntry.chest.label || "").trim();
    const rewardDelta = rewardEntry.reward.inventoryDelta || {};
    const timestamp = nowIso();
    let nextInventory = applyInventoryDelta(inventory, mergeInventoryDelta(forced ? {} : { llaves: -1 }, rewardDelta));

    if (String(rewardEntry.reward.label || "").trim() === "Random Key") {
      await appendRandomKeyTicket(normalizedNick, timestamp);
      nextInventory = { ...nextInventory, randomKey: toNumber(nextInventory.randomKey) + 1 };
    }

    const savedInventory = await saveInventory(normalizedNick, nextInventory);
    const finalSync = await syncRandomKeyState(normalizedNick, savedInventory);
    const profile = await getProfile(normalizedNick);
    await touchPublicUser(normalizedNick, finalSync.inventory, profile);
    await appendActivity(normalizedNick, "Cofre", String(reward || "").trim(), resolvedChestLabel + (forced ? " | Tirada gratis" : ""));
    return {
      ok: true,
      nick: normalizedNick,
      chestVariant: resolvedChestVariant,
      chestLabel: resolvedChestLabel,
      reward: String(reward || "").trim(),
      inventory: finalSync.inventory,
      randomKeyTickets: finalSync.randomKeyTickets
    };
  }));
}

async function adminApplyLog(nick, game, result, details, inventoryDelta = {}) {
  const normalizedNick = await ensurePlayer(nick);
  return withNickLock(normalizedNick, async () => {
    const inventory = await getInventory(normalizedNick);
    const nextInventory = applyInventoryDelta(inventory, inventoryDelta || {});
    const savedInventory = await saveInventory(normalizedNick, nextInventory);
    const profile = await getProfile(normalizedNick);
    await touchPublicUser(normalizedNick, savedInventory, profile);
    await appendActivity(normalizedNick, String(game || "").trim(), String(result || "").trim(), String(details || "").trim());
    return {
      ok: true,
      nick: normalizedNick,
      inventory: savedInventory
    };
  });
}

async function adminDestroyGem(nick) {
  const normalizedNick = await ensurePlayer(nick);
  return withNickLock(normalizedNick, async () => {
    const inventory = await getInventory(normalizedNick);
    if (toNumber(inventory.gemas) <= 0) {
      return {
        ok: false,
        error: "no_gemas",
        nick: normalizedNick,
        inventory
      };
    }

    const nextInventory = applyInventoryDelta(inventory, { gemas: -1, polvoGema: 3000 });
    const savedInventory = await saveInventory(normalizedNick, nextInventory);
    const profile = await getProfile(normalizedNick);
    await touchPublicUser(normalizedNick, savedInventory, profile);
    await appendActivity(normalizedNick, "Gemas", "Destruir gema", "Consumo de 1 gema para obtener 3000 de polvo de gema");
    return {
      ok: true,
      nick: normalizedNick,
      inventory: savedInventory
    };
  });
}

async function adminPurchaseShopItem(nick, itemKey, amount) {
  const normalizedNick = await ensurePlayer(nick);
  return withNickLock(normalizedNick, async () => {
    const normalizedItemKey = String(itemKey || "").trim();
    let normalizedAmount = Math.max(1, Math.floor(Number(amount || 1)));
    const item = SHOP_ITEMS[normalizedItemKey];
    const inventory = await getInventory(normalizedNick);
    if (!item) {
      return {
        ok: false,
        error: "invalid_item",
        nick: normalizedNick,
        inventory
      };
    }

    const currencyKey = String(item.currencyKey || "pc");
    const currencyLabel = String(item.currencyLabel || (currencyKey === "polvoGema" ? "PG" : "PC"));
    const totalPrice = item.price * normalizedAmount;
    if (toNumber(inventory[currencyKey]) < totalPrice) {
      return {
        ok: false,
        error: `not_enough_${currencyKey}`,
        nick: normalizedNick,
        inventory,
        price: totalPrice,
        currencyKey,
        currencyLabel
      };
    }

    if (normalizedItemKey !== "llaves") {
      normalizedAmount = 1;
      if (getOwnedChainCount(inventory, normalizedItemKey) > 0) {
        return {
          ok: false,
          error: "already_owned",
          nick: normalizedNick,
          inventory,
          price: totalPrice,
          currencyKey,
          currencyLabel
        };
      }
    }

    const nextInventory = { ...inventory };
    nextInventory[currencyKey] = Math.max(0, toNumber(nextInventory[currencyKey]) - (item.price * normalizedAmount));
    nextInventory[normalizedItemKey] = toNumber(nextInventory[normalizedItemKey]) + normalizedAmount;
    const savedInventory = await saveInventory(normalizedNick, nextInventory);
    const profile = await getProfile(normalizedNick);
    await touchPublicUser(normalizedNick, savedInventory, profile);
    await appendActivity(normalizedNick, "Tienda", `Compra ${item.label}`, `Compra de ${normalizedAmount} ${item.label} por ${item.price * normalizedAmount} ${currencyLabel}`);
    return {
      ok: true,
      nick: normalizedNick,
      itemKey: normalizedItemKey,
      amount: normalizedAmount,
      price: item.price * normalizedAmount,
      currencyKey,
      currencyLabel,
      inventory: savedInventory
    };
  });
}

async function adminUpgradeEquipment(nick, gearType, usePerricita) {
  const normalizedNick = await ensurePlayer(nick);
  return withNickLock(normalizedNick, async () => {
    const normalizedGearType = String(gearType || "").trim();
    if (!UPGRADE_PATHS[normalizedGearType]) {
      return {
        ok: false,
        error: "invalid_gear_type",
        nick: normalizedNick,
        inventory: await getInventory(normalizedNick)
      };
    }

    const inventory = await getInventory(normalizedNick);
    const currentStage = getUpgradeStage(inventory, normalizedGearType);
    if (!currentStage) {
      return {
        ok: false,
        error: "gear_not_owned",
        nick: normalizedNick,
        inventory
      };
    }

    if (currentStage.isMax) {
      return {
        ok: false,
        error: "already_max_tier",
        nick: normalizedNick,
        inventory,
        currentTier: currentStage.currentLabel
      };
    }

    if (toNumber(inventory.polvoGema) < currentStage.cost) {
      return {
        ok: false,
        error: "not_enough_polvoGema",
        nick: normalizedNick,
        inventory,
        currentTier: currentStage.currentLabel,
        nextTier: currentStage.nextLabel,
        requiredDust: currentStage.cost
      };
    }

    if (usePerricita && toNumber(inventory.perricita) <= 0) {
      return {
        ok: false,
        error: "not_enough_perricita",
        nick: normalizedNick,
        inventory,
        currentTier: currentStage.currentLabel,
        nextTier: currentStage.nextLabel
      };
    }

    const effectiveChance = Math.min(100, currentStage.baseChance + (usePerricita ? currentStage.perricitaBonus : 0));
    const success = Math.random() * 100 < effectiveChance;
    const nextInventory = { ...inventory };
    nextInventory.polvoGema = Math.max(0, toNumber(nextInventory.polvoGema) - currentStage.cost);
    if (usePerricita) {
      nextInventory.perricita = Math.max(0, toNumber(nextInventory.perricita) - 1);
    }
    if (success) {
      nextInventory[currentStage.currentKey] = Math.max(0, toNumber(nextInventory[currentStage.currentKey]) - 1);
      nextInventory[currentStage.nextKey] = toNumber(nextInventory[currentStage.nextKey]) + 1;
    }

    const savedInventory = await saveInventory(normalizedNick, nextInventory);
    const profile = await getProfile(normalizedNick);
    await touchPublicUser(normalizedNick, savedInventory, profile);
    await appendActivity(
      normalizedNick,
      "Equipamiento",
      success ? `Upgrade completado (${currentStage.nextLabel})` : `Upgrade fallido (${currentStage.currentLabel})`,
      `${currentStage.currentLabel} -> ${currentStage.nextLabel} | Coste: ${currentStage.cost} PG | Exito: ${effectiveChance}%${usePerricita ? " | Perricita: si" : " | Perricita: no"}`
    );
    return {
      ok: true,
      nick: normalizedNick,
      success,
      inventory: savedInventory,
      currentTier: currentStage.currentLabel,
      nextTier: currentStage.nextLabel,
      requiredDust: currentStage.cost,
      successChance: effectiveChance,
      usedPerricita: Boolean(usePerricita)
    };
  });
}

async function withAttackLock(attackerNick, defenderNick, worker) {
  const keys = [normalizeNick(attackerNick), normalizeNick(defenderNick)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return withNickLock(keys.join("|"), worker);
}

async function adminPerformAttack(attackerNick, defenderNick, weapon, shieldType, outcome, force) {
  const normalizedAttackerNick = await ensurePlayer(attackerNick);
  const normalizedDefenderNick = await ensurePlayer(defenderNick);
  const normalizedWeapon = ["espadaLv1", "espadaLv2", "espadaLv3", "espadaLegendaria"].includes(String(weapon || "").trim())
    ? String(weapon || "").trim()
    : (String(weapon || "").trim() === "espada" ? "espadaLv1" : "");
  const normalizedShieldType = ["escudo", "escudoMadera", "escudoMetal", "escudoLegendario"].includes(String(shieldType || "").trim())
    ? String(shieldType || "").trim()
    : "";
  const normalizedOutcome = String(outcome || "-").trim() || "-";

  return withAttackLock(normalizedAttackerNick, normalizedDefenderNick, async () => {
    const attackerInventory = await getInventory(normalizedAttackerNick);
    const defenderInventory = await getInventory(normalizedDefenderNick);
    if (!force && toNumber(attackerInventory.duelo) <= 0) {
      return {
        ok: false,
        error: "no_duelo",
        attackerInventory,
        defenderInventory
      };
    }

    const weaponInventoryKey = normalizedWeapon === "espadaLv1" ? "espada" : normalizedWeapon;
    if (!weaponInventoryKey || toNumber(attackerInventory[weaponInventoryKey]) <= 0) {
      return {
        ok: false,
        error: `no_${normalizedWeapon || "espada"}`,
        attackerInventory,
        defenderInventory
      };
    }

    const shieldInventoryKey = normalizedShieldType === "escudo" ? "escudo" : normalizedShieldType;
    if (shieldInventoryKey && toNumber(defenderInventory[shieldInventoryKey]) <= 0) {
      return {
        ok: false,
        error: `no_${normalizedShieldType}`,
        attackerInventory,
        defenderInventory
      };
    }

    const nextAttackerInventory = { ...attackerInventory };
    const nextDefenderInventory = { ...defenderInventory };
    if (!force) {
      nextAttackerInventory.duelo = Math.max(0, toNumber(nextAttackerInventory.duelo) - 1);
    }

    let transferredPc = 0;
    if (normalizedOutcome === "Impacto") {
      transferredPc = Math.max(0, Math.min(toNumber(nextDefenderInventory.pc), 1500));
      nextDefenderInventory.pc = Math.max(0, toNumber(nextDefenderInventory.pc) - transferredPc);
      nextAttackerInventory.pc = toNumber(nextAttackerInventory.pc) + transferredPc;
    } else {
      transferredPc = Math.max(0, Math.min(toNumber(nextAttackerInventory.pc), 500));
      nextAttackerInventory.pc = Math.max(0, toNumber(nextAttackerInventory.pc) - transferredPc);
      nextDefenderInventory.pc = toNumber(nextDefenderInventory.pc) + transferredPc;
    }

    const savedAttackerInventory = await saveInventory(normalizedAttackerNick, nextAttackerInventory);
    const savedDefenderInventory = await saveInventory(normalizedDefenderNick, nextDefenderInventory);
    const attackerProfile = await getProfile(normalizedAttackerNick);
    const defenderProfile = await getProfile(normalizedDefenderNick);
    await touchPublicUser(normalizedAttackerNick, savedAttackerInventory, attackerProfile);
    await touchPublicUser(normalizedDefenderNick, savedDefenderInventory, defenderProfile);
    await appendActivity(
      normalizedAttackerNick,
      "Ataque",
      normalizedOutcome,
      `Atacante: ${normalizedAttackerNick} | Victima: ${normalizedDefenderNick} | Arma: ${normalizedWeapon || "sin arma"} | Escudo: ${normalizedShieldType || "ninguno"} | Duelos gastados: ${force ? 0 : 1} | PC transferidos: ${transferredPc}${force ? " | Tirada gratis: si" : ""}`
    );

    return {
      ok: true,
      outcome: normalizedOutcome,
      transferredPc,
      attackerInventory: savedAttackerInventory,
      defenderInventory: savedDefenderInventory
    };
  });
}

async function adminUpsertWebAccess(nick, password, active) {
  const normalizedNick = normalizeNick(nick);
  const normalizedPassword = String(password || "").trim();
  if (!normalizedNick) {
    return {
      ok: false,
      error: "missing_nick"
    };
  }

  if (!normalizedPassword) {
    return {
      ok: false,
      error: "missing_password"
    };
  }

  const activeValue = active === false ? false : true;
  await ensurePlayer(normalizedNick);
  await upsertRow("shop_access", {
    nick: normalizedNick,
    code_hash: sha256(normalizedPassword),
    active: activeValue,
    updated_at: nowIso()
  }, "nick", { returning: "minimal" });

  return {
    ok: true,
    nick: normalizedNick,
    active: activeValue
  };
}

async function publicShopGetNotifications(sessionToken) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  return {
    ok: true,
    nick: sessionResult.nick,
    notifications: await listNotificationsForNick(sessionResult.nick),
    unreadNotificationCount: await countUnreadNotificationsForNick(sessionResult.nick)
  };
}

async function publicShopReadNotification(sessionToken, notificationId) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  await markNotificationRead(sessionResult.nick, notificationId);
  return {
    ok: true,
    nick: sessionResult.nick,
    notifications: await listNotificationsForNick(sessionResult.nick),
    unreadNotificationCount: await countUnreadNotificationsForNick(sessionResult.nick)
  };
}

async function publicShopReadAllNotifications(sessionToken) {
  const sessionResult = await requireSession(sessionToken);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  await markAllNotificationsRead(sessionResult.nick);
  return {
    ok: true,
    nick: sessionResult.nick,
    notifications: await listNotificationsForNick(sessionResult.nick),
    unreadNotificationCount: await countUnreadNotificationsForNick(sessionResult.nick)
  };
}

async function adminBroadcastNotification(kind, title, message, actionUrl = "") {
  const normalizedKind = String(kind || "").trim();
  const normalizedTitle = String(title || "").trim();
  const normalizedMessage = String(message || "").trim();
  const normalizedActionUrl = String(actionUrl || "").trim();

  if (!normalizedKind || !Object.values(NOTIFICATION_KINDS).includes(normalizedKind)) {
    return {
      ok: false,
      error: "invalid_notification_kind"
    };
  }

  if (!normalizedTitle && !normalizedMessage) {
    return {
      ok: false,
      error: "missing_notification_copy"
    };
  }

  const players = await fetchRows("shop_players", {
    select: "nick",
    filters: {
      active: "eq.true"
    }
  });

  const nicks = players.map((row) => normalizeNick(row.nick)).filter(Boolean);
  await Promise.all(nicks.map((nick) => appendNotification(
    nick,
    normalizedKind,
    normalizedTitle,
    normalizedMessage,
    {},
    normalizedActionUrl
  )));

  return {
    ok: true,
    count: nicks.length
  };
}

async function handleShopAction(payload) {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: "supabase_not_configured"
    };
  }

  const action = String(payload && payload.action ? payload.action : "").trim();
  switch (action) {
    case "publicShopLogin":
      return publicShopLogin(payload.nick, payload.accessCode);
    case "publicShopRefresh":
      return publicShopRefresh(payload.sessionToken);
    case "publicShopGetProfile":
      return publicShopGetProfile(payload.sessionToken);
    case "publicShopGetNotifications":
      return publicShopGetNotifications(payload.sessionToken);
    case "publicShopReadNotification":
      return publicShopReadNotification(payload.sessionToken, payload.notificationId);
    case "publicShopReadAllNotifications":
      return publicShopReadAllNotifications(payload.sessionToken);
    case "publicShopGetActivationLink":
      return publicShopGetActivationLink(payload.activationToken);
    case "publicShopActivateAccount":
      return publicShopActivateAccount(payload.activationToken, payload.password);
    case "publicShopGetPerriChest":
      return publicShopGetPerriChest(payload.sessionToken, payload.chestToken);
    case "publicShopRedeemPerriChest":
      return publicShopRedeemPerriChest(payload.sessionToken, payload.chestToken, payload.redeemId);
    case "publicShopSetLogo":
      return publicShopSetLogo(payload.sessionToken, payload.logoId);
    case "adminListLogoCatalog":
      return adminListLogoCatalog();
    case "adminBroadcastNotification":
      return adminBroadcastNotification(payload.kind, payload.title, payload.message, payload.actionUrl);
    case "adminCreatePerriChests":
      return adminCreatePerriChests(payload.quantity, payload.issuedLabel, payload.issuedNote, payload.expiresAt);
    case "adminCreateAccountActivationLink":
      return adminCreateAccountActivationLink(payload.nick, payload.expiresAt, payload.issuedNote);
    case "adminListAccountActivationLinks":
      return adminListAccountActivationLinks(payload.limit);
    case "adminListPerriChests":
      return adminListPerriChests(payload.limit);
    case "adminGrantLogo":
      return adminGrantLogo(payload.nick, payload.logoId);
    case "adminRevokeLogo":
      return adminRevokeLogo(payload.nick, payload.logoId);
    case "publicShopListUsers":
      return publicShopListUsers(payload.sessionToken);
    case "publicShopPurchase":
      return publicShopPurchase(payload.sessionToken, payload.itemKey, payload.amount);
    case "publicShopUpgradeEquipment":
      return publicShopUpgradeEquipment(payload.sessionToken, payload.gearType, payload.usePerricita);
    case "publicShopCraftKey":
      return publicShopCraftKey(payload.sessionToken);
    case "publicShopPlayCard":
      return publicShopPlayCard(payload.sessionToken, payload.reward, payload.card, payload.forced, payload.playId);
    case "publicShopDestroyGem":
      return publicShopDestroyGem(payload.sessionToken);
    case "publicShopOpenChest":
      return publicShopOpenChest(payload.sessionToken, payload.chestOpenId || payload.operationId);
    case "publicShopOpenInventoryChest":
      return publicShopOpenInventoryChest(payload.sessionToken, payload.chestOpenId || payload.operationId);
    case "publicShopGetDuelTarget":
      return publicShopGetDuelTarget(payload.sessionToken, payload.defenderNick);
    case "publicShopPerformAttack":
      return publicShopPerformAttack(payload.sessionToken, payload.defenderNick);
    case "publicShopRedeemRandomKey":
      return publicShopRedeemRandomKey(payload.sessionToken, payload.redeemId);
    case "publicShopClearRandomKeyClaims":
      return publicShopClearRandomKeyClaims(payload.sessionToken, payload.clearId);
    case "adminUpsertWebAccess":
      return adminUpsertWebAccess(payload.nick, payload.password, payload.active);
    case "adminGetInventory":
      return adminGetInventory(payload.nick);
    case "adminListInventory":
      return adminListInventory();
    case "adminAddInventoryItem":
      return adminAddInventoryItem(payload.nick, payload.resourceKey, payload.amount);
    case "adminConsumeCoin":
      return adminConsumeCoin(payload.nick, payload.operationId);
    case "adminConsumeKey":
      return adminConsumeKey(payload.nick);
    case "adminActivatePremium":
      return adminActivatePremium(payload.nick);
    case "adminPlayCard":
      return adminPlayCard(payload.nick, payload.reward, payload.card, payload.forced, payload.playId);
    case "adminSpinRuleta":
      return adminSpinRuleta(payload.nick, payload.reward, payload.premiumMode, payload.spinId);
    case "adminOpenChest":
      return adminOpenChest(payload.nick, payload.reward, payload.forced, payload.chestVariant, payload.chestLabel, payload.openId);
    case "adminApplyLog":
      return adminApplyLog(payload.nick, payload.game, payload.result, payload.details, payload.inventoryDelta || {});
    case "adminDestroyGem":
      return adminDestroyGem(payload.nick);
    case "adminPurchaseShopItem":
      return adminPurchaseShopItem(payload.nick, payload.itemKey, payload.amount);
    case "adminUpgradeEquipment":
      return adminUpgradeEquipment(payload.nick, payload.gearType, payload.usePerricita);
    case "adminPerformAttack":
      return adminPerformAttack(payload.attackerNick, payload.defenderNick, payload.weapon, payload.shieldType, payload.outcome, payload.force);
    default:
      return {
        ok: false,
        error: "unsupported_action"
      };
  }
}

module.exports = {
  handleShopAction,
  isSupabaseConfigured,
  getSupabaseUrl
};
