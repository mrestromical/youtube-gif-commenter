const key = document.getElementById("key");
const status = document.getElementById("status");
chrome.storage.sync.get("apiKey").then(({ apiKey }) => { if (apiKey) key.value = apiKey; });
document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set({ apiKey: key.value.trim() }).then(() => {
    status.textContent = "Saved!";
    setTimeout(() => (status.textContent = ""), 1500);
  });
});
