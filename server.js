const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const PRIMARY_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw9vXxCPgDfG8dbKv53fHmr5LktFH_JUrGxMAVxfdJo1c_S4nB4ZdkCGEFpOdMjZ6XX/exec";
const LEGACY_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzSUpShSW3ZSuujvwd7RYQtAjRO2NRUoDyO350hcUXjklx1LzOIyD2gjFsqk8SRA6jK/exec";
const APPS_SCRIPT_URLS = Array.from(new Set([
  PRIMARY_APPS_SCRIPT_URL,
  process.env.APPS_SCRIPT_URL,
  LEGACY_APPS_SCRIPT_URL
].filter(Boolean)));
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

async function proxyShopApi(request, response) {
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
      mode: "railway-node-proxy"
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

  let lastError = null;
  for (const upstreamUrl of APPS_SCRIPT_URLS) {
    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(payload)
      });

      const upstreamText = await upstreamResponse.text();
      let upstreamJson;
      try {
        upstreamJson = JSON.parse(upstreamText);
      } catch (error) {
        upstreamJson = {
          ok: false,
          error: "invalid_upstream_json",
          raw: upstreamText.slice(0, 500)
        };
      }

      sendJson(response, upstreamResponse.ok ? 200 : upstreamResponse.status, {
        ...upstreamJson,
        upstreamUrl
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  sendJson(response, 502, {
    ok: false,
    error: "upstream_unreachable",
    details: String(lastError && lastError.message ? lastError.message : lastError)
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "perrisushi-shop",
      mode: "railway-node-server"
    });
    return;
  }

  if (requestUrl.pathname === "/shop-api") {
    proxyShopApi(request, response);
    return;
  }

  serveStatic(response, requestUrl.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Perrisushi Shop listo en http://${HOST}:${PORT}`);
});
