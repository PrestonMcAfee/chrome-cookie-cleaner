document.addEventListener("DOMContentLoaded", () => {
  const sweepBtn = document.getElementById("runSweepBtn");
  const optionsBtn = document.getElementById("openOptionsBtn");
  const statusDiv = document.getElementById("status");

  if (optionsBtn) {
    optionsBtn.addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL("options.html"));
      }
    });
  }

  if (sweepBtn) {
    sweepBtn.addEventListener("click", () => {
      sweepBtn.disabled = true;
      sweepBtn.textContent = "Sweeping...";
      if (statusDiv) statusDiv.textContent = "";

      chrome.runtime.sendMessage({ action: "trigger_sweep" }, (response) => {
        sweepBtn.disabled = false;
        sweepBtn.textContent = "🧹 Run Sweep Now";

        if (statusDiv) {
          if (response && response.status === "complete") {
            statusDiv.textContent = `Cleaned ${response.deletedCookies} cookies across ${response.deletedSites} sites.`;
          } else {
            statusDiv.textContent = "Sweep completed.";
          }

          setTimeout(() => {
            statusDiv.textContent = "";
          }, 3500);
        }
      });
    });
  }
});