(() => {
  // Direct Giphy image URLs (gif/webp)
  const GIF_RE =
    /^https?:\/\/(?:media\d*\.giphy\.com\/media\/[^\s"'<>]+?\.(?:gif|webp)|i\.giphy\.com\/[^\s"'<>]+?\.(?:gif|webp))(?:\?[^\s"'<>]*)?$/i;
  // Giphy page links, e.g. https://giphy.com/gifs/funny-cat-xT9IgzoKnwFNmISR8I
  const PAGE_RE =
    /^https?:\/\/(?:www\.)?giphy\.com\/(?:gifs|stickers|embed)\/(?:[^\s"'<>\/?#]*-)?([A-Za-z0-9]+)\/?(?:[?#].*)?$/i;

  let panel = null;
  let activeBox = null;
  let searchTimer = null;

  function toGifUrl(raw) {
    if (!raw) return null;
    raw = raw.trim();
    if (GIF_RE.test(raw)) return raw;
    const m = raw.match(PAGE_RE);
    if (m) return `https://media.giphy.com/media/${m[1]}/giphy.gif`;
    return null;
  }

  function insertIntoBox(box, url) {
    const editor = box.querySelector("#contenteditable-root");
    if (!editor) return;
    editor.focus();
    const prefix = editor.textContent.trim() ? " " : "";
    document.execCommand("insertText", false, prefix + url);
  }

  function closePanel() {
    if (panel) panel.remove();
    panel = null;
    activeBox = null;
  }

  function openPanel(btn, box) {
    if (panel) {
      closePanel();
      return;
    }
    activeBox = box;
    panel = document.createElement("div");
    panel.className = "ytgif-panel";
    panel.innerHTML = `
      <input class="ytgif-search" type="text" placeholder="Search GIFs...">
      <div class="ytgif-grid"></div>
      <div class="ytgif-paste">
        <input class="ytgif-url" type="text" placeholder="Or paste a GIF link">
        <button class="ytgif-add" type="button">Add</button>
      </div>`;
    document.body.appendChild(panel);

    const r = btn.getBoundingClientRect();
    panel.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 420)) + "px";
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 340)) + "px";

    const search = panel.querySelector(".ytgif-search");
    const grid = panel.querySelector(".ytgif-grid");

    const load = (q) => {
      grid.textContent = "Loading...";
      chrome.runtime.sendMessage({ type: "search", q }, (res) => {
        if (!panel) return;
        grid.textContent = "";
        if (!res || res.error === "nokey") {
          grid.textContent =
            "Add your free Giphy API key first: click the extension icon in the toolbar.";
          return;
        }
        if (res.error) {
          grid.textContent = "Error: " + res.error;
          return;
        }
        if (!res.gifs.length) {
          grid.textContent = "No GIFs found.";
          return;
        }
        res.gifs.forEach((g) => {
          const img = document.createElement("img");
          img.src = g.preview;
          img.loading = "lazy";
          img.addEventListener("click", () => {
            insertIntoBox(activeBox, g.url);
            closePanel();
          });
          grid.appendChild(img);
        });
      });
    };

    search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => load(search.value.trim()), 400);
    });

    const urlInput = panel.querySelector(".ytgif-url");
    panel.querySelector(".ytgif-add").addEventListener("click", () => {
      const v = urlInput.value.trim();
      if (!v) return;
      insertIntoBox(activeBox, v);
      closePanel();
    });

    load("");
    search.focus();
  }

  document.addEventListener("mousedown", (e) => {
    if (panel && !panel.contains(e.target) && !e.target.closest(".ytgif-btn")) closePanel();
  });

  function addButtons() {
    document.querySelectorAll("ytd-commentbox").forEach((box) => {
      if (box.querySelector(".ytgif-btn")) return;
      const emoji = box.querySelector("#emoji-button");
      const host = emoji ? emoji.parentElement : box.querySelector("#footer");
      if (!host) return;
      const btn = document.createElement("button");
      btn.className = "ytgif-btn";
      btn.type = "button";
      btn.textContent = "GIF";
      btn.title = "Add a GIF";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPanel(btn, box);
      });
      if (emoji) emoji.insertAdjacentElement("afterend", btn);
      else host.appendChild(btn);
    });
  }

  // YouTube wraps outgoing links in /redirect?q=<real url>
  function realHref(a) {
    let href = a.href || a.getAttribute("href") || "";
    try {
      const u = new URL(href, location.href);
      if (u.pathname === "/redirect") href = u.searchParams.get("q") || href;
    } catch (e) {}
    return href;
  }

  function renderGifs() {
    document.querySelectorAll("#content-text").forEach((el) => {
      // 1) find GIF links (by href, then by visible text)
      const found = [];
      el.querySelectorAll("a").forEach((a) => {
        const gif = toGifUrl(realHref(a)) || toGifUrl(a.textContent);
        if (gif) found.push({ gif, a });
      });
      // 2) fallback: URL present as plain text (not linkified)
      if (!found.length) {
        (el.textContent.match(/https?:\/\/[^\s"'<>]+/g) || []).forEach((u) => {
          const gif = toGifUrl(u);
          if (gif) found.push({ gif, a: null });
        });
      }

      const urls = [...new Set(found.map((f) => f.gif))].slice(0, 3);
      const sig = urls.join("|");

      let wrap = el.nextElementSibling;
      if (!wrap || !wrap.classList.contains("ytgif-wrap")) wrap = null;

      // No GIF here (YouTube may have recycled this element): drop stale preview
      if (!sig) {
        if (wrap) wrap.remove();
        return;
      }

      // Already rendered for this exact content: just keep links hidden
      if (wrap && wrap.dataset.sig === sig) {
        if (wrap.dataset.loaded) found.forEach((f) => f.a && (f.a.style.display = "none"));
        return;
      }
      if (wrap) wrap.remove();

      wrap = document.createElement("div");
      wrap.className = "ytgif-wrap";
      wrap.dataset.sig = sig;

      urls.forEach((url) => {
        const img = document.createElement("img");
        img.className = "ytgif-img";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("load", () => {
          wrap.dataset.loaded = "1";
          // hide the raw link only once the GIF actually loaded
          found.forEach((f) => {
            if (f.a && f.gif === url) f.a.style.display = "none";
          });
        });
        img.addEventListener("error", () => {
          img.remove();
          if (!wrap.querySelector("img")) wrap.hidden = true; // keep link visible
        });
        img.src = url;
        wrap.appendChild(img);
      });

      el.insertAdjacentElement("afterend", wrap);
    });
  }

  let tick = null;
  function schedule() {
    if (tick) return;
    tick = setTimeout(() => {
      tick = null;
      addButtons();
      renderGifs();
    }, 500);
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("yt-navigate-finish", schedule);
  schedule();
})();
