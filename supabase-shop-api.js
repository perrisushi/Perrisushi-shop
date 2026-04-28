const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_MIRROR_ENABLED = String(process.env.SUPABASE_MIRROR_ENABLED || "1") !== "0";

const INVENTORY_KEYS = [
  "monedas",
  "llaves",
  "gemas",
  "polvoGema",
  "duelo",
  "perricita",
  "pc",
  "espada",
  "espadaLv2",
  "espadaLv3",
  "escudo",
  "cuchillo",
  "collar",
  "randomKey",
  "espadaLegendaria",
  "escudoMadera",
  "escudoMetal",
  "escudoLegendario",
  "cascoSushi",
  "guantesSushi",
  "pecheraSushi",
  "pantalonesSushi",
  "botasSushi"
];

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function toSnakeCase(key) {
  return String(key || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function toNumber(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : 0;
}

function buildInventoryRow(nick, inventory) {
  const row = {
    nick: String(nick || "").trim(),
    updated_at: new Date().toISOString()
  };

  INVENTORY_KEYS.forEach((key) => {
    row[toSnakeCase(key)] = toNumber(inventory && inventory[key]);
  });

  return row;
}

function buildProfileRow(nick, profile) {
  const normalizedProfile = profile && typeof profile === "object" ? profile : {};
  return {
    nick: String(nick || normalizedProfile.nick || "").trim(),
    selected_logo_id: String(normalizedProfile.selectedLogoId || "logo-pelusa-1").trim(),
    owned_logo_ids: Array.isArray(normalizedProfile.ownedLogoIds) ? normalizedProfile.ownedLogoIds : ["logo-pelusa-1"],
    karma: String(normalizedProfile.karma || "").trim(),
    achievements: Array.isArray(normalizedProfile.achievements) ? normalizedProfile.achievements : [],
    updated_at: new Date().toISOString()
  };
}

async function supabaseRequest(pathname, options) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
      ...(options && options.headers ? options.headers : {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`supabase_${response.status}_${text.slice(0, 160)}`);
  }

  return response;
}

async function upsertRow(tableName, row, conflictColumn = "nick") {
  if (!row || !String(row[conflictColumn] || "").trim()) {
    return;
  }

  await supabaseRequest(`${tableName}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
    method: "POST",
    body: JSON.stringify(row)
  });
}

async function mirrorPlayerSnapshot(responseBody) {
  const nick = String(responseBody && responseBody.nick ? responseBody.nick : "").trim();
  if (!nick) {
    return;
  }

  await upsertRow("shop_players", {
    nick,
    updated_at: new Date().toISOString()
  });

  if (responseBody.inventory && typeof responseBody.inventory === "object") {
    await upsertRow("shop_inventories", buildInventoryRow(nick, responseBody.inventory));
  }

  if (responseBody.profile && typeof responseBody.profile === "object") {
    await upsertRow("shop_profiles", buildProfileRow(nick, responseBody.profile));
  }
}

async function mirrorUsersList(responseBody) {
  const users = Array.isArray(responseBody && responseBody.users) ? responseBody.users : [];
  await Promise.all(users.map(async (user) => {
    const nick = String(user && user.nick ? user.nick : "").trim();
    if (!nick) {
      return;
    }

    await upsertRow("shop_players", {
      nick,
      active: true,
      updated_at: new Date().toISOString()
    });

    await upsertRow("shop_public_users", {
      nick,
      pc: toNumber(user.pc),
      logo_id: String(user.logoId || "logo-pelusa-1").trim(),
      karma: String(user.karma || "").trim(),
      achievements: Array.isArray(user.achievements) ? user.achievements : [],
      updated_at: new Date().toISOString()
    });
  }));
}

async function mirrorShopResponse(payload, responseBody) {
  if (!SUPABASE_MIRROR_ENABLED || !isSupabaseConfigured() || !responseBody || responseBody.ok !== true) {
    return;
  }

  const action = String(payload && payload.action ? payload.action : "").trim();
  if (!action) {
    return;
  }

  try {
    if (
      action === "publicShopLogin" ||
      action === "publicShopRefresh" ||
      action === "publicShopGetProfile" ||
      action === "publicShopPurchase" ||
      action === "publicShopUpgradeEquipment" ||
      action === "publicShopCraftKey" ||
      action === "publicShopPlayCard" ||
      action === "publicShopDestroyGem" ||
      action === "publicShopOpenChest" ||
      action === "publicShopRedeemRandomKey" ||
      action === "publicShopClearRandomKeyClaims"
    ) {
      await mirrorPlayerSnapshot(responseBody);
    }

    if (action === "publicShopListUsers") {
      await mirrorUsersList(responseBody);
    }
  } catch (error) {
    console.warn("Supabase mirror failed:", error && error.message ? error.message : error);
  }
}

module.exports = {
  isSupabaseConfigured,
  mirrorShopResponse
};
