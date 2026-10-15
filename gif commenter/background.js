chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "search") return;

  chrome.storage.sync.get("apiKey").then(({ apiKey }) => {
    if (!apiKey) {
      sendResponse({ error: "nokey" });
      return;
    }
    const endpoint = msg.q ? "search" : "trending";
    const params = new URLSearchParams({ api_key: apiKey, limit: "24", rating: "pg-13" });
    if (msg.q) params.set("q", msg.q);

    fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error("Giphy error " + r.status + " (check your key)");
        return r.json();
      })
      .then((j) =>
        sendResponse({
          gifs: (j.data || []).map((g) => ({
            preview: g.images.fixed_height_small.url,
            url: `https://media.giphy.com/media/${g.id}/giphy.gif`
          }))
        })
      )
      .catch((e) => sendResponse({ error: String(e.message || e) }));
  });

  return true;
});
