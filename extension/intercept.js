// Runs in MAIN world — has direct access to page's fetch and XHR.
// Intercepts X's bookmark GraphQL responses.

(function () {
  console.log("[XBS] Intercept script loaded in MAIN world");

  // --- Patch fetch ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";

    // Log all GraphQL calls for debugging
    if (url.includes("/i/api/graphql/")) {
      console.log("[XBS] GraphQL fetch:", url.split("?")[0]);
    }

    if (url.includes("/i/api/graphql/") && /bookmark/i.test(url)) {
      console.log("[XBS] Bookmark fetch intercepted!");
      try {
        const cloned = response.clone();
        const json = await cloned.json();
        window.postMessage({ type: "XBS_BOOKMARKS_INTERCEPTED", payload: json }, "*");
      } catch (e) {
        console.error("[XBS] Failed to parse fetch response:", e);
      }
    }

    return response;
  };

  // --- Patch XMLHttpRequest ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._xbsUrl = url;
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._xbsUrl && this._xbsUrl.includes("/i/api/graphql/")) {
      console.log("[XBS] GraphQL XHR:", this._xbsUrl.split("?")[0]);
    }

    if (this._xbsUrl && this._xbsUrl.includes("/i/api/graphql/") && /bookmark/i.test(this._xbsUrl)) {
      console.log("[XBS] Bookmark XHR intercepted!");
      this.addEventListener("load", function () {
        try {
          const json = JSON.parse(this.responseText);
          window.postMessage({ type: "XBS_BOOKMARKS_INTERCEPTED", payload: json }, "*");
        } catch (e) {
          console.error("[XBS] Failed to parse XHR response:", e);
        }
      });
    }

    return originalSend.apply(this, args);
  };

  console.log("[XBS] fetch and XHR patched successfully");
})();
