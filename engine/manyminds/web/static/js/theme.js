// Shared light/dark theme controller.
// The theme is a site-wide preference persisted in localStorage and applied
// to <html data-theme="...">. Any element with class "theme-toggle" flips it.
(function () {
  var KEY = "mm-theme";

  function current() {
    return document.documentElement.getAttribute("data-theme") === "light"
      ? "light"
      : "dark";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var label =
      theme === "light" ? "Switch to dark theme" : "Switch to light theme";
    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      btn.setAttribute("aria-label", label);
      btn.setAttribute("aria-pressed", String(theme === "light"));
    });
  }

  function toggle() {
    var next = current() === "light" ? "dark" : "light";
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
    apply(next);
  }

  function wire() {
    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      if (btn.dataset.themeWired) return;
      btn.dataset.themeWired = "1";
      btn.addEventListener("click", toggle);
    });
    apply(current());
  }

  window.MMTheme = { toggle: toggle, apply: apply, current: current };

  if (document.readyState !== "loading") {
    wire();
  } else {
    document.addEventListener("DOMContentLoaded", wire);
  }
})();
