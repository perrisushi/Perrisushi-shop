const SHOP_API_UPSTREAM_URL = "https://www.perrisushi.com/shop-api";

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
    const requestUrl = new URL(context.request.url);
    if (requestUrl.origin === SHOP_API_UPSTREAM_URL.replace(/\/shop-api$/, "")) {
      return jsonResponse({
        ok: false,
        error: "shop_api_loop_detected",
        details: "Este function no debe desplegarse sobre el mismo dominio que el backend principal."
      }, 500);
    }

    const upstreamResponse = await fetch(SHOP_API_UPSTREAM_URL, {
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
  return jsonResponse({ ok: true, service: "shop-api", mode: "cloudflare-pages-function-proxy", upstream: SHOP_API_UPSTREAM_URL });
}
