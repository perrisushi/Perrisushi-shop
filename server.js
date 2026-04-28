const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { handleShopAction, isSupabaseConfigured, getSupabaseUrl } = require("./supabase-shop-api");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const WEB_ROOT = __dirname;
const MAX_BODY_BYTES = 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(payload);
}

function sendText(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function normalizeStaticPath(requestPath) {
  const pathname = requestPath === "/" ? "/index.html" : requestPath;
  const resolvedPath = path.normalize(path.join(WEB_ROOT, pathname));
  if (!resolvedPath.startsWith(WEB_ROOT)) {
    return null;
  }
  return resolvedPath;
}

function serveStatic(response, requestPath) {
  const filePath = normalizeStaticPath(requestPath);
  if (!filePath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (requestPath !== "/index.html" && requestPath !== "/") {
        sendText(response, 404, "Not found");
        return;
      }
      sendText(response, 500, "Unable to load index.html");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    const cacheControl = extension === ".html" ? "no-store" : "public, max-age=3600";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": cacheControl
    });
    response.end(content);
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let totalBytes = 0;

    request.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error("payload_too_large"));
        request.destroy();
        return;
      }
      body += chunk;
    });

    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("invalid_json"));
      }
    });

    request.on("error", (error) => reject(error));
  });
}

async function handleShopApi(request, response) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    });
    response.end();
    return;
  }

  if (request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      service: "shop-api",
      mode: "railway-node-supabase-direct",
      supabaseConfigured: isSupabaseConfigured()
    });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  let payload = {};
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    const statusCode = message === "payload_too_large" ? 413 : 400;
    sendJson(response, statusCode, { ok: false, error: message });
    return;
  }

  try {
    const result = await handleShopAction(payload);
    sendJson(response, 200, result);
  } catch (error) {
    console.error("Shop API error:", error);
    sendJson(response, 500, {
      ok: false,
      error: "shop_api_failed",
      details: String(error && error.message ? error.message : error)
    });
  }
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/health") {
    const supabaseUrl = getSupabaseUrl();
    sendJson(response, 200, {
      ok: true,
      service: "perrisushi-shop",
      mode: "railway-node-server",
      supabaseConfigured: isSupabaseConfigured(),
      supabaseUrl
    });
    return;
  }

  if (requestUrl.pathname === "/shop-api") {
    handleShopApi(request, response);
    return;
  }

  serveStatic(response, requestUrl.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Perrisushi Shop listo en http://${HOST}:${PORT}`);
});
