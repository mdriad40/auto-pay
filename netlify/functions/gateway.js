/**
 * ============================================================================
 * Netlify Serverless Function: bKash Custom Gateway Handler
 * ============================================================================
 * Handles:
 * - /api/gateway/create-payment
 * - /api/gateway/execute-payment
 * - /api/gateway/query-payment
 * - /api/gateway/stats
 * Works seamlessly in Netlify Serverless Functions & Local Dev!
 * ============================================================================
 */

const https = require("https");

// Environment configs
const BKASH_IS_SANDBOX = process.env.BKASH_IS_SANDBOX === "true";
const BKASH_HOST = BKASH_IS_SANDBOX ? "tokenized.sandbox.bka.sh" : "tokenized.pay.bka.sh";
const BKASH_USERNAME = process.env.BKASH_USERNAME || "";
const BKASH_PASSWORD = process.env.BKASH_PASSWORD || "";
const BKASH_APP_KEY = process.env.BKASH_APP_KEY || "";
const BKASH_APP_SECRET = process.env.BKASH_APP_SECRET || "";

const SUPABASE_HOST = process.env.SUPABASE_HOST || (process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : "gruzpbfhhujmerwbdamo.supabase.co");
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "";

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

async function verifyProjectAuth(headers, requestBody) {
  const apiKey = headers["api-key"] || requestBody.api_key;
  const licenseKey = headers["license-key"] || requestBody.license_key;
  const projectName = headers["project-name"] || requestBody.project_name;

  if (!apiKey || !licenseKey) {
    return {
      isValid: false,
      error: "Missing API Key or License Key in request headers/body (api-key, license-key)"
    };
  }

  let query = `gateway_projects?api_key=eq.${encodeURIComponent(apiKey)}&license_key=eq.${encodeURIComponent(licenseKey)}&select=*`;
  if (projectName) {
    query += `&project_name=eq.${encodeURIComponent(projectName)}`;
  }

  const result = await supabaseRest(query);
  if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
    return {
      isValid: false,
      error: "Invalid API credentials or Project does not exist in registry."
    };
  }

  const project = result.data[0];
  if (project.is_active === false) {
    return {
      isValid: false,
      error: `Project '${project.project_name}' has been deactivated.`
    };
  }

  // Origin check
  const reqOrigin = headers["origin"] || headers["referer"] || "";
  const registeredUrl = (project.website_url || "").trim().toLowerCase();

  if (registeredUrl && registeredUrl !== "*" && registeredUrl !== "localhost") {
    try {
      const regDomain = new URL(registeredUrl.startsWith("http") ? registeredUrl : "https://" + registeredUrl).hostname;
      if (reqOrigin) {
        const originDomain = new URL(reqOrigin).hostname;
        if (originDomain !== "localhost" && originDomain !== "127.0.0.1" && originDomain !== regDomain && !originDomain.endsWith("." + regDomain)) {
          return {
            isValid: false,
            error: `Website URL mismatch: Request came from '${originDomain}', but project is licensed for '${regDomain}'`
          };
        }
      }
    } catch (e) {}
  }

  return { isValid: true, project };
}

exports.handler = async (event, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Api-Key, License-Key, Project-Name"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  const path = event.path;
  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      body = {};
    }
  }

  try {
    // 1. CREATE PAYMENT
    if (path.includes("create-payment") && event.httpMethod === "POST") {
      const auth = await verifyProjectAuth(event.headers, body);
      if (!auth.isValid) {
        return {
          statusCode: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ statusCode: "401", statusMessage: auth.error })
        };
      }

      const project = auth.project;
      const amount = body.amount;
      const customInvoice = body.merchantInvoiceNumber || `INV-${project.project_name.toUpperCase().slice(0, 4)}-${Date.now()}`;
      const origin = event.headers["origin"] || "http://localhost:7000";
      const callbackUrl = body.callbackURL || `${origin}/callback.html`;

      if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ statusCode: "400", statusMessage: "Invalid or missing payment amount." })
        };
      }

      const idToken = await getBkashToken();

      const bkashCreatePayload = {
        mode: "0011",
        payerReference: project.project_name, // Unique project identifier in bKash reference!
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
          origin_url: event.headers["origin"] || project.website_url,
          raw_bkash_response: bkashRes.data
        });
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          gatewayStatus: "SUCCESS",
          project: project.project_name,
          ...bkashRes.data
        })
      };
    }

    // 2. EXECUTE PAYMENT
    if (path.includes("execute-payment") && event.httpMethod === "POST") {
      const paymentID = body.paymentID;
      if (!paymentID) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ statusCode: "400", statusMessage: "paymentID is required" })
        };
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

      const isSuccess = bkashRes.data && bkashRes.data.statusCode === "0000";
      const newStatus = isSuccess ? "Completed" : "Failed";

      await supabaseRest(
        `gateway_transactions?payment_id=eq.${encodeURIComponent(paymentID)}`,
        "PATCH",
        {
          status: newStatus,
          trx_id: bkashRes.data.trxID || null,
          customer_phone: bkashRes.data.customerMsisdn || null,
          status_message: bkashRes.data.statusMessage || newStatus,
          completed_at: isSuccess ? new Date().toISOString() : null,
          raw_bkash_response: bkashRes.data
        }
      );

      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(bkashRes.data)
      };
    }

    // 3. STATS
    if (path.includes("stats") && event.httpMethod === "GET") {
      const projectsRes = await supabaseRest("gateway_projects?select=*");
      const transactionsRes = await supabaseRest("gateway_transactions?select=*&order=created_at.desc");

      const projects = Array.isArray(projectsRes.data) ? projectsRes.data : [];
      const transactions = Array.isArray(transactionsRes.data) ? transactionsRes.data : [];

      let totalVolume = 0;
      let todayVolume = 0;
      let completedCount = 0;
      const todayStr = new Date().toISOString().slice(0, 10);

      transactions.forEach((tx) => {
        if (tx.status === "Completed") {
          const amt = Number(tx.amount) || 0;
          totalVolume += amt;
          completedCount++;
          if (tx.created_at && tx.created_at.startsWith(todayStr)) {
            todayVolume += amt;
          }
        }
      });

      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          totalProjects: projects.length,
          totalTransactions: transactions.length,
          completedCount,
          totalVolume,
          todayVolume,
          isLive: !BKASH_IS_SANDBOX,
          connectedUsername: BKASH_USERNAME
        })
      };
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Endpoint not found" })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ statusCode: "500", statusMessage: err.message })
    };
  }
};
