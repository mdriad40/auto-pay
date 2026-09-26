/**
 * ============================================================================
 * Gateway Backend Server (Node.js Built-in Zero-Dependency)
 * ============================================================================
 * Features:
 * 1. Project verification via Supabase:
 *    - Matches `project_name`, `api_key`, `license_key`, and `origin / website_url`
 * 2. Secure bKash communication (Token Grant, Create Payment, Execute Payment)
 * 3. Saves transaction logs into Supabase with project_name as reference
 * 4. Serves Dashboard Frontend (index.html, style.css, app.js)
 * ============================================================================
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");
const config = require("./config");

const PORT = config.server.port;
const BKASH_HOST = config.bkash.isSandbox ? "tokenized.sandbox.bka.sh" : "tokenized.pay.bka.sh";
const SUPABASE_HOST = "gruzpbfhhujmerwbdamo.supabase.co";

// In-memory bKash token cache
let cachedIdToken = null;
let tokenExpiresAt = 0;

// MIME Types
const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

/**
 * Universal HTTPS JSON Request Helper
 */
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

/**
 * Query Supabase REST API
 */
async function supabaseRest(endpoint, method = "GET", body = null, extraHeaders = {}) {
  const headers = {
    "apikey": config.supabase.anonKey,
    "Authorization": `Bearer ${config.supabase.anonKey}`,
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

/**
 * Obtain or Refresh bKash id_token using Master Credentials
 */
async function getBkashToken() {
  const now = Date.now();
  if (cachedIdToken && tokenExpiresAt > now + 60000) {
    return cachedIdToken;
  }

  const payload = {
    app_key: config.bkash.app_key,
    app_secret: config.bkash.app_secret
  };

  const res = await httpsJsonRequest({
    host: BKASH_HOST,
    path: "/v1.2.0-beta/tokenized/checkout/token/grant",
    method: "POST",
    headers: {
      "username": config.bkash.username,
      "password": config.bkash.password
    },
    body: payload
  });

  if (res.data && res.data.id_token) {
    cachedIdToken = res.data.id_token;
    // expires_in typically 3600 seconds
    const expiresIn = (res.data.expires_in || 3600) * 1000;
    tokenExpiresAt = now + expiresIn;
    return cachedIdToken;
  } else {
    throw new Error(res.data.statusMessage || "Failed to obtain bKash id_token");
  }
}

/**
 * Verify Project Authentication & Origin/Website
 */
async function verifyProjectAuth(req, requestBody) {
  // Extract credentials from headers or body
  const apiKey = req.headers["api-key"] || requestBody.api_key;
  const licenseKey = req.headers["license-key"] || requestBody.license_key;
  const projectName = req.headers["project-name"] || requestBody.project_name;

  if (!apiKey || !licenseKey) {
    return {
      isValid: false,
      error: "Missing API Key or License Key in request headers/body (api-key, license-key)"
    };
  }

  // Query Supabase for matching project
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
      error: `Project '${project.project_name}' has been deactivated by administrator.`
    };
  }

  // Origin/Website URL Validation
  const reqOrigin = req.headers["origin"] || req.headers["referer"] || "";
  const registeredUrl = (project.website_url || "").trim().toLowerCase();

  if (registeredUrl && registeredUrl !== "*" && registeredUrl !== "localhost") {
    try {
      const regDomain = new URL(registeredUrl.startsWith("http") ? registeredUrl : "https://" + registeredUrl).hostname;
      if (reqOrigin) {
        const originDomain = new URL(reqOrigin).hostname;
        // Allow exact domain or subdomains or localhost during testing
        if (originDomain !== "localhost" && originDomain !== "127.0.0.1" && originDomain !== regDomain && !originDomain.endsWith("." + regDomain)) {
          return {
            isValid: false,
            error: `Website URL mismatch: Request came from '${originDomain}', but project is licensed for '${regDomain}'`
          };
        }
      }
    } catch (e) {
      // If URL parsing fails, continue or log
    }
  }

  return {
    isValid: true,
    project: project
  };
}

/**
 * HTTP Request Handler
 */
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Api-Key, License-Key, Project-Name");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Read request body
  let bodyData = "";
  req.on("data", (chunk) => (bodyData += chunk));
  req.on("end", async () => {
    let requestBody = {};
    if (bodyData) {
      try {
        requestBody = JSON.parse(bodyData);
      } catch (e) {
        requestBody = {};
      }
    }

    try {
      // ======================================================================
      // 1. GATEWAY API: CREATE PAYMENT
      // POST /api/gateway/create-payment
      // ======================================================================
      if (pathname === "/api/gateway/create-payment" && req.method === "POST") {
        // Step 1: Verify Project Credentials & Domain
        const auth = await verifyProjectAuth(req, requestBody);
        if (!auth.isValid) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ statusCode: "401", statusMessage: auth.error }));
          return;
        }

        const project = auth.project;
        const amount = requestBody.amount;
        const payerReference = requestBody.payerReference || requestBody.customerPhone || "N/A";
        const customInvoice = requestBody.merchantInvoiceNumber || `INV-${project.project_name.toUpperCase().slice(0, 4)}-${Date.now()}`;
        const callbackUrl = requestBody.callbackURL || `${req.headers.origin || "http://localhost:" + PORT}/callback.html`;

        if (!amount || isNaN(amount) || Number(amount) <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ statusCode: "400", statusMessage: "Invalid or missing payment amount." }));
          return;
        }

        // Step 2: Get Master bKash Token
        const idToken = await getBkashToken();

        // Step 3: Call bKash Create Payment with project_name as reference
        const bkashCreatePayload = {
          mode: "0011",
          payerReference: project.project_name, // Explicit project identifier in bKash reference!
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
            "X-APP-Key": config.bkash.app_key
          },
          body: bkashCreatePayload
        });

        // Step 4: Record Transaction in Supabase
        if (bkashRes.data && bkashRes.data.paymentID) {
          await supabaseRest("gateway_transactions", "POST", {
            project_id: project.id,
            project_name: project.project_name,
            payment_id: bkashRes.data.paymentID,
            amount: Number(amount),
            currency: "BDT",
            intent: "sale",
            merchant_invoice_number: customInvoice,
            customer_phone: requestBody.customerPhone || null,
            payer_reference: project.project_name,
            status: "Initiated",
            status_message: bkashRes.data.statusMessage || "Payment Initiated",
            origin_url: req.headers["origin"] || req.headers["referer"] || project.website_url,
            raw_bkash_response: bkashRes.data
          });
        }

        // Return bKash response back to client (with bkashURL)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          gatewayStatus: "SUCCESS",
          project: project.project_name,
          ...bkashRes.data
        }));
        return;
      }

      // ======================================================================
      // 2. GATEWAY API: EXECUTE PAYMENT
      // POST /api/gateway/execute-payment
      // ======================================================================
      if (pathname === "/api/gateway/execute-payment" && req.method === "POST") {
        const paymentID = requestBody.paymentID;
        if (!paymentID) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ statusCode: "400", statusMessage: "paymentID is required" }));
          return;
        }

        // Get Master bKash Token
        const idToken = await getBkashToken();

        // Call bKash Execute Payment
        const bkashRes = await httpsJsonRequest({
          host: BKASH_HOST,
          path: "/v1.2.0-beta/tokenized/checkout/execute",
          method: "POST",
          headers: {
            "Authorization": idToken,
            "X-APP-Key": config.bkash.app_key
          },
          body: { paymentID }
        });

        const isSuccess = bkashRes.data && bkashRes.data.statusCode === "0000";
        const newStatus = isSuccess ? "Completed" : "Failed";

        // Update transaction in Supabase
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

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(bkashRes.data));
        return;
      }

      // ======================================================================
      // 3. GATEWAY API: QUERY PAYMENT
      // POST /api/gateway/query-payment
      // ======================================================================
      if (pathname === "/api/gateway/query-payment" && req.method === "POST") {
        const paymentID = requestBody.paymentID;
        const idToken = await getBkashToken();

        const bkashRes = await httpsJsonRequest({
          host: BKASH_HOST,
          path: "/v1.2.0-beta/tokenized/checkout/payment/query",
          method: "POST",
          headers: {
            "Authorization": idToken,
            "X-APP-Key": config.bkash.app_key
          },
          body: { paymentID }
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(bkashRes.data));
        return;
      }

      // ======================================================================
      // 4. GATEWAY STATS API (FOR DASHBOARD)
      // GET /api/gateway/stats
      // ======================================================================
      if (pathname === "/api/gateway/stats" && req.method === "GET") {
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

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          totalProjects: projects.length,
          totalTransactions: transactions.length,
          completedCount,
          totalVolume,
          todayVolume,
          isLive: !config.bkash.isSandbox,
          connectedUsername: config.bkash.username
        }));
        return;
      }

      // ======================================================================
      // 5. STATIC FILES SERVING (Dashboard HTML, CSS, JS)
      // ======================================================================
      // Security: Block sensitive server files (.env, server.js, etc.)
      const baseFilename = path.basename(pathname);
      if (baseFilename.startsWith(".") || baseFilename.endsWith(".env") || baseFilename === "server.js") {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("403 Forbidden - Access Denied");
        return;
      }

      let filePath = path.join(__dirname, pathname === "/" ? "index.html" : pathname);

      // Security check: stay within gateway folder
      if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("403 Forbidden");
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { "Content-Type": "text/html; charset=UTF-8" });
          res.end("<h1>404 Not Found - bKash Gateway</h1>");
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(filePath).pipe(res);
      });

    } catch (serverError) {
      console.error("[Gateway Error]:", serverError);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        statusCode: "500",
        statusMessage: serverError.message || "Internal Gateway Server Error"
      }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 bKash Custom Payment Gateway Running on Port ${PORT}`);
  console.log(`🔗 Dashboard: http://localhost:${PORT}`);
  console.log(`💳 bKash Mode: ${config.bkash.isSandbox ? "SANDBOX" : "LIVE"}`);
  console.log(`📦 Supabase Connected: ${SUPABASE_HOST}`);
  console.log(`=======================================================`);
});
