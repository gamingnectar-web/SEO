(function () {
  const panel = document.querySelector("[data-keyword-modal-panel]");
  if (!panel) return;

  const keywordEl = panel.querySelector("[data-modal-keyword]");
  const scoreEl = panel.querySelector("[data-modal-score]");
  const rankEl = panel.querySelector("[data-modal-rank]");
  const volumeEl = panel.querySelector("[data-modal-volume]");
  const valueEl = panel.querySelector("[data-modal-value]");
  const summaryEl = panel.querySelector("[data-modal-summary]");
  const actionsEl = panel.querySelector("[data-modal-actions]");

  document.addEventListener("click", function (event) {
    const openButton = event.target.closest("[data-keyword-modal]");

    if (openButton) {
      const keyword = decodeURIComponent(openButton.dataset.keyword || "");
      const score = openButton.dataset.score || "0";
      const rank = openButton.dataset.rank || "—";
      const volume = openButton.dataset.volume || "0";
      const value = openButton.dataset.value || "0";

      let advice = {};

      try {
        advice = JSON.parse(decodeURIComponent(openButton.dataset.advice || "{}"));
      } catch {
        advice = {};
      }

      keywordEl.textContent = keyword;
      scoreEl.textContent = `${score}/100`;
      rankEl.textContent = rank ? `#${rank}` : "—";
      volumeEl.textContent = volume;
      valueEl.textContent = `£${value}`;
      summaryEl.textContent = advice.summary || "No advice has been generated for this keyword yet.";

      actionsEl.innerHTML = "";

      (advice.actions || []).forEach(function (action) {
        const li = document.createElement("li");
        li.textContent = action;
        actionsEl.appendChild(li);
      });

      panel.removeAttribute("hidden");
      return;
    }

    if (event.target.closest("[data-keyword-modal-close]")) {
      panel.setAttribute("hidden", "");
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      panel.setAttribute("hidden", "");
    }
  });
})();