document.getElementById("openOptionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

document.getElementById("runSweepBtn").addEventListener("click", () => {
  const statusDiv = document.getElementById("status");
  statusDiv.textContent = "Running sweep...";
  chrome.runtime.sendMessage({ action: "trigger_sweep" }, (response) => {
    if (response && response.status === "complete") {
      statusDiv.textContent = `Cleaned ${response.deleted} cookies!`;
      setTimeout(() => window.close(), 1500);
    } else {
      statusDiv.textContent = "Sweep triggered.";
    }
  });
});
