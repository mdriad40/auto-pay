/**
 * ============================================================================
 * Gateway Configuration (Safe for Client & Server)
 * ============================================================================
 * - Client Browser only gets public Supabase config
 * - bKash Master Credentials are read STRICTLY from server-side environment variables (.env)
 * ============================================================================
 */

// Auto-load .env file into process.env if in Node.js environment
if (typeof process !== "undefined" && typeof require !== "undefined") {
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx).trim();
            const val = trimmed.substring(eqIdx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
    }
  } catch (e) {}
}

const isServer = typeof process !== "undefined" && process.env;

const GATEWAY_CONFIG = {
  // Supabase Configuration (Public Anon Key)
  supabase: {
    url: (isServer && process.env.SUPABASE_URL) ? process.env.SUPABASE_URL : "https://gruzpbfhhujmerwbdamo.supabase.co",
    anonKey: (isServer && process.env.SUPABASE_ANON_KEY) ? process.env.SUPABASE_ANON_KEY : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydXpwYmZoaHVqbWVyd2JkYW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MTQ5MDksImV4cCI6MjEwNTk5MDkwOX0.AFgJ-IKIVRx0_2wqCBvjPx_wNEGexD7kcFk69EL_sQM"
  },

  // Official Master bKash PGW Credentials
  // STRICTLY AVAILABLE ON SERVER ONLY (EMPTY IN BROWSER)
  bkash: isServer ? {
    username: process.env.BKASH_USERNAME || "",
    password: process.env.BKASH_PASSWORD || "",
    app_key: process.env.BKASH_APP_KEY || "",
    app_secret: process.env.BKASH_APP_SECRET || "",
    isSandbox: process.env.BKASH_IS_SANDBOX === "true",
    sandboxBaseURL: "https://tokenized.sandbox.bka.sh/v1.2.0-beta",
    liveBaseURL: "https://tokenized.pay.bka.sh/v1.2.0-beta"
  } : {},

  server: {
    port: (isServer && process.env.PORT) ? Number(process.env.PORT) : 7000
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = GATEWAY_CONFIG;
}
if (typeof window !== "undefined") {
  window.GATEWAY_CONFIG = GATEWAY_CONFIG;
}
