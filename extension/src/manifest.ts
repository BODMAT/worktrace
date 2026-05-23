import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "WorkTrace",
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
  ],
  permissions: ["storage", "activeTab", "tabs", "identity", "alarms"],
  host_permissions: [
    "http://localhost:3000/*",
    "https://worktrace-ecru.vercel.app/*",
  ],
});
