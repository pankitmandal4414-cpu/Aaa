const $ = id => document.getElementById(id);
let token = sessionStorage.getItem("ownerToken");
let ws, pc, inviteUrl = "";

function setStatus(text, kind = "") { $("status").textContent = text; $("status").className = "status " + kind; }
function wsUrl() { return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/signal"; }
function closePeer() {
  if (pc) { pc.close(); pc = null; }
  $("remoteVideo").srcObject = null;
  $("videoPlaceholder").classList.remove("hidden");
}
function connectSocket() {
  ws = new WebSocket(wsUrl());
  ws.onopen = () => ws.send(JSON.stringify({type:"auth-owner", token}));
  ws.onmessage = async event => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ready") setStatus("Dashboard connected. Create an invitation for one visitor.", "good");
    if (msg.type === "visitor-joined") {
      setStatus("Visitor connected. Waiting for them to approve camera access and start sharing.", "good");
    }
    if (msg.type === "offer") {
      try {
        pc = new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
        pc.ontrack = e => {
          $("remoteVideo").srcObject = e.streams[0];
          $("videoPlaceholder").classList.add("hidden");
          setStatus("Live video is being shared by the visitor.", "good");
        };
        pc.onicecandidate = e => { if(e.candidate) ws.send(JSON.stringify({type:"ice",data:e.candidate})); };
        await pc.setRemoteDescription(msg.data);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({type:"answer",data:pc.localDescription}));
        setStatus("Connecting to the visitor's camera…");
      } catch (err) { setStatus("Could not establish video: " + err.message, "bad"); }
    }
    if (msg.type === "ice" && pc) { try { await pc.addIceCandidate(msg.data); } catch {} }
    if (msg.type === "ended") { closePeer(); setStatus(msg.reason || "Session ended."); }
  };
  ws.onclose = () => { closePeer(); setStatus("Dashboard disconnected. Refresh and sign in again.", "bad"); };
  ws.onerror = () => setStatus("Connection error. Check your network and HTTPS hosting.", "bad");
}
async function signIn() {
  $("loginStatus").textContent = "Signing in…";
  try {
    const r = await fetch("/api/login", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("password").value})});
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Sign-in failed.");
    token = data.token; sessionStorage.setItem("ownerToken", token);
    $("loginPanel").classList.add("hidden"); $("dashboardPanel").classList.remove("hidden");
    connectSocket();
  } catch(e) { $("loginStatus").textContent = e.message; }
}
$("loginBtn").addEventListener("click", signIn);
$("password").addEventListener("keydown", e => { if(e.key === "Enter") signIn(); });
if (token) { $("loginPanel").classList.add("hidden"); $("dashboardPanel").classList.remove("hidden"); connectSocket(); }

$("inviteBtn").addEventListener("click", async () => {
  try {
    const r = await fetch("/api/invite",{method:"POST",headers:{Authorization:"Bearer "+token}});
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || "Could not create invitation.");
    inviteUrl = location.origin + "/share?code=" + encodeURIComponent(data.code);
    $("inviteLink").textContent = inviteUrl;
    $("inviteBox").classList.remove("hidden");
    setStatus("Invitation ready. It expires in 10 minutes and accepts one visitor.", "good");
  } catch(e) { setStatus(e.message, "bad"); }
});
$("copyBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(inviteUrl); $("copyBtn").textContent = "Copied"; }
  catch { $("copyBtn").textContent = "Copy unavailable — select the link"; }
});
$("logoutBtn").addEventListener("click", async () => {
  try { await fetch("/api/logout",{method:"POST",headers:{Authorization:"Bearer "+token}}); } catch {}
  sessionStorage.removeItem("ownerToken"); token = null; closePeer();
  if(ws) ws.close();
  location.reload();
});
