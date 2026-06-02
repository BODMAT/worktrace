import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "WorkTrace",
  key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvSo1/6UBVPUowjH+mwCmWB30I85MGpNqEvf/uDMQqPcC/+VK7iXahcqQcT1xXo3W/6tXeHVWuDfFslkKw6NZSFrlF7+4AUfl2JPKh4Rd/K5iAnM4BoTKQGx9v6wlR1RYIEgGQ+/nDyc7w1zAI+2oNsrUf+Uw10xDWzDR9fFDntpSgnq/ogR3ojrnnlJdbHIqjYIhdbF832I8Cu1+pMPo/BYbEE9/GFUnV7oNTQARF6Z46w4FZXmD5OLHQPBiAnXqO0u4FM2mKT7BjR64jgYtPhbvwJxYtx8BJPNyfukXq3wwVn7Is9a2iHaYaRg2GB6BSwXmG71sgJHvyHUuSRSlVQIDAQAB",
  version: pkg.version,
  description: "Capture dev session context for AI-generated reports.",
  icons: {
    "16": "src/icons/icon-16.png",
    "32": "src/icons/icon-32.png",
    "48": "src/icons/icon-48.png",
    "128": "src/icons/icon-128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "WorkTrace",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
    {
      matches: ["https://music.youtube.com/*"],
      js: ["src/content/ytm.ts"],
      run_at: "document_idle",
    },
    {
      matches: ["https://soundcloud.com/*"],
      js: ["src/content/soundcloud.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage", "activeTab", "tabs", "identity", "alarms"],
  host_permissions: [
    "http://localhost:3000/*",
    "https://worktrace-ecru.vercel.app/*",
    "https://music.youtube.com/*",
    "https://soundcloud.com/*",
  ],
});
