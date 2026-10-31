const byId = (id) => document.getElementById(id);

function addResult(label, value) {
  const card = document.createElement("div");
  card.className = "result";
  const heading = document.createElement("span");
  heading.textContent = label;
  const detail = document.createElement("b");
  detail.textContent = value;
  card.append(heading, detail);
  return card;
}

byId("inspectBtn").addEventListener("click", () => {
  const results = byId("deviceResults");
  results.replaceChildren(
    addResult("STATUS", "Inspection complete"),
    addResult("BROWSER", navigator.userAgent || "Not provided"),
    addResult("LANGUAGE", navigator.language || "Not provided"),
    addResult("SCREEN", `${screen.width} × ${screen.height}`),
    addResult("PLATFORM HINT", navigator.platform || "Not provided"),
    addResult("COOKIES", navigator.cookieEnabled ? "Enabled in browser" : "Disabled in browser"),
    addResult("NETWORK", navigator.onLine ? "Browser reports online" : "Browser reports offline")
  );
});

function updateNetwork() {
  byId("networkStatus").textContent = navigator.onLine ? "Browser reports online" : "Browser reports offline";
  byId("secureStatus").textContent = window.isSecureContext ? "Secure context (HTTPS)" : "Not a secure context";
}
window.addEventListener("online", updateNetwork);
window.addEventListener("offline", updateNetwork);
updateNetwork();

let activeStream = null;

async function stopCamera() {
  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
  }
  const video = byId("cameraPreview");
  video.pause();
  video.srcObject = null;
  video.style.display = "none";
  byId("cameraPlaceholder").style.display = "flex";
  byId("cameraStartBtn").disabled = false;
  byId("cameraStopBtn").disabled = true;
  byId("cameraStatus").textContent = "Camera stopped. The preview was not recorded or uploaded.";
}

byId("cameraStartBtn").addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    byId("cameraStatus").textContent = "Camera access is unavailable. Use a supported browser over HTTPS.";
    return;
  }

  byId("cameraStartBtn").disabled = true;
  byId("cameraStatus").textContent = "Waiting for your browser permission…";

  try {
    activeStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user" }
    });
    const video = byId("cameraPreview");
    video.srcObject = activeStream;
    video.style.display = "block";
    byId("cameraPlaceholder").style.display = "none";
    byId("cameraStopBtn").disabled = false;
    byId("cameraStatus").textContent = "Camera is active locally. Press Stop camera when finished.";
  } catch (error) {
    byId("cameraStartBtn").disabled = false;
    const messages = {
      NotAllowedError: "Camera permission was denied or blocked.",
      NotFoundError: "No compatible camera was found.",
      NotReadableError: "The camera may be in use by another app."
    };
    byId("cameraStatus").textContent = messages[error.name] || "Camera could not be started. Check browser permissions.";
  }
});

byId("cameraStopBtn").addEventListener("click", stopCamera);
window.addEventListener("pagehide", () => {
  if (activeStream) activeStream.getTracks().forEach(track => track.stop());
});

byId("simulateBtn").addEventListener("click", async () => {
  const button = byId("simulateBtn");
  const bar = byId("progressBar");
  const status = byId("scanStatus");
  const log = byId("scanLog");
  const steps = [
    "Starting visual demonstration…",
    "Showing example browser checks…",
    "No files or installed apps are being inspected…",
    "No passwords, messages, or private data are accessed…",
    "Simulation complete."
  ];

  button.disabled = true;
  log.replaceChildren();
  bar.style.width = "0%";

  for (let i = 0; i < steps.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 550));
    bar.style.width = `${((i + 1) / steps.length) * 100}%`;
    status.textContent = steps[i];
    const item = document.createElement("li");
    item.textContent = `[DEMO] ${steps[i]}`;
    log.append(item);
  }

  button.disabled = false;
});
