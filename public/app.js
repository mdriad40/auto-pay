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

function showMerchantView() {
  document.getElementById("loginSection").style.display = "none";
  document.getElementById("adminDashboardView").style.display = "none";
  document.getElementById("merchantDashboardView").style.display = "flex";

  const project = currentUser.data;
  document.getElementById("merchantProjectTitle").textContent = project.project_name;
  document.getElementById("merchantProjectSub").textContent = project.website_url;
  document.getElementById("dispProjectName").textContent = project.project_name;
  document.getElementById("dispApiKey").textContent = project.api_key;
  document.getElementById("dispLicenseKey").textContent = project.license_key;

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
  await loadServerStats();
  await loadAdminProjects();
  await loadAdminTransactions();
  subscribeAdminRealtime();
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No projects registered yet. Click "Create Project" to add.</td></tr>`;
    return;
  }

  tbody.innerHTML = projects.map(p => `
    <tr>
      <td><strong>${escapeHtml(p.project_name)}</strong></td>
      <td style="font-size:0.85rem;">${escapeHtml(p.owner_email)}</td>
      <td><span class="key-pill">${escapeHtml(p.website_url)}</span></td>
      <td>
        <span class="key-pill">
          ${p.api_key.substring(0, 8)}...${p.api_key.slice(-4)}
          <button class="copy-icon-btn" onclick="copyToClipboard('${p.api_key}')">📋</button>
        </span>
      </td>
      <td>
        <span class="key-pill">
          ${p.license_key.substring(0, 8)}...${p.license_key.slice(-4)}
          <button class="copy-icon-btn" onclick="copyToClipboard('${p.license_key}')">📋</button>
        </span>
      </td>
      <td>
        <span class="status-pill ${p.is_active ? 'status-completed' : 'status-failed'}">
          ${p.is_active ? 'Active' : 'Disabled'}
        </span>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="toggleProjectStatus('${p.id}', ${!p.is_active})">
          ${p.is_active ? 'Deactivate' : 'Activate'}
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
    const todayStr = new Date().toISOString().slice(0, 10);

    allTransactions.forEach(tx => {
      if (tx.status === "Completed") {
        totalVol += Number(tx.amount) || 0;
        completed++;
        if (tx.created_at && tx.created_at.startsWith(todayStr)) {
          todayVol += Number(tx.amount) || 0;
        }
      }
    });

    document.getElementById("statTotalVolume").textContent = `৳ ${totalVol.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById("statTodayVolume").textContent = `৳ ${todayVol.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById("statCompletedCount").textContent = completed;
  } catch (err) {
    console.error(err);
  }
}

function renderOverviewTransactions(transactions) {
  const tbody = document.getElementById("overviewTransactionsTableBody");
  if (!tbody) return;

  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">No transactions recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = transactions.map(tx => `
    <tr>
      <td style="font-size:0.8rem; color:var(--text-muted);">${formatDate(tx.created_at)}</td>
      <td><strong style="color:var(--bkash-pink);">${escapeHtml(tx.project_name)}</strong></td>
      <td><span class="key-pill">${tx.trx_id ? escapeHtml(tx.trx_id) : (tx.payment_id ? tx.payment_id.substring(0, 10) + '...' : '-')}</span></td>
      <td>${escapeHtml(tx.customer_phone || "bKash Customer")}</td>
      <td><strong>৳ ${Number(tx.amount).toFixed(2)}</strong></td>
      <td><span class="status-pill status-${(tx.status || '').toLowerCase()}">${escapeHtml(tx.status || 'Unknown')}</span></td>
    </tr>
  `).join("");
}

function renderAllTransactions(transactions) {
  const tbody = document.getElementById("allTransactionsTableBody");
  if (!tbody) return;

  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">No transactions matching filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = transactions.map(tx => `
    <tr>
      <td style="font-size:0.8rem; color:var(--text-muted);">${formatDate(tx.created_at)}</td>
      <td><strong style="color:var(--bkash-pink);">${escapeHtml(tx.project_name)}</strong></td>
      <td style="font-family:monospace; font-size:0.82rem;">${escapeHtml(tx.merchant_invoice_number || '-')}</td>
      <td><span class="key-pill" style="color:#065F46; font-weight:700;">${escapeHtml(tx.trx_id || '-')}</span></td>
      <td><span class="key-pill" style="font-size:0.7rem;">${escapeHtml(tx.payment_id || '-')}</span></td>
      <td>${escapeHtml(tx.customer_phone || '-')}</td>
      <td><strong>৳ ${Number(tx.amount).toFixed(2)}</strong></td>
      <td><span class="status-pill status-${(tx.status || '').toLowerCase()}">${escapeHtml(tx.status || 'Unknown')}</span></td>
    </tr>
  `).join("");
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

function updateProjectFilterDropdown(projects) {
  const select = document.getElementById("projectFilterSelect");
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = `<option value="ALL">All Projects</option>` + projects.map(p => `
    <option value="${escapeHtml(p.project_name)}">${escapeHtml(p.project_name)}</option>
  `).join("");
  select.value = currentVal;
}

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
    renderClientTransactions(data || []);
  } catch (err) {
    console.error(err);
  }
}

function renderClientTransactions(txList) {
  const tbody = document.getElementById("merchantTransactionsBody");
  let total = 0;
  let today = 0;
  let completed = 0;
  const todayStr = new Date().toISOString().slice(0, 10);

  txList.forEach(t => {
    if (t.status === "Completed") {
      const amt = Number(t.amount) || 0;
      total += amt;
      completed++;
      if (t.created_at && t.created_at.startsWith(todayStr)) {
        today += amt;
      }
    }
  });

  document.getElementById("projStatTotalVol").textContent = `৳ ${total.toFixed(2)}`;
  document.getElementById("projStatTodayVol").textContent = `৳ ${today.toFixed(2)}`;
  document.getElementById("projStatOrders").textContent = completed;

  if (txList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No payment records found for your project yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = txList.map(t => `
    <tr>
      <td style="font-size:0.8rem; color:var(--text-muted);">${formatDate(t.created_at)}</td>
      <td style="font-family:monospace; font-size:0.82rem;">${escapeHtml(t.merchant_invoice_number || '-')}</td>
      <td><span class="key-pill" style="color:#065F46; font-weight:700;">${escapeHtml(t.trx_id || '-')}</span></td>
      <td><span class="key-pill" style="font-size:0.7rem;">${escapeHtml(t.payment_id || '-')}</span></td>
      <td>${escapeHtml(t.customer_phone || 'Customer')}</td>
      <td><strong>৳ ${Number(t.amount).toFixed(2)}</strong></td>
      <td><span class="status-pill status-${(t.status || '').toLowerCase()}">${escapeHtml(t.status)}</span></td>
    </tr>
  `).join("");
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
  const txt = document.getElementById(elemId).textContent;
  copyToClipboard(txt);
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

function copySnippet(elementId) {
  const el = document.getElementById(elementId);
  if (el) copyToClipboard(el.textContent);
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
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

// Global Window Exports
window.handleUnifiedLogin = handleUnifiedLogin;
window.handleLogout = handleLogout;
window.switchAdminTab = switchAdminTab;
window.openNewProjectModal = openNewProjectModal;
window.closeNewProjectModal = closeNewProjectModal;
window.handleCreateProject = handleCreateProject;
window.toggleProjectStatus = toggleProjectStatus;
window.filterAdminTransactions = filterAdminTransactions;
window.loadAdminDashboardData = () => { loadServerStats(); loadAdminProjects(); loadAdminTransactions(); };
window.loadAdminTransactions = loadAdminTransactions;
window.loadClientTransactions = loadClientTransactions;
window.copyToClipboard = copyToClipboard;
window.copySnippet = copySnippet;
window.copyProjectKey = copyProjectKey;
