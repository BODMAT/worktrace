import type { AuthMessage, AuthResponse } from "../types/auth";

function sendMessage(message: AuthMessage): Promise<AuthResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

const statusEl = document.getElementById("auth-status") as HTMLParagraphElement;
const btnLogin = document.getElementById("btn-login") as HTMLButtonElement;
const btnLogout = document.getElementById("btn-logout") as HTMLButtonElement;

// Check auth status when popup opens
sendMessage({ type: "AUTH_GET_STATUS" }).then((res) => {
  if (res.success && "isAuthenticated" in res) {
    statusEl.textContent = res.isAuthenticated ? "✅ Signed in" : "❌ Not signed in";
  }
});

btnLogin.addEventListener("click", async () => {
  btnLogin.disabled = true;
  statusEl.textContent = "Signing in...";
  const res = await sendMessage({ type: "AUTH_LOGIN" });
  statusEl.textContent = res.success ? "✅ Signed in" : `❌ ${!res.success ? res.error : ""}`;
  btnLogin.disabled = false;
});

btnLogout.addEventListener("click", async () => {
  await sendMessage({ type: "AUTH_LOGOUT" });
  statusEl.textContent = "❌ Not signed in";
});
