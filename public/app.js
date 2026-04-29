document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab-button]");

  if (!button) return;

  const tab = button.getAttribute("data-tab-button");

  document.querySelectorAll("[data-tab-button]").forEach((item) => {
    item.classList.toggle("active", item === button);
  });

  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.classList.toggle(
      "active",
      panel.getAttribute("data-tab-panel") === tab
    );
  });
});