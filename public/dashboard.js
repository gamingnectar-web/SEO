(function () {
  const rows = Array.isArray(window.__DASHBOARD_TIMELINE__) ? window.__DASHBOARD_TIMELINE__ : [];
  const canvas = document.getElementById("effectivenessChart");
  if (!canvas || typeof Chart === "undefined") return;

  new Chart(canvas, {
    type: "line",
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          label: "Effectiveness",
          data: rows.map((row) => row.effectivenessScore),
          tension: 0.35
        },
        {
          label: "SEO",
          data: rows.map((row) => row.seoScore),
          tension: 0.35
        },
        {
          label: "GEO/AEO",
          data: rows.map((row) => row.geoScore),
          tension: 0.35
        },
        {
          label: "Links",
          data: rows.map((row) => row.linkScore),
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            afterBody: function (context) {
              const item = rows[context[0].dataIndex];
              if (!item) return "";
              return [
                `Issues: ${item.issueCount}`,
                `Keyword value: £${item.keywordValue || 0}`,
                `Competitor score: ${item.competitorScore || 0}`
              ];
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        }
      }
    }
  });
})();