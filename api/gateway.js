/**
 * ============================================================================
 * Vercel Serverless Function: bKash Custom Gateway Handler
 * ============================================================================
 * Handles:
 * - /api/gateway/create-payment
 * - /api/gateway/execute-payment
 * - /api/gateway/query-payment
 * - /api/gateway/stats
 * Compatible with Vercel Serverless Functions!
 * ============================================================================
 */

const https = require("https");

// Environment configs with safe fallbacks
const BKASH_IS_SANDBOX = process.env.BKASH_IS_SANDBOX === "true";
const BKASH_HOST = BKASH_IS_SANDBOX ? "tokenized.sandbox.bka.sh" : "tokenized.pay.bka.sh";
const BKASH_USERNAME = process.env.BKASH_USERNAME || "01309968240";
const BKASH_PASSWORD = process.env.BKASH_PASSWORD || "+S]^9.2uWmZ";
const BKASH_APP_KEY = process.env.BKASH_APP_KEY || "YsWRhZHyR7Lok4BIgcnS90qltc";
const BKASH_APP_SECRET = process.env.BKASH_APP_SECRET || "LDwjL650aW66Pjg1Ip3Yx5om1Hdplfnfq713Dfi8PZ30pssX62wd";

const SUPABASE_HOST = process.env.SUPABASE_HOST || (process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : "gruzpbfhhujmerwbdamo.supabase.co");
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydXpwYmZoaHVqbWVyd2JkYW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MTQ5MDksImV4cCI6MjEwNTk5MDkwOX0.AFgJ-IKIVRx0_2wqCBvjPx_wNEGexD7kcFk69EL_sQM";

// In-memory token cache for warm serverless instances
let cachedIdToken = null;
let tokenExpiresAt = 0;

function httpsJsonRequest({ host, path, method = "GET", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === "string" ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }

    const options = {
      hostname: host,
      port: 443,
      path: path,
      method: method,
      headers: reqHeaders
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: data, raw: data });
        }
      });
    });

    req.on("error", (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function supabaseRest(endpoint, method = "GET", body = null, extraHeaders = {}) {
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    ...extraHeaders
  };

  return await httpsJsonRequest({
    host: SUPABASE_HOST,
    path: `/rest/v1/${endpoint}`,
    method,
    headers,
    body
  });
}

async function getBkashToken() {
  const now = Date.now();
  if (cachedIdToken && tokenExpiresAt > now + 60000) {
    return cachedIdToken;
  }

  const payload = {
    app_key: BKASH_APP_KEY,
    app_secret: BKASH_APP_SECRET
  };

  const res = await httpsJsonRequest({
    host: BKASH_HOST,
    path: "/v1.2.0-beta/tokenized/checkout/token/grant",
    method: "POST",
    headers: {
      "username": BKASH_USERNAME,
      "password": BKASH_PASSWORD
    },
    body: payload
  });

  if (res.data && res.data.id_token) {
    cachedIdToken = res.data.id_token;
    const expiresIn = (res.data.expires_in || 3600) * 1000;
    tokenExpiresAt = now + expiresIn;
    return cachedIdToken;
  } else {
    throw new Error(res.data.statusMessage || "Failed to obtain bKash id_token");
  }
}

// In-memory cache for warm executions
const projectCache = new Map();
const PROJECT_CACHE_TTL = 3 * 60 * 1000;

async function verifyProjectAuth(headers, requestBody) {
  let licenseKey = headers["license-key"] || 
                   headers["license_key"] || 
                   headers["api-key"] || 
                   requestBody.license_key || 
                   requestBody.licenseKey || 
                   requestBody.api_key;

  const authHeader = headers["authorization"] || "";
  if (!licenseKey && authHeader.startsWith("Bearer ")) {
    licenseKey = authHeader.slice(7).trim();
  }

  if (!licenseKey || typeof licenseKey !== "string" || !licenseKey.trim()) {
    return {
      isValid: false,
      error: "Authentication Failed: Missing 'License-Key'. Please pass your project License Key in 'License-Key' header or request body."
    };
  }

  licenseKey = licenseKey.trim();

  let project = null;
  const now = Date.now();
  const cached = projectCache.get(licenseKey);

  if (cached && cached.expiresAt > now) {
    project = cached.project;
  } else {
    let query = `gateway_projects?license_key=eq.${encodeURIComponent(licenseKey)}&select=*`;
    let result = await supabaseRest(query);

    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
      const fallbackQuery = `gateway_projects?api_key=eq.${encodeURIComponent(licenseKey)}&select=*`;
      result = await supabaseRest(fallbackQuery);
    }

    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
      return {
        isValid: false,
        error: "Invalid License Key: No registered project matches this key."
      };
    }

    project = result.data[0];
    projectCache.set(licenseKey, { project, expiresAt: now + PROJECT_CACHE_TTL });
  }

  if (project.is_active === false) {
    return {
      isValid: false,
      error: `Project '${project.project_name}' has been deactivated by administrator.`
    };
  }

  // Exact domain check
  const reqOrigin = headers["origin"] || headers["referer"] || requestBody.origin || "";
  const registeredUrl = (project.website_url || "").trim().toLowerCase();

  if (registeredUrl && registeredUrl !== "*" && registeredUrl !== "localhost") {
    try {
      let regClean = registeredUrl.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0];
      if (reqOrigin) {
        let originClean = reqOrigin.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0];
        const isLocal = originClean === "localhost" || originClean === "127.0.0.1";
        const isRegLocal = regClean === "localhost" || regClean === "127.0.0.1";

        if (!isLocal && !isRegLocal && originClean !== regClean) {
          console.warn(`[Security Warning]: License Key used on unauthorized domain '${originClean}' (Registered: '${regClean}')`);
          return {
            isValid: false,
            error: "Unauthorized Domain: This License Key is not authorized for requests originating from this website domain."
          };
        }
      }
    } catch (e) {}
  }

  return { isValid: true, project };
}

// Vercel Serverless Function Handler
module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Api-Key, License-Key, Project-Name");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  let body = req.body || {};
  if (typeof body === "string" && body.trim()) {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  // Helper JSON responder
  const sendJson = (statusCode, data) => {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };

  try {
    // 1. CREATE PAYMENT
    if (pathname.includes("create-payment") && req.method === "POST") {
      const auth = await verifyProjectAuth(req.headers, body);
      if (!auth.isValid) {
        return sendJson(401, { statusCode: "401", statusMessage: auth.error });
      }

      const project = auth.project;
      const amount = body.amount;
      const customInvoice = body.merchantInvoiceNumber || `INV-${project.project_name.toUpperCase().slice(0, 4)}-${Date.now()}`;
      const origin = req.headers["origin"] || `https://${req.headers.host || "paywithbkash.vercel.app"}`;
      const callbackUrl = body.callbackURL || `${origin}/callback.html`;

      if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return sendJson(400, { statusCode: "400", statusMessage: "Invalid or missing payment amount." });
      }

      const idToken = await getBkashToken();

      const bkashCreatePayload = {
        mode: "0011",
        payerReference: project.project_name,
        callbackURL: callbackUrl,
        amount: String(Number(amount).toFixed(2)),
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: customInvoice
      };

      const bkashRes = await httpsJsonRequest({
        host: BKASH_HOST,
        path: "/v1.2.0-beta/tokenized/checkout/create",
        method: "POST",
        headers: {
          "Authorization": idToken,
          "X-APP-Key": BKASH_APP_KEY
        },
        body: bkashCreatePayload
      });

      if (bkashRes.data && bkashRes.data.paymentID) {
        await supabaseRest("gateway_transactions", "POST", {
          project_id: project.id,
          project_name: project.project_name,
          payment_id: bkashRes.data.paymentID,
          amount: Number(amount),
          currency: "BDT",
          intent: "sale",
          merchant_invoice_number: customInvoice,
          customer_phone: body.customerPhone || null,
          payer_reference: project.project_name,
          status: "Initiated",
          status_message: bkashRes.data.statusMessage || "Payment Initiated",
          origin_url: req.headers["origin"] || req.headers["referer"] || project.website_url,
          raw_bkash_response: bkashRes.data
        });
      }

      return sendJson(bkashRes.status || 200, bkashRes.data);
    }

    // 2. EXECUTE PAYMENT
    if (pathname.includes("execute-payment") && req.method === "POST") {
      const paymentID = body.paymentID || parsedUrl.searchParams.get("paymentID");
      if (!paymentID) {
        return sendJson(400, { statusCode: "400", statusMessage: "Missing paymentID parameter." });
      }

      const idToken = await getBkashToken();

      const bkashRes = await httpsJsonRequest({
        host: BKASH_HOST,
        path: "/v1.2.0-beta/tokenized/checkout/execute",
        method: "POST",
        headers: {
          "Authorization": idToken,
          "X-APP-Key": BKASH_APP_KEY
        },
        body: { paymentID }
      });

      const data = bkashRes.data;
      const isSuccess = data && (data.statusCode === "0000" || data.transactionStatus === "Completed");

      if (data && data.paymentID) {
        await supabaseRest(`gateway_transactions?payment_id=eq.${encodeURIComponent(paymentID)}`, "PATCH", {
          trx_id: data.trxID || null,
          status: isSuccess ? "Success" : "Failed",
          status_message: data.statusMessage || (isSuccess ? "Completed Successfully" : "Payment Execution Failed"),
          customer_phone: data.customerMsisdn || null,
          raw_bkash_response: data
        });
      }

      return sendJson(bkashRes.status || 200, data);
    }

    // 3. QUERY PAYMENT
    if (pathname.includes("query-payment") && req.method === "POST") {
      const paymentID = body.paymentID || parsedUrl.searchParams.get("paymentID");
      if (!paymentID) {
        return sendJson(400, { statusCode: "400", statusMessage: "Missing paymentID parameter." });
      }

      const idToken = await getBkashToken();

      const bkashRes = await httpsJsonRequest({
        host: BKASH_HOST,
        path: "/v1.2.0-beta/tokenized/checkout/payment/status",
        method: "POST",
        headers: {
          "Authorization": idToken,
          "X-APP-Key": BKASH_APP_KEY
        },
        body: { paymentID }
      });

      return sendJson(bkashRes.status || 200, bkashRes.data);
    }

    // 4. STATS ENDPOINT
    if (pathname.includes("stats") && req.method === "GET") {
      return sendJson(200, {
        status: "online",
        gateway: "bKash Tokenized Multi-Project Master Gateway",
        environment: BKASH_IS_SANDBOX ? "sandbox" : "live",
        timestamp: new Date().toISOString()
      });
    }

    return sendJson(404, { statusCode: "404", statusMessage: "Route not found on Gateway Serverless API." });
  } catch (err) {
    console.error("Vercel Gateway Function Error:", err);
    return sendJson(500, {
      statusCode: "500",
      statusMessage: "Internal Serverless Function Error",
      error: err.message
    });
  }
};
