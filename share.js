const $ = id => document.getElementById(id);
const code = new URLSearchParams(location.search).get("code");
let stream = null, ws = null, pc = null, stopped = false;
$("startBtn").disabled = true;
$("consent").addEventListener("change", () => $("startBtn").disabled = !$("consent").checked || !code);
function status(t, kind="") { $("status").textContent = t; $("status").className = "status " + kind; }
function wsUrl() { return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/signal"; }
async function stopSharing(notify = true) {
  stopped = true;
  if (notify && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:"hangup"}));
  if (pc) { pc.close(); pc = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $("localVideo").srcObject = null;
  $("videoPlaceholder").classList.remove("hidden");
  $("stopBtn").classList.add("hidden");
  $("startBtn").classList.remove("hidden");
  $("startBtn").disabled = !$("consent").checked;
  status("Camera sharing has stopped. Your camera tracks are turned off.");
  if (ws) { ws.close(); ws = null; }
}
async function startSharing() {
  if (!code) { status("This invitation link is missing its code. Ask the sender for a new link.", "bad"); return; }
  if (!$("consent").checked) return;
  $("startBtn").disabled = true;
  status("Requesting camera permission…");
  try {
    // Camera access is requested only after the visitor explicitly clicks this button.
    stream = await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    $("localVideo").srcObject = stream;
    $("videoPlaceholder").classList.add("hidden");
    $("stopBtn").classList.remove("hidden");
    $("startBtn").classList.add("hidden");
    stopped = false;
    status("Camera is active. Connecting to the recipient…", "good");
    ws = new WebSocket(wsUrl());
    ws.onopen = () => ws.send(JSON.stringify({type:"auth-visitor",code}));
    ws.onmessage = async event => {
      const msg = JSON.parse(event.data);
      if (msg.type === "ready") {
        pc = new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        pc.onicecandidate = e => { if(e.candidate && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:"ice",data:e.candidate})); };
        pc.onconnectionstatechange = () => {
          if (pc && pc.connectionState === "connected") status("Live sharing is active. Press Stop sharing whenever you want.", "good");
          if (pc && ["failed","disconnected"].includes(pc.connectionState)) status("Video connection interrupted. You can stop sharing.", "bad");
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({type:"offer",data:pc.localDescription}));
      }
      if (msg.type === "answer" && pc) await pc.setRemoteDescription(msg.data);
      if (msg.type === "ice" && pc) { try { await pc.addIceCandidate(msg.data); } catch {} }
      if (msg.type === "ended") await stopSharing(false);
    };
    ws.onclose = () => { if(!stopped) stopSharing(false); };
    ws.onerror = () => status("Connection error. Stop sharing and ask the recipient for a fresh link.", "bad");
  } catch (err) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    $("startBtn").disabled = false;
    status(err.name === "NotAllowedError" ? "Camera permission was not granted. Nothing is being shared." : "Could not start camera: " + err.message, "bad");
  }
}
$("startBtn").addEventListener("click", startSharing);
$("stopBtn").addEventListener("click", () => stopSharing(true));
window.addEventListener("pagehide", () => { if(stream) stream.getTracks().forEach(t => t.stop()); if(ws) ws.close(); });
if (!code) { status("Invalid invitation link. Ask the sender to create a new one.", "bad"); $("consent").disabled = true; }
if (!navigator.mediaDevices?.getUserMedia) { status("Camera sharing requires a supported browser and HTTPS.", "bad"); $("startBtn").disabled = true; }
