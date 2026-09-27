/**
 * ============================================================================
 * Gateway Unified Frontend Application Logic
 * ============================================================================
 * Single Login Portal:
 * - If Admin (mdriad.eee@gmail.com / Riad) logs in -> Super Admin Dashboard
 * - If Client/Project logs in -> Client Specific Dashboard
 * ============================================================================
 */

const supabaseUrl = GATEWAY_CONFIG.supabase.url;
const supabaseAnonKey = GATEWAY_CONFIG.supabase.anonKey;
const dbClient = (typeof window !== "undefined" && window.supabase) ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

const SUPER_ADMIN_EMAIL = "mdriad.eee@gmail.com";

// Current Active Session
let currentUser = null; // { role: 'admin' | 'client', data: object }
let allProjects = [];
let allTransactions = [];

document.addEventListener("DOMContentLoaded", () => {
  checkSession();
  initGlobalTooltip();
  initDocCallbackHighlighting();
});

/**
 * Check Stored Session
 */
function checkSession() {
  const saved = localStorage.getItem("gateway_user_session");
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      if (currentUser.role === "admin") {
        showAdminView();
      } else {
        showMerchantView();
      }
      return;
    } catch (e) {
      localStorage.removeItem("gateway_user_session");
    }
  }
  showLoginView();
}

function showLoginView() {
  document.getElementById("loginSection").style.display = "block";
  document.getElementById("adminDashboardView").style.display = "none";
  document.getElementById("merchantDashboardView").style.display = "none";
}

function showAdminView() {
  document.getElementById("loginSection").style.display = "none";
  document.getElementById("adminDashboardView").style.display = "flex";
  document.getElementById("merchantDashboardView").style.display = "none";
  initAdminDashboard();
}

// Global Gateway Base URL State & Code Tab
let currentGatewayUrl = (typeof window !== "undefined" ? (localStorage.getItem("gateway_custom_base_url") || window.location.origin) : "");
let activeCodeTab = "js";
let activeClientCodeTab = "js";

async function loadGatewaySettings() {
  try {
    if (dbClient) {
      const { data, error } = await dbClient.from("gateway_settings").select("*").eq("setting_key", "gateway_base_url");
      if (!error && data && data.length > 0 && data[0].setting_value) {
        currentGatewayUrl = data[0].setting_value.trim().replace(/\/$/, "");
        localStorage.setItem("gateway_custom_base_url", currentGatewayUrl);
      }
    }
  } catch (e) {
    console.warn("Gateway settings fallback to local:", e.message);
  }
  updateGatewayUrlUI();
}

async function saveGatewaySettings() {
  const input = document.getElementById("inputGatewayBaseUrl");
  if (!input) return;

  let newUrl = input.value.trim().replace(/\/$/, "");
  if (!newUrl) newUrl = window.location.origin;

  currentGatewayUrl = newUrl;
  localStorage.setItem("gateway_custom_base_url", currentGatewayUrl);

  try {
    if (dbClient) {
      await dbClient.from("gateway_settings").upsert({
        setting_key: "gateway_base_url",
        setting_value: currentGatewayUrl,
        updated_at: new Date().toISOString()
      }, { onConflict: "setting_key" });
    }
  } catch (e) {
    console.warn("Could not save to Supabase gateway_settings, using local storage:", e.message);
  }

  updateGatewayUrlUI();
  showToast("Gateway URL saved successfully!", "success");
}

function updateGatewayUrlUI() {
  const input = document.getElementById("inputGatewayBaseUrl");
  if (input) input.value = currentGatewayUrl;

  const dispGateway = document.getElementById("dispGatewayUrl");
  if (dispGateway) dispGateway.textContent = currentGatewayUrl;

  renderDocCodeSnippet(activeCodeTab);
  renderClientDocCodeSnippet(activeClientCodeTab);
}

function switchCodeTab(lang) {
  activeCodeTab = lang;
  document.querySelectorAll(".code-tab-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById(`tabBtn_${lang}`);
  if (activeBtn) activeBtn.classList.add("active");
  renderDocCodeSnippet(lang);
}

function renderDocCodeSnippet(lang) {
  const pre = document.getElementById("dynamicCodeSnippet");
  if (!pre) return;

  const base = currentGatewayUrl || window.location.origin;
  let code = "";

  if (lang === "js") {
    code = `const GATEWAY_URL = "${base}";
const LICENSE_KEY = "YOUR_PROJECT_LICENSE_KEY";

async function payWithBkash(amount = "100.00", customerPhone = "") {
  try {
    const res = await fetch(\`\${GATEWAY_URL}/api/gateway/create-payment\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "License-Key": LICENSE_KEY
      },
      body: JSON.stringify({
        amount: String(amount),
        customerPhone: customerPhone || "017XXXXXXXX",
        merchantInvoiceNumber: "INV-" + Date.now(),
        callbackURL: window.location.origin + "/callback.html"
      })
    });

    const data = await res.json();

    if (data.bkashURL) {
      window.location.href = data.bkashURL;
    } else {
      alert("Payment Failed: " + (data.statusMessage || "Unable to initiate payment"));
    }
  } catch (err) {
    console.error("Gateway Error:", err);
  }
}`;
  } else if (lang === "node") {
    code = `const axios = require("axios");

const GATEWAY_URL = "${base}";
const LICENSE_KEY = "YOUR_PROJECT_LICENSE_KEY";

async function createBkashPayment(amount, userPhone) {
  const response = await axios.post(\`\${GATEWAY_URL}/api/gateway/create-payment\`, {
    amount: String(amount),
    customerPhone: userPhone,
    merchantInvoiceNumber: "INV-" + Date.now(),
    callbackURL: "https://your-website.com/payment-callback"
  }, {
    headers: {
      "License-Key": LICENSE_KEY
    }
  });

  return response.data.bkashURL;
}`;
  } else if (lang === "php") {
    code = `<?php
$gatewayUrl = "${base}/api/gateway/create-payment";
$licenseKey = "YOUR_PROJECT_LICENSE_KEY";

$payload = json_encode([
    "amount" => "500.00",
    "customerPhone" => "01712345678",
    "merchantInvoiceNumber" => "INV-" . time(),
    "callbackURL" => "https://your-website.com/callback.php"
]);

$ch = curl_init($gatewayUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "License-Key: " . $licenseKey
]);

$response = curl_exec($ch);
curl_close($ch);
$result = json_decode($response, true);

if (!empty($result["bkashURL"])) {
    header("Location: " . $result["bkashURL"]);
    exit();
} else {
    echo "Payment Error: " . ($result["statusMessage"] ?? "Failed");
}
?>`;
  } else if (lang === "python") {
    code = `import requests

GATEWAY_URL = "${base}/api/gateway/create-payment"
LICENSE_KEY = "YOUR_PROJECT_LICENSE_KEY"

payload = {
    "amount": "350.00",
    "customerPhone": "017XXXXXXXX",
    "callbackURL": "https://your-website.com/callback"
}

headers = {
    "Content-Type": "application/json",
    "License-Key": LICENSE_KEY
}

response = requests.post(GATEWAY_URL, json=payload, headers=headers)
data = response.json()

if "bkashURL" in data: 
    print("Redirect user to:", data["bkashURL"])
else:
    print("Error:", data.get("statusMessage", "Failed"))`;
  } else if (lang === "curl") {
    code = `curl -X POST "${base}/api/gateway/create-payment" \\
  -H "Content-Type: application/json" \\
  -H "License-Key: YOUR_PROJECT_LICENSE_KEY" \\
  -d '{\n    "amount": "100.00",\n    "customerPhone": "017XXXXXXXX",\n    "callbackURL": "https://your-website.com/callback.html"\n  }'`;
  }

  pre.innerHTML = `<code>${highlightCode(code, lang)}</code>`;
}

async function showMerchantView() {
  document.getElementById("loginSection").style.display = "none";
  document.getElementById("adminDashboardView").style.display = "none";
  document.getElementById("merchantDashboardView").style.display = "flex";

  const project = currentUser.data;
  const initial = (project.project_name || "M").charAt(0).toUpperCase();
  const avatarElem = document.getElementById("clientAvatarCircle");
  if (avatarElem) avatarElem.textContent = initial;
  const nameElem = document.getElementById("clientMetaName");
  if (nameElem) nameElem.textContent = project.project_name || "Merchant";
  const emailElem = document.getElementById("clientMetaEmail");
  if (emailElem) emailElem.textContent = project.owner_email || "client@email.com";

  const dispProj = document.getElementById("dispProjectName");
  if (dispProj) dispProj.textContent = project.project_name;

  const dispWeb = document.getElementById("dispWebsiteUrl");
  if (dispWeb) dispWeb.textContent = project.website_url;

  const keyElem = document.getElementById("dispLicenseKey");
  if (keyElem) {
    keyElem.setAttribute("data-raw", project.license_key || "");
    keyElem.textContent = "••••••••••••••••••••••••••••••••";
  }
  isLicenseKeyVisible = false;
  const eyeBtn = document.getElementById("btnToggleKeyVisibility");
  if (eyeBtn) {
    eyeBtn.title = "Show License Key";
    eyeBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>`;
  }

  await loadGatewaySettings();

  const base = currentGatewayUrl || window.location.origin;
  const dispGw = document.getElementById("dispGatewayUrl");
  if (dispGw) dispGw.textContent = base;

  switchClientTab('overview');
  switchClientCodeTab('js');

  loadClientTransactions();
  subscribeClientRealtime();
}

/**
 * Handle Unified Login Form
 */
async function handleUnifiedLogin(e) {
  e.preventDefault();
  const btn = document.getElementById("btnLoginSubmit");
  btn.disabled = true;
  btn.textContent = "Verifying Credentials...";

  const identifier = document.getElementById("loginIdentifier").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  try {
    // 1. Check if trying to log in as Super Admin
    if (identifier.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() || identifier.toLowerCase() === "riad") {
      const { data: adminData, error: adminErr } = await dbClient
        .from("gateway_admins")
        .select("*")
        .or(`email.eq.${identifier},username.eq.${identifier}`)
        .eq("password", password);

      if (adminErr) throw adminErr;

      if (adminData && adminData.length > 0) {
        currentUser = { role: "admin", data: adminData[0] };
        localStorage.setItem("gateway_user_session", JSON.stringify(currentUser));
        showAdminView();
        return;
      }
    }

    // 2. Otherwise Check Client / Merchant Credentials
    const { data: clientData, error: clientErr } = await dbClient
      .from("gateway_projects")
      .select("*")
      .or(`project_name.eq.${identifier},owner_email.eq.${identifier}`)
      .eq("password", password);

    if (clientErr) throw clientErr;

    if (clientData && clientData.length > 0) {
      currentUser = { role: "client", data: clientData[0] };
      localStorage.setItem("gateway_user_session", JSON.stringify(currentUser));
      showMerchantView();
      return;
    }

    alert("Invalid Project Name / Email or Password!");

  } catch (err) {
    alert("Login Error: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In to Project";
  }
}

function handleLogout() {
  localStorage.removeItem("gateway_user_session");
  window.location.reload();
}

// =============================================================================
// ADMIN CONTROLS
// =============================================================================

async function initAdminDashboard() {
  await loadGatewaySettings();
  await loadServerStats();
  await loadAdminProjects();
  await loadAdminTransactions();
  subscribeAdminRealtime();
}

function copyGatewayBaseUrl() {
  copyToClipboard(currentGatewayUrl || window.location.origin);
}

function switchAdminTab(tabId) {
  document.querySelectorAll("#adminDashboardView .tab-content").forEach(el => el.style.display = "none");
  document.querySelectorAll("#adminDashboardView .tab-btn").forEach(el => el.classList.remove("active"));

  if (tabId === "overview") {
    document.getElementById("tabOverview").style.display = "block";
    document.getElementById("tabOverviewBtn").classList.add("active");
  } else if (tabId === "projects") {
    document.getElementById("tabProjects").style.display = "block";
    document.getElementById("tabProjectsBtn").classList.add("active");
  } else if (tabId === "transactions") {
    document.getElementById("tabTransactions").style.display = "block";
    document.getElementById("tabTransactionsBtn").classList.add("active");
  } else if (tabId === "docs") {
    document.getElementById("tabDocs").style.display = "block";
    document.getElementById("tabDocsBtn").classList.add("active");
    updateGatewayUrlUI();
  }
}

async function loadServerStats() {
  try {
    const res = await fetch("/api/gateway/stats");
    if (res.ok) {
      const stats = await res.json();
      document.getElementById("statTotalVolume").textContent = `৳ ${stats.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      document.getElementById("statTodayVolume").textContent = `৳ ${stats.todayVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      document.getElementById("statCompletedCount").textContent = stats.completedCount;
      document.getElementById("statTotalProjects").textContent = stats.totalProjects;

      const badgeText = document.getElementById("masterStatusText");
      if (badgeText) {
        badgeText.textContent = `Master PGW: ${stats.isLive ? "Live" : "Sandbox"} (${stats.connectedUsername})`;
      }
    }
  } catch (err) {
    console.warn("Server stats fallback active.");
  }
}

async function loadAdminProjects() {
  try {
    const { data, error } = await dbClient
      .from("gateway_projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    allProjects = data || [];
    renderProjectsTable(allProjects);
    updateProjectFilterDropdown(allProjects);
    document.getElementById("statTotalProjects").textContent = allProjects.length;
  } catch (err) {
    console.error(err);
  }
}

function renderProjectsTable(projects) {
  const tbody = document.getElementById("projectsTableBody");
  if (!tbody) return;

  if (projects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">No projects registered yet. Click "Create Project" to add.</td></tr>`;
    return;
  }

  tbody.innerHTML = projects.map(p => `
    <tr>
      <td>
        <div style="display:flex; flex-direction:column; gap:2px;">
          <strong style="color:var(--text-main); font-size:0.92rem;">${escapeHtml(p.project_name)}</strong>
          ${p.owner_phone ? `<span style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(p.owner_phone)}</span>` : ''}
        </div>
      </td>
      <td style="font-size:0.85rem; color:#475569;">${escapeHtml(p.owner_email)}</td>
      <td>
        <span class="supabase-tag url-tag" data-tooltip="${escapeHtml(p.website_url)}" onclick="copyToClipboard('${escapeHtml(p.website_url)}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.65; flex-shrink:0;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          <span>${escapeHtml(p.website_url)}</span>
        </span>
      </td>
      <td>
        <div class="supabase-key-box">
          <span class="supabase-key-text">${p.license_key.substring(0, 16)}...${p.license_key.slice(-4)}</span>
          <button class="supabase-copy-btn" onclick="copyToClipboard('${p.license_key}')" title="Copy License Key">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
          </button>
        </div>
      </td>
      <td>
        <span class="status-pill ${p.is_active ? 'status-completed' : 'status-failed'}">
          ${p.is_active ? 'Active' : 'Disabled'}
        </span>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openEditProjectModal('${p.id}')" title="Edit Project Details" style="padding:6px 14px; font-size:0.78rem; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Edit
        </button>
      </td>
    </tr>
  `).join("");
}

async function loadAdminTransactions() {
  try {
    const { data, error } = await dbClient
      .from("gateway_transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    allTransactions = data || [];

    renderOverviewTransactions(allTransactions.slice(0, 8));
    renderAllTransactions(allTransactions);

    let totalVol = 0;
    let todayVol = 0;
    let completed = 0;
    let initiated = 0;
    const todayStr = new Date().toISOString().slice(0, 10);

    allTransactions.forEach(tx => {
      const statusLower = (tx.status || "").toLowerCase().trim();
      if (statusLower === "completed") {
        totalVol += Number(tx.amount) || 0;
        completed++;
        if (tx.created_at && tx.created_at.startsWith(todayStr)) {
          todayVol += Number(tx.amount) || 0;
        }
      } else {
        initiated++;
      }
    });

    const statTot = document.getElementById("statTotalVolume");
    if (statTot) statTot.textContent = `৳ ${totalVol.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const statTod = document.getElementById("statTodayVolume");
    if (statTod) statTod.textContent = `৳ ${todayVol.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const statComp = document.getElementById("statCompletedCount");
    if (statComp) statComp.textContent = completed;
    const statInit = document.getElementById("statInitiatedCount");
    if (statInit) statInit.textContent = initiated;
  } catch (err) {
    console.error(err);
  }
}

function renderOverviewTransactions(transactions) {
  const tbody = document.getElementById("overviewTransactionsTableBody");
  if (!tbody) return;

  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">No transactions recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = transactions.map(tx => {
    const keyDisplay = tx.trx_id
      ? `<span class="supabase-tag" style="color:#047857; font-weight:700; background:#ECFDF5; border-color:#A7F3D0;">${escapeHtml(tx.trx_id)}</span>`
      : (tx.payment_id
        ? `<div class="supabase-key-box" style="padding: 2px 4px 2px 8px; gap: 8px;">
             <span class="supabase-key-text" style="font-size: 0.74rem;">${escapeHtml(tx.payment_id.substring(0, 10))}...</span>
             <button class="supabase-copy-btn" style="padding: 2px 7px; font-size: 0.7rem;" onclick="copyToClipboard('${escapeHtml(tx.payment_id)}')" title="Copy Payment ID">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
               </svg>
               <span>Copy</span>
             </button>
           </div>`
        : `<span style="color:#94A3B8;">-</span>`);

    return `
    <tr>
      <td style="font-size:0.8rem; color:#475569; font-weight:500;">${formatDate(tx.created_at)}</td>
      <td>${keyDisplay}</td>
      <td style="font-size:0.82rem; color:#334155;">${escapeHtml(tx.customer_phone || "bKash Customer")}</td>
      <td><strong style="color:#0F172A; font-size:0.88rem;">৳ ${Number(tx.amount).toFixed(2)}</strong></td>
      <td><span class="status-pill status-${(tx.status || '').toLowerCase()}">${escapeHtml(tx.status || 'Unknown')}</span></td>
    </tr>
  `;
  }).join("");
}

function renderAllTransactions(transactions) {
  const tbody = document.getElementById("allTransactionsTableBody");
  if (!tbody) return;

  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">No transactions matching filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = transactions.map(tx => {
    const paymentIdStr = tx.payment_id || '';
    const paymentIdShort = paymentIdStr.length > 20
      ? `${paymentIdStr.substring(0, 12)}...${paymentIdStr.slice(-4)}`
      : paymentIdStr;

    return `
    <tr>
      <td style="font-size:0.8rem; color:#475569; font-weight:500;">${formatDate(tx.created_at)}</td>
      <td><strong style="color:var(--text-main); font-weight:700;">${escapeHtml(tx.project_name)}</strong></td>
      <td style="font-family:monospace; font-size:0.82rem; color:#334155; font-weight:500;">${escapeHtml(tx.merchant_invoice_number || '-')}</td>
      <td>
        ${tx.trx_id
        ? `<span class="supabase-tag" style="color:#047857; font-weight:700; background:#ECFDF5; border-color:#A7F3D0;">${escapeHtml(tx.trx_id)}</span>`
        : `<span style="color:#94A3B8; font-weight:500;">-</span>`}
      </td>
      <td>
        ${paymentIdStr
        ? `<div class="supabase-key-box" style="padding: 2px 4px 2px 8px; gap: 8px;">
               <span class="supabase-key-text" style="font-size: 0.74rem;" title="${escapeHtml(paymentIdStr)}">${escapeHtml(paymentIdShort)}</span>
               <button class="supabase-copy-btn" style="padding: 2px 7px; font-size: 0.7rem;" onclick="copyToClipboard('${escapeHtml(paymentIdStr)}')" title="Copy Full Payment ID">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                   <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                   <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                 </svg>
                 <span>Copy</span>
               </button>
             </div>`
        : `<span style="color:#94A3B8;">-</span>`}
      </td>
      <td style="font-size:0.82rem; color:#334155;">${escapeHtml(tx.customer_phone || '-')}</td>
      <td><strong style="color:#0F172A; font-size:0.88rem;">৳ ${Number(tx.amount).toFixed(2)}</strong></td>
      <td><span class="status-pill status-${(tx.status || '').toLowerCase()}">${escapeHtml(tx.status || 'Unknown')}</span></td>
    </tr>
  `;
  }).join("");
}

function handleAdminOverviewSearch() {
  const query = (document.getElementById("overviewSearchInput")?.value || "").toLowerCase().trim();
  if (!query) {
    renderOverviewTransactions(allTransactions.slice(0, 10));
    return;
  }
  const filtered = allTransactions.filter(tx =>
    (tx.trx_id && tx.trx_id.toLowerCase().includes(query)) ||
    (tx.payment_id && tx.payment_id.toLowerCase().includes(query)) ||
    (tx.project_name && tx.project_name.toLowerCase().includes(query)) ||
    (tx.customer_phone && tx.customer_phone.toLowerCase().includes(query)) ||
    (tx.merchant_invoice_number && tx.merchant_invoice_number.toLowerCase().includes(query))
  );
  renderOverviewTransactions(filtered);
}

function handleAdminProjectSearch() {
  const query = (document.getElementById("projectSearchInput")?.value || "").toLowerCase().trim();
  if (!query) {
    renderProjectsTable(allProjects);
    return;
  }
  const filtered = allProjects.filter(p =>
    (p.project_name && p.project_name.toLowerCase().includes(query)) ||
    (p.owner_email && p.owner_email.toLowerCase().includes(query)) ||
    (p.website_url && p.website_url.toLowerCase().includes(query))
  );
  renderProjectsTable(filtered);
}

function filterAdminTransactions() {
  const selected = document.getElementById("projectFilterSelect")?.value || "ALL";
  const query = (document.getElementById("transactionsSearchInput")?.value || "").toLowerCase().trim();

  let list = allTransactions;
  if (selected !== "ALL") {
    list = list.filter(tx => tx.project_name === selected);
  }
  if (query) {
    list = list.filter(tx =>
      (tx.trx_id && tx.trx_id.toLowerCase().includes(query)) ||
      (tx.payment_id && tx.payment_id.toLowerCase().includes(query)) ||
      (tx.project_name && tx.project_name.toLowerCase().includes(query)) ||
      (tx.customer_phone && tx.customer_phone.toLowerCase().includes(query)) ||
      (tx.merchant_invoice_number && tx.merchant_invoice_number.toLowerCase().includes(query))
    );
  }
  renderAllTransactions(list);
}

function toggleProjectDropdown(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById("projectCustomDropdown");
  if (!dd) return;
  dd.classList.toggle("is-open");
}

function selectProjectFilter(val, label) {
  const hiddenInput = document.getElementById("projectFilterSelect");
  const labelSpan = document.getElementById("projectDropdownSelectedLabel");
  const dd = document.getElementById("projectCustomDropdown");
  const menu = document.getElementById("projectDropdownMenu");

  if (hiddenInput) hiddenInput.value = val;
  if (labelSpan) labelSpan.textContent = label;

  if (menu) {
    const items = menu.querySelectorAll(".dropdown-item");
    items.forEach(it => {
      const itVal = it.getAttribute("data-val");
      if (itVal === val) {
        it.classList.add("active");
      } else {
        it.classList.remove("active");
      }
    });
  }

  if (dd) dd.classList.remove("is-open");
  filterAdminTransactions();
}

function updateProjectFilterDropdown(projects) {
  const hiddenInput = document.getElementById("projectFilterSelect");
  const menu = document.getElementById("projectDropdownMenu");
  const labelSpan = document.getElementById("projectDropdownSelectedLabel");
  if (!menu) return;

  const currentVal = hiddenInput ? hiddenInput.value : "ALL";

  let html = `
    <div class="dropdown-item ${currentVal === 'ALL' ? 'active' : ''}" data-val="ALL" onclick="selectProjectFilter('ALL', 'All Projects')">
      <span class="item-text">All Projects</span>
      <svg class="item-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
  `;

  projects.forEach(p => {
    const isAct = currentVal === p.project_name ? 'active' : '';
    html += `
      <div class="dropdown-item ${isAct}" data-val="${escapeHtml(p.project_name)}" onclick="selectProjectFilter('${escapeHtml(p.project_name)}', '${escapeHtml(p.project_name)}')">
        <span class="item-text">${escapeHtml(p.project_name)}</span>
        <svg class="item-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    `;
  });

  menu.innerHTML = html;
}

// Global outside click handler for custom dropdown
document.addEventListener("click", (e) => {
  const dd = document.getElementById("projectCustomDropdown");
  if (dd && !dd.contains(e.target)) {
    dd.classList.remove("is-open");
  }
});

async function handleCreateProject(e) {
  e.preventDefault();
  const btn = document.getElementById("btnSubmitProject");
  btn.disabled = true;
  btn.textContent = "Generating Keys...";

  const projectName = document.getElementById("inputProjectName").value.trim();
  const ownerEmail = document.getElementById("inputEmail").value.trim();
  const ownerPassword = document.getElementById("inputPassword").value.trim();
  const ownerPhone = document.getElementById("inputPhone").value.trim();
  const websiteUrl = document.getElementById("inputWebsiteUrl").value.trim();

  const existing = allProjects.find(p => p.project_name.toLowerCase() === projectName.toLowerCase());
  if (existing) {
    alert(`Project Name '${projectName}' already exists! Choose another name.`);
    btn.disabled = false;
    btn.textContent = "Generate & Save Project";
    return;
  }

  const apiKey = "bkap_" + generateRandomKey(28);
  const licenseKey = "bklc_" + generateRandomKey(32);

  try {
    const { data, error } = await dbClient
      .from("gateway_projects")
      .insert([
        {
          project_name: projectName,
          owner_email: ownerEmail,
          password: ownerPassword,
          owner_phone: ownerPhone,
          website_url: websiteUrl,
          api_key: apiKey,
          license_key: licenseKey,
          is_active: true
        }
      ])
      .select();

    if (error) throw error;

    showToast(`🎉 Project '${projectName}' registered successfully!`, "success");
    closeNewProjectModal();
    document.getElementById("newProjectForm").reset();
    await loadAdminProjects();
    switchAdminTab("projects");

  } catch (err) {
    alert("Error creating project: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate & Save Project";
  }
}

async function toggleProjectStatus(id, newStatus) {
  try {
    const { error } = await dbClient
      .from("gateway_projects")
      .update({ is_active: newStatus })
      .eq("id", id);

    if (error) throw error;
    showToast(`Project status updated!`, "success");
    await loadAdminProjects();
  } catch (err) {
    alert("Error updating status: " + err.message);
  }
}

function openNewProjectModal() {
  document.getElementById("newProjectModal").classList.add("active");
}
function closeNewProjectModal() {
  document.getElementById("newProjectModal").classList.remove("active");
}

function openEditProjectModal(projectId) {
  const project = allProjects.find(p => String(p.id) === String(projectId));
  if (!project) return;

  document.getElementById("editProjectId").value = project.id;
  document.getElementById("editProjectName").value = project.project_name || "";
  document.getElementById("editProjectEmail").value = project.owner_email || "";
  document.getElementById("editProjectPassword").value = project.password || "";
  document.getElementById("editProjectPhone").value = project.owner_phone || "";
  document.getElementById("editProjectWebsiteUrl").value = project.website_url || "";
  document.getElementById("editProjectStatus").value = String(project.is_active !== false);

  document.getElementById("editProjectModal").classList.add("active");
}

function closeEditProjectModal() {
  document.getElementById("editProjectModal").classList.remove("active");
}

async function handleUpdateProject(e) {
  e.preventDefault();
  const btn = document.getElementById("btnUpdateProject");
  btn.disabled = true;
  btn.textContent = "Saving Changes...";

  const id = document.getElementById("editProjectId").value;
  const projectName = document.getElementById("editProjectName").value.trim();
  const email = document.getElementById("editProjectEmail").value.trim();
  const password = document.getElementById("editProjectPassword").value.trim();
  const phone = document.getElementById("editProjectPhone").value.trim();
  const websiteUrl = document.getElementById("editProjectWebsiteUrl").value.trim();
  const isActive = document.getElementById("editProjectStatus").value === "true";

  try {
    const { error } = await dbClient
      .from("gateway_projects")
      .update({
        project_name: projectName,
        owner_email: email,
        password: password,
        owner_phone: phone,
        website_url: websiteUrl,
        is_active: isActive
      })
      .eq("id", id);

    if (error) throw error;

    showToast("Project updated successfully!", "success");
    closeEditProjectModal();
    await loadAdminProjects();
  } catch (err) {
    alert("Error updating project: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Changes";
  }
}

function subscribeAdminRealtime() {
  dbClient
    .channel('admin_realtime_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gateway_transactions' }, () => {
      showToast("⚡ New Transaction received!", "info");
      loadAdminTransactions();
      loadServerStats();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gateway_projects' }, () => {
      loadAdminProjects();
    })
    .subscribe();
}

// =============================================================================
// CLIENT / MERCHANT CONTROLS
// =============================================================================

let clientAllTransactions = [];

async function loadClientTransactions() {
  if (!currentUser || currentUser.role !== "client") return;
  const project = currentUser.data;

  try {
    const { data, error } = await dbClient
      .from("gateway_transactions")
      .select("*")
      .eq("project_name", project.project_name)
      .order("created_at", { ascending: false });

    if (error) throw error;
    clientAllTransactions = data || [];
    renderClientTransactions(clientAllTransactions);
  } catch (err) {
    console.error(err);
  }
}

function handleClientTransactionSearch() {
  const query = (document.getElementById("clientTransactionsSearchInput")?.value || "").toLowerCase().trim();
  if (!query) {
    renderClientTransactions(clientAllTransactions);
    return;
  }
  const filtered = clientAllTransactions.filter(t =>
    (t.trx_id && t.trx_id.toLowerCase().includes(query)) ||
    (t.payment_id && t.payment_id.toLowerCase().includes(query)) ||
    (t.customer_phone && t.customer_phone.toLowerCase().includes(query)) ||
    (t.merchant_invoice_number && t.merchant_invoice_number.toLowerCase().includes(query))
  );
  renderClientTransactions(filtered);
}

function renderClientTransactions(txList) {
  const tbody = document.getElementById("merchantTransactionsBody");
  if (!tbody) return;

  let total = 0;
  let today = 0;
  let completed = 0;
  let initiated = 0;
  const todayStr = new Date().toISOString().slice(0, 10);

  clientAllTransactions.forEach(t => {
    const statusLower = (t.status || "").toLowerCase().trim();
    if (statusLower === "completed") {
      const amt = Number(t.amount) || 0;
      total += amt;
      completed++;
      if (t.created_at && t.created_at.startsWith(todayStr)) {
        today += amt;
      }
    } else {
      initiated++;
    }
  });

  const statTot = document.getElementById("projStatTotalVol");
  if (statTot) statTot.textContent = `৳ ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const statTod = document.getElementById("projStatTodayVol");
  if (statTod) statTod.textContent = `৳ ${today.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const statOrd = document.getElementById("projStatOrders");
  if (statOrd) statOrd.textContent = completed;
  const statInit = document.getElementById("projStatInitiated");
  if (statInit) statInit.textContent = initiated;

  if (txList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No payment records found for your project.</td></tr>`;
    return;
  }

  tbody.innerHTML = txList.map(t => {
    const paymentIdStr = t.payment_id || '';
    const paymentIdShort = paymentIdStr.length > 20
      ? `${paymentIdStr.substring(0, 12)}...${paymentIdStr.slice(-4)}`
      : paymentIdStr;

    return `
    <tr>
      <td style="font-size:0.8rem; color:#475569; font-weight:500;">${formatDate(t.created_at)}</td>
      <td style="font-family:monospace; font-size:0.82rem; color:#334155; font-weight:500;">${escapeHtml(t.merchant_invoice_number || '-')}</td>
      <td>
        ${t.trx_id
        ? `<span class="supabase-tag" style="color:#047857; font-weight:700; background:#ECFDF5; border-color:#A7F3D0;">${escapeHtml(t.trx_id)}</span>`
        : `<span style="color:#94A3B8; font-weight:500;">-</span>`}
      </td>
      <td>
        ${paymentIdStr
        ? `<div class="supabase-key-box" style="padding: 2px 4px 2px 8px; gap: 8px;">
               <span class="supabase-key-text" style="font-size: 0.74rem;" title="${escapeHtml(paymentIdStr)}">${escapeHtml(paymentIdShort)}</span>
               <button class="supabase-copy-btn" style="padding: 2px 7px; font-size: 0.7rem;" onclick="copyToClipboard('${escapeHtml(paymentIdStr)}')" title="Copy Full Payment ID">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                   <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                   <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                 </svg>
                 <span>Copy</span>
               </button>
             </div>`
        : `<span style="color:#94A3B8;">-</span>`}
      </td>
      <td style="font-size:0.82rem; color:#334155;">${escapeHtml(t.customer_phone || 'Customer')}</td>
      <td><strong style="color:#0F172A; font-size:0.88rem;">৳ ${Number(t.amount).toFixed(2)}</strong></td>
      <td><span class="status-pill status-${(t.status || '').toLowerCase()}">${escapeHtml(t.status)}</span></td>
    </tr>
  `;
  }).join("");
}

function switchClientTab(tabId) {
  document.querySelectorAll("#merchantDashboardView .tab-content").forEach(el => el.style.display = "none");
  document.querySelectorAll("#merchantDashboardView .tab-btn").forEach(el => el.classList.remove("active"));

  if (tabId === "overview") {
    document.getElementById("tabClientOverview").style.display = "block";
    document.getElementById("tabClientOverviewBtn").classList.add("active");
  } else if (tabId === "keys") {
    document.getElementById("tabClientKeys").style.display = "block";
    document.getElementById("tabClientKeysBtn").classList.add("active");
  } else if (tabId === "docs") {
    document.getElementById("tabClientDocs").style.display = "block";
    document.getElementById("tabClientDocsBtn").classList.add("active");
    renderClientDocCodeSnippet(activeClientCodeTab);
  }
}

function switchClientCodeTab(lang) {
  activeClientCodeTab = lang;
  const tabs = ["js", "node", "php", "python", "curl"];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabClientBtn_${t}`);
    if (btn) btn.classList.toggle("active", t === lang);
  });
  renderClientDocCodeSnippet(lang);
}

function renderClientDocCodeSnippet(lang) {
  const pre = document.getElementById("dynamicClientCodeSnippet");
  if (!pre) return;

  const base = currentGatewayUrl || window.location.origin;
  const licenseKey = (currentUser && currentUser.data && currentUser.data.license_key)
    ? currentUser.data.license_key
    : "YOUR_PROJECT_LICENSE_KEY";

  let code = "";

  if (lang === "js") {
    code = `const GATEWAY_URL = "${base}";
const LICENSE_KEY = "${licenseKey}";

async function payWithBkash(amount = "100.00", customerPhone = "") {
  try {
    const res = await fetch(\`\${GATEWAY_URL}/api/gateway/create-payment\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "License-Key": LICENSE_KEY
      },
      body: JSON.stringify({
        amount: String(amount),
        customerPhone: customerPhone || "017XXXXXXXX",
        merchantInvoiceNumber: "INV-" + Date.now(),
        callbackURL: window.location.origin + "/callback.html"
      })
    });

    const data = await res.json();

    if (data.bkashURL) {
      window.location.href = data.bkashURL;
    } else {
      alert("Payment Failed: " + (data.statusMessage || "Unable to initiate payment"));
    }
  } catch (err) {
    console.error("Gateway Error:", err);
  }
}`;
  } else if (lang === "node") {
    code = `const axios = require("axios");

const GATEWAY_URL = "${base}";
const LICENSE_KEY = "${licenseKey}";

async function createBkashPayment(amount, userPhone) {
  const response = await axios.post(\`\${GATEWAY_URL}/api/gateway/create-payment\`, {
    amount: String(amount),
    customerPhone: userPhone,
    merchantInvoiceNumber: "INV-" + Date.now(),
    callbackURL: "https://your-website.com/payment-callback"
  }, {
    headers: {
      "License-Key": LICENSE_KEY
    }
  });

  return response.data.bkashURL;
}`;
  } else if (lang === "php") {
    code = `<?php
$gatewayUrl = "${base}/api/gateway/create-payment";
$licenseKey = "${licenseKey}";

$payload = json_encode([
    "amount" => "500.00",
    "customerPhone" => "01712345678",
    "merchantInvoiceNumber" => "INV-" . time(),
    "callbackURL" => "https://your-website.com/callback.php"
]);

$ch = curl_init($gatewayUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "License-Key: " . $licenseKey
]);

$response = curl_exec($ch);
curl_close($ch);
$result = json_decode($response, true);

if (!empty($result["bkashURL"])) {
    header("Location: " . $result["bkashURL"]);
    exit();
} else {
    echo "Payment Error: " . ($result["statusMessage"] ?? "Failed");
}
?>`;
  } else if (lang === "python") {
    code = `import requests

GATEWAY_URL = "${base}/api/gateway/create-payment"
LICENSE_KEY = "${licenseKey}"

payload = {
    "amount": "350.00",
    "customerPhone": "017XXXXXXXX",
    "callbackURL": "https://your-website.com/callback"
}

headers = {
    "Content-Type": "application/json",
    "License-Key": LICENSE_KEY
}

response = requests.post(GATEWAY_URL, json=payload, headers=headers)
data = response.json()

if "bkashURL" in data: 
    print("Redirect user to:", data["bkashURL"])
else:
    print("Error:", data.get("statusMessage", "Failed"))`;
  } else if (lang === "curl") {
    code = `curl -X POST "${base}/api/gateway/create-payment" \\
  -H "Content-Type: application/json" \\
  -H "License-Key: ${licenseKey}" \\
  -d '{\n    "amount": "100.00",\n    "customerPhone": "017XXXXXXXX",\n    "callbackURL": "https://your-website.com/callback.html"\n  }'`;
  }

  pre.innerHTML = `<code>${highlightCode(code, lang)}</code>`;
}

function subscribeClientRealtime() {
  const project = currentUser.data;
  dbClient
    .channel('client_realtime_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gateway_transactions', filter: `project_name=eq.${project.project_name}` }, () => {
      loadClientTransactions();
    })
    .subscribe();
}

function copyProjectKey(elemId) {
  const elem = document.getElementById(elemId);
  if (!elem) return;
  const raw = elem.getAttribute("data-raw") || elem.textContent;
  copyToClipboard(raw);
}

let isLicenseKeyVisible = false;

function toggleLicenseKeyVisibility() {
  const keyElem = document.getElementById("dispLicenseKey");
  const eyeBtn = document.getElementById("btnToggleKeyVisibility");
  if (!keyElem) return;

  const rawKey = keyElem.getAttribute("data-raw") || (currentUser?.data?.license_key || "");
  isLicenseKeyVisible = !isLicenseKeyVisible;

  if (isLicenseKeyVisible) {
    keyElem.textContent = rawKey;
    if (eyeBtn) {
      eyeBtn.title = "Hide License Key";
      eyeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>`;
    }
  } else {
    keyElem.textContent = "••••••••••••••••••••••••••••••••";
    if (eyeBtn) {
      eyeBtn.title = "Show License Key";
      eyeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>`;
    }
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

function generateRandomKey(len = 24) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const cryptoObj = window.crypto || window.msCrypto;
  if (cryptoObj && cryptoObj.getRandomValues) {
    const values = new Uint8Array(len);
    cryptoObj.getRandomValues(values);
    for (let i = 0; i < len; i++) {
      result += chars[values[i] % chars.length];
    }
  } else {
    for (let i = 0; i < len; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return result;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("Copied to clipboard!", "success");
  }).catch(() => {
    prompt("Copy manually:", text);
  });
}

// Global Floating Glassmorphic Tooltip Controller
let tooltipEl = null;

function initGlobalTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "custom-floating-tooltip";
    document.body.appendChild(tooltipEl);
  }

  document.addEventListener("mouseover", (e) => {
    const target = e.target.closest("[data-tooltip]");
    if (!target) return;

    const text = target.getAttribute("data-tooltip");
    if (!text) return;

    tooltipEl.innerHTML = `
      <span class="tooltip-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
      </span>
      <span class="tooltip-text">${escapeHtml(text)}</span>
    `;

    const rect = target.getBoundingClientRect();
    tooltipEl.classList.add("visible");

    const tipWidth = tooltipEl.offsetWidth || 260;
    const tipHeight = tooltipEl.offsetHeight || 38;

    let top = rect.top - tipHeight - 10;
    let left = rect.left + (rect.width / 2) - (tipWidth / 2);

    if (top < 10) {
      top = rect.bottom + 10;
    }

    if (left < 12) left = 12;
    if (left + tipWidth > window.innerWidth - 12) {
      left = window.innerWidth - tipWidth - 12;
    }

    tooltipEl.style.top = `${Math.round(top)}px`;
    tooltipEl.style.left = `${Math.round(left)}px`;
  });

  document.addEventListener("mouseout", (e) => {
    const target = e.target.closest("[data-tooltip]");
    if (target && tooltipEl) {
      tooltipEl.classList.remove("visible");
    }
  });
}

// =============================================================================
// VS Code Light+ Syntax Highlighter
// =============================================================================
function highlightCode(code, lang = "js") {
  if (!code) return "";

  let html = escapeHtml(code);

  const comments = [];
  html = html.replace(/(\/\/.*$|#\s+.*$|\/\*[\s\S]*?\*\/)/gm, (match) => {
    comments.push(match);
    return `___COMMENT_${comments.length - 1}___`;
  });

  const strings = [];
  html = html.replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`|"(?:\\"|[^"])*"|'(?:\\'|[^'])*')/g, (match) => {
    strings.push(match);
    return `___STRING_${strings.length - 1}___`;
  });

  const keywords = /\b(const|let|var|function|async|await|return|if|else|try|catch|new|import|from|require|export|class|public|private|static|def|as|exit|time)\b/g;
  html = html.replace(keywords, '<span class="hl-keyword">$1</span>');

  const builtins = /\b(fetch|console|window|document|JSON|URLSearchParams|alert|log|warn|error|axios|curl_init|curl_setopt|curl_exec|curl_close|json_encode|json_decode|header|requests|print|post)\b/g;
  html = html.replace(builtins, '<span class="hl-builtin">$1</span>');

  html = html.replace(/\b(\d+(\.\d+)?|true|false|null|undefined)\b/g, '<span class="hl-number">$1</span>');

  html = html.replace(/___STRING_(\d+)___/g, (_, idx) => `<span class="hl-string">${strings[Number(idx)]}</span>`);
  html = html.replace(/___COMMENT_(\d+)___/g, (_, idx) => `<span class="hl-comment">${comments[Number(idx)]}</span>`);

  return html;
}

function initDocCallbackHighlighting() {
  const cbCode = `// Put this code on your callbackURL / thankyou page:
const params = new URLSearchParams(window.location.search);
const paymentStatus = params.get("status");       // "success" | "failure" | "cancel"
const paymentID = params.get("paymentID");         // bKash Payment ID
const trxID = params.get("trxID");                 // e.g. BKASH_TRX_987654

if (paymentStatus === "success") {
  console.log("Payment Confirmed! TrxID:", trxID, "PaymentID:", paymentID);
  // Fulfill order / update status in your database
} else {
  console.warn("Payment was cancelled or failed:", paymentStatus);
}`;

  const adminCb = document.getElementById("codeCallbackHandler");
  if (adminCb) adminCb.innerHTML = `<code>${highlightCode(cbCode, 'js')}</code>`;

  const clientCb = document.getElementById("codeClientCallbackHandler");
  if (clientCb) clientCb.innerHTML = `<code>${highlightCode(cbCode, 'js')}</code>`;
}

function copySnippet(elementId) {
  const el = document.getElementById(elementId);
  if (el) copyToClipboard(el.textContent);
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let iconSvg = "";
  if (type === "success") {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === "error" || type === "danger") {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `
    <div class="toast-icon-wrap">${iconSvg}</div>
    <span style="font-weight: 700; font-size: 0.86rem; color: #0F172A;">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(15px) scale(0.95)";
    toast.style.transition = "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function formatDate(isoStr) {
  if (!isoStr) return "-";
  try {
    return new Date(isoStr).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch (e) { return isoStr; }
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function handleRefreshOverview(btn) {
  if (btn) btn.classList.add("is-refreshing");
  try {
    await Promise.all([
      typeof loadServerStats === "function" ? loadServerStats() : Promise.resolve(),
      typeof loadAdminProjects === "function" ? loadAdminProjects() : Promise.resolve(),
      typeof loadAdminTransactions === "function" ? loadAdminTransactions() : Promise.resolve()
    ]);
  } catch (err) {
    console.error("Refresh error:", err);
  } finally {
    setTimeout(() => {
      if (btn) btn.classList.remove("is-refreshing");
    }, 600);
  }
}

async function handleRefreshTransactions(btn) {
  if (btn) btn.classList.add("is-refreshing");
  try {
    await loadAdminTransactions();
  } catch (err) {
    console.error("Refresh error:", err);
  } finally {
    setTimeout(() => {
      if (btn) btn.classList.remove("is-refreshing");
    }, 600);
  }
}

async function handleRefreshClient(btn) {
  if (btn) btn.classList.add("is-refreshing");
  try {
    await loadClientTransactions();
  } catch (err) {
    console.error("Refresh error:", err);
  } finally {
    setTimeout(() => {
      if (btn) btn.classList.remove("is-refreshing");
    }, 600);
  }
}

function openClientProfileModal() {
  if (!currentUser || !currentUser.data) return;
  const project = currentUser.data;
  const initial = (project.project_name || "M").charAt(0).toUpperCase();

  const avatar = document.getElementById("profModalAvatar");
  if (avatar) avatar.textContent = initial;

  const headerName = document.getElementById("profModalHeaderName");
  if (headerName) headerName.textContent = project.project_name || "Merchant Profile";

  const projName = document.getElementById("profModalProjectName");
  if (projName) projName.textContent = project.project_name || "-";

  const email = document.getElementById("profModalEmail");
  if (email) email.textContent = project.owner_email || "-";

  const phone = document.getElementById("profModalPhone");
  if (phone) phone.textContent = project.owner_phone || "-";

  const web = document.getElementById("profModalWebsite");
  if (web) web.textContent = project.website_url || "-";

  const key = document.getElementById("profModalLicenseKey");
  if (key) key.textContent = project.license_key || "-";

  const modal = document.getElementById("clientProfileModal");
  if (modal) modal.classList.add("active");
}

function closeClientProfileModal() {
  const modal = document.getElementById("clientProfileModal");
  if (modal) modal.classList.remove("active");
}

window.toggleLicenseKeyVisibility = toggleLicenseKeyVisibility;
window.openClientProfileModal = openClientProfileModal;
window.closeClientProfileModal = closeClientProfileModal;
window.switchClientTab = switchClientTab;
window.switchClientCodeTab = switchClientCodeTab;
window.handleClientTransactionSearch = handleClientTransactionSearch;
window.handleUnifiedLogin = handleUnifiedLogin;
window.handleLogout = handleLogout;
window.switchAdminTab = switchAdminTab;
window.openNewProjectModal = openNewProjectModal;
window.closeNewProjectModal = closeNewProjectModal;
window.openEditProjectModal = openEditProjectModal;
window.closeEditProjectModal = closeEditProjectModal;
window.handleUpdateProject = handleUpdateProject;
window.handleCreateProject = handleCreateProject;
window.toggleProjectStatus = toggleProjectStatus;
window.filterAdminTransactions = filterAdminTransactions;
window.handleAdminOverviewSearch = handleAdminOverviewSearch;
window.handleAdminProjectSearch = handleAdminProjectSearch;
window.handleRefreshOverview = handleRefreshOverview;
window.handleRefreshTransactions = handleRefreshTransactions;
window.handleRefreshClient = handleRefreshClient;
window.toggleProjectDropdown = toggleProjectDropdown;
window.selectProjectFilter = selectProjectFilter;
window.loadAdminDashboardData = () => { loadServerStats(); loadAdminProjects(); loadAdminTransactions(); };
window.loadAdminTransactions = loadAdminTransactions;
window.loadClientTransactions = loadClientTransactions;
window.copyToClipboard = copyToClipboard;
window.copySnippet = copySnippet;
window.copyProjectKey = copyProjectKey;
window.copyGatewayBaseUrl = copyGatewayBaseUrl;
window.saveGatewaySettings = saveGatewaySettings;
window.switchCodeTab = switchCodeTab;
