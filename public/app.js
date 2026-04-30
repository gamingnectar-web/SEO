document.addEventListener("click", (event) => {
  const tabButton = event.target.closest("[data-tab-button]");

  if (tabButton) {
    const tab = tabButton.getAttribute("data-tab-button");

    document.querySelectorAll("[data-tab-button]").forEach((item) => {
      item.classList.toggle("active", item === tabButton);
    });

    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      panel.classList.toggle(
        "active",
        panel.getAttribute("data-tab-panel") === tab
      );
    });

    return;
  }

  const checkButton = event.target.closest("[data-open-check-modal]");

  if (checkButton) {
    openCheckModal(checkButton);
    return;
  }

  const closeButton = event.target.closest("[data-close-check-modal]");

  if (closeButton) {
    closeCheckModal();
    return;
  }

  const backdrop = event.target.closest("[data-check-modal]");

  if (backdrop && event.target === backdrop) {
    closeCheckModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCheckModal();
  }
});

function openCheckModal(button) {
  const modal = document.querySelector("[data-check-modal]");

  if (!modal) return;

  const data = button.dataset;

  setText("[data-modal-category]", formatCategory(data.category || ""));
  setText("[data-modal-check-name]", data.checkName || "");
  setText("[data-modal-page-title]", data.pageTitle || "");
  setText("[data-modal-page-url]", data.pageUrl || "");
  setText(
    "[data-modal-status]",
    `${data.status || ""}${data.severity ? ` · ${data.severity}` : ""}`
  );
  setText("[data-modal-message]", data.message || "");
  setText(
    "[data-modal-evidence]",
    data.evidence ? `Evidence: ${data.evidence}` : ""
  );
  setText("[data-modal-why]", data.why || "");
  setText("[data-modal-how]", data.how || "");
  setText("[data-modal-example]", data.example || "");
  setText("[data-modal-business-impact]", data.businessImpact || "");
  setText("[data-modal-implementation-hint]", data.implementationHint || "");
  setText("[data-modal-expected-impact]", data.expectedImpact || "");
  setText("[data-modal-effort]", data.effort || "");

  toggleBlock("[data-modal-business-impact-block]", data.businessImpact);
  toggleBlock("[data-modal-implementation-hint-block]", data.implementationHint);
  toggleBlock("[data-modal-expected-impact-block]", data.expectedImpact);
  toggleBlock("[data-modal-effort-block]", data.effort);

  setValue("[data-field-audit-run-id]", data.auditRunId || "");
  setValue("[data-field-return-to]", data.returnTo || "/");
  setValue("[data-field-page-url]", data.pageUrl || "");
  setValue("[data-field-page-title]", data.pageTitle || "");
  setValue("[data-field-category]", data.category || "");
  setValue("[data-field-check-name]", data.checkName || "");
  setValue("[data-field-severity]", data.severity || "");
  setValue("[data-field-message]", data.message || "");
  setValue("[data-field-recommendation]", data.recommendation || "");
  setValue("[data-field-evidence]", data.evidence || "");
  setValue("[data-field-why]", data.why || "");
  setValue("[data-field-how]", data.how || "");
  setValue("[data-field-example]", data.example || "");
  setValue("[data-field-business-impact]", data.businessImpact || "");
  setValue("[data-field-implementation-hint]", data.implementationHint || "");
  setValue("[data-field-expected-impact]", data.expectedImpact || "");
  setValue("[data-field-effort]", data.effort || "");

  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeCheckModal() {
  const modal = document.querySelector("[data-check-modal]");

  if (!modal) return;

  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function setText(selector, value) {
  const element = document.querySelector(selector);

  if (element) {
    element.textContent = value;
  }
}

function setValue(selector, value) {
  const element = document.querySelector(selector);

  if (element) {
    element.value = value;
  }
}

function toggleBlock(selector, value) {
  const element = document.querySelector(selector);

  if (element) {
    element.hidden = !value;
  }
}

function formatCategory(value) {
  return String(value || "")
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}


const PAGE_SIZE = 10;

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    initialisePanelPagination(panel);
  });
});

function initialisePanelPagination(panel) {
  const cards = [...panel.querySelectorAll(".deep-card")];

  if (cards.length <= PAGE_SIZE) return;

  const controls = document.createElement("div");
  controls.className = "panel-controls";
  controls.innerHTML = `
    <input type="search" placeholder="Search URL or title..." data-panel-search />
    <select data-panel-status>
      <option value="all">All checks</option>
      <option value="fail">Failing checks only</option>
      <option value="pass">Passing checks only</option>
    </select>
    <button type="button" data-panel-load-more>Load more</button>
  `;

  const heading = panel.querySelector(".section-heading");
  heading?.insertAdjacentElement("afterend", controls);

  let visibleCount = PAGE_SIZE;

  const searchInput = controls.querySelector("[data-panel-search]");
  const statusSelect = controls.querySelector("[data-panel-status]");
  const loadMore = controls.querySelector("[data-panel-load-more]");

  function applyFilters() {
    const query = String(searchInput.value || "").toLowerCase();
    const status = statusSelect.value;

    const matchingCards = cards.filter((card) => {
      const text = card.textContent.toLowerCase();

      const matchesSearch = !query || text.includes(query);

      const matchesStatus =
        status === "all" ||
        (status === "fail" && card.querySelector(".check-fail")) ||
        (status === "pass" && card.querySelector(".check-pass"));

      return matchesSearch && matchesStatus;
    });

    cards.forEach((card) => {
      card.hidden = true;
    });

    matchingCards.slice(0, visibleCount).forEach((card) => {
      card.hidden = false;
    });

    loadMore.hidden = matchingCards.length <= visibleCount;
  }

  searchInput.addEventListener("input", () => {
    visibleCount = PAGE_SIZE;
    applyFilters();
  });

  statusSelect.addEventListener("change", () => {
    visibleCount = PAGE_SIZE;
    applyFilters();
  });

  loadMore.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    applyFilters();
  });

  applyFilters();
}
