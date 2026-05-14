console.log("[worktrace] service worker booted");

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[worktrace] installed", details.reason);
});
