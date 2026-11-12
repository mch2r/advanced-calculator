(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CalculatorPWA = factory();
    root.CalculatorPWA.init(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SERVICE_WORKER_PATH = "./service-worker.js";
  const STANDALONE_QUERY = "(display-mode: standalone)";

  function isStandalone(win) {
    if (!win) {
      return false;
    }

    if (win.navigator && win.navigator.standalone === true) {
      return true;
    }

    try {
      return Boolean(win.matchMedia && win.matchMedia(STANDALONE_QUERY).matches);
    } catch (error) {
      return false;
    }
  }

  function canRegisterServiceWorker(win) {
    if (!win || !win.navigator || !("serviceWorker" in win.navigator) || !win.location) {
      return false;
    }

    const protocol = String(win.location.protocol || "");
    const hostname = String(win.location.hostname || "");

    return (
      protocol === "https:" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  }

  function warn(win, message, error) {
    if (win && win.console && typeof win.console.warn === "function") {
      win.console.warn(message, error);
    }
  }

  function registerServiceWorker(win) {
    if (!canRegisterServiceWorker(win)) {
      return Promise.resolve(null);
    }

    try {
      return win.navigator.serviceWorker
        .register(SERVICE_WORKER_PATH, { scope: "./", updateViaCache: "none" })
        .catch(function (error) {
          warn(win, "Service worker registration failed:", error);
          return null;
        });
    } catch (error) {
      warn(win, "Service worker registration failed:", error);
      return Promise.resolve(null);
    }
  }

  function createInstallController(win, doc) {
    if (!win || !doc || typeof doc.getElementById !== "function") {
      return null;
    }

    const button = doc.getElementById("install-app");

    if (!button) {
      return null;
    }

    let deferredPrompt = null;

    function hide() {
      button.hidden = true;
    }

    function show() {
      if (deferredPrompt && !isStandalone(win)) {
        button.hidden = false;
      }
    }

    function updateForDisplayMode() {
      if (isStandalone(win)) {
        hide();
      } else {
        show();
      }
    }

    function onBeforeInstallPrompt(event) {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }

      deferredPrompt = event;
      show();
    }

    function onAppInstalled() {
      deferredPrompt = null;
      hide();
    }

    function onInstallClick() {
      if (!deferredPrompt) {
        return;
      }

      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      hide();

      try {
        const promptResult = promptEvent.prompt();

        if (promptResult && typeof promptResult.then === "function") {
          promptResult.catch(function (error) {
            warn(win, "Install prompt failed:", error);
          });
        }

        if (promptEvent.userChoice && typeof promptEvent.userChoice.then === "function") {
          promptEvent.userChoice
            .then(function (choice) {
              if (choice && choice.outcome === "accepted") {
                hide();
              }
            })
            .catch(function (error) {
              warn(win, "Install choice failed:", error);
            });
        }
      } catch (error) {
        warn(win, "Install prompt failed:", error);
      }
    }

    if (typeof win.addEventListener === "function") {
      win.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      win.addEventListener("appinstalled", onAppInstalled);
    }

    if (typeof button.addEventListener === "function") {
      button.addEventListener("click", onInstallClick);
    }

    try {
      const query = win.matchMedia && win.matchMedia(STANDALONE_QUERY);

      if (query) {
        if (typeof query.addEventListener === "function") {
          query.addEventListener("change", updateForDisplayMode);
        } else if (typeof query.addListener === "function") {
          query.addListener(updateForDisplayMode);
        }
      }
    } catch (error) {
      updateForDisplayMode();
    }

    updateForDisplayMode();

    return {
      button: button,
      show: show,
      hide: hide,
      isStandalone: function () {
        return isStandalone(win);
      },
    };
  }

  function init(win) {
    if (!win || !win.document) {
      return null;
    }

    function start() {
      const install = createInstallController(win, win.document);
      registerServiceWorker(win);
      return install;
    }

    if (win.document.readyState === "loading") {
      win.document.addEventListener("DOMContentLoaded", start, { once: true });
      return null;
    }

    return start();
  }

  return {
    SERVICE_WORKER_PATH: SERVICE_WORKER_PATH,
    STANDALONE_QUERY: STANDALONE_QUERY,
    init: init,
    isStandalone: isStandalone,
    canRegisterServiceWorker: canRegisterServiceWorker,
    registerServiceWorker: registerServiceWorker,
    createInstallController: createInstallController,
  };
});
