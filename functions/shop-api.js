const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzshi0yfOLsYrhVsjGCUaLF-8sYSGQIENORblPCimxi_5i_YVgaVs1JsrwaqFGOU7xP/exec";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost(context) {
  let payload = {};

  try {
    payload = await context.request.json();
  } catch (error) {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  try {
    const upstreamResponse = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    const upstreamText = await upstreamResponse.text();
    let upstreamJson = null;

    try {
      upstreamJson = JSON.parse(upstreamText);
    } catch (error) {
      upstreamJson = {
        ok: false,
        error: "invalid_upstream_json",
        raw: upstreamText.slice(0, 500)
      };
    }

    return jsonResponse(upstreamJson, upstreamResponse.ok ? 200 : upstreamResponse.status);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: "upstream_unreachable",
        details: String(error && error.message ? error.message : error)
      },
      502
    );
  }
}

export async function onRequestGet() {
  return jsonResponse({ ok: true, service: "shop-api", mode: "cloudflare-pages-function" });
}
