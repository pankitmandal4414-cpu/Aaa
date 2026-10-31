const $ = id => document.getElementById(id);

let token = sessionStorage.getItem("ownerToken");
let ws, pc, inviteUrl = "";
let pendingIce = [];

function setStatus(text, kind = "") {
  $("status").textContent = text;
  $("status").className = "status " + kind;
}

function wsUrl() {
  return (location.protocol === "https:" ? "wss://" : "ws://") +
    location.host + "/signal";
}

async function addRemoteIce(candidate) {
  if (!pc) return;

  if (!pc.remoteDescription) {
    pendingIce.push(candidate);
    return;
  }

  try {
    await pc.addIceCandidate(candidate);
  } catch (err) {
    console.error("ICE candidate error:", err);
  }
}

async function flushRemoteIce() {
  const candidates = pendingIce.splice(0);

  for (const candidate of candidates) {
    await addRemoteIce(candidate);
  }
}

function closePeer() {
  pendingIce = [];

  if (pc) {
    pc.close();
    pc = null;
  }

  $("remoteVideo").srcObject = null;
  $("videoPlaceholder").classList.remove("hidden");
}

function connectSocket() {
  ws = new WebSocket(wsUrl());

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "auth-owner", token }));
  };

  ws.onmessage = async event => {
    const msg = JSON.parse(event.data);

    if (msg.type === "ready") {
      setStatus("Dashboard connected. Create an invitation.", "good");
    }

    if (msg.type === "visitor-joined") {
      setStatus("Visitor connected. Waiting for camera approval.", "good");
    }

    if (msg.type === "offer") {
      try {
        closePeer();

        pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" }
          ]
        });

        const currentPC = pc;

        currentPC.ontrack = async event => {
          if (pc !== currentPC) return;

          const video = $("remoteVideo");

          video.srcObject =
            event.streams[0] || new MediaStream([event.track]);

          video.muted = true;
          video.autoplay = true;
          video.playsInline = true;

          $("videoPlaceholder").classList.add("hidden");

          try {
            await video.play();
            setStatus("Live video is being shared.", "good");
          } catch (err) {
            setStatus(
              "Video received. Tap the video to start playback.",
              "good"
            );
            console.warn("Safari playback:", err);
          }
        };

        currentPC.onicecandidate = event => {
          if (event.candidate && ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "ice",
              data: event.candidate
            }));
          }
        };

        currentPC.onconnectionstatechange = () => {
          if (pc !== currentPC) return;

          if (currentPC.connectionState === "connected") {
            setStatus("Video connection established.", "good");
          }

          if (["failed", "disconnected"].includes(currentPC.connectionState)) {
            setStatus("Video connection interrupted.", "bad");
          }
        };

        await currentPC.setRemoteDescription(msg.data);
        await flushRemoteIce();

        const answer = await currentPC.createAnswer();
        await currentPC.setLocalDescription(answer);

        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "answer",
            data: currentPC.localDescription
          }));
        }

        setStatus("Connecting to the visitor's camera…");

      } catch (err) {
        console.error(err);
        setStatus("Could not establish video: " + err.message, "bad");
      }
    }

    if (msg.type === "ice") {
      await addRemoteIce(msg.data);
    }

    if (msg.type === "ended") {
      closePeer();
      setStatus(msg.reason || "Session ended.");
    }
  };

  ws.onclose = () => {
    closePeer();
    setStatus("Dashboard disconnected. Refresh and sign in again.", "bad");
  };

  ws.onerror = () => {
    setStatus("Connection error. Check your network.", "bad");
  };
}

async function signIn() {
  $("loginStatus").textContent = "Signing in…";

  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("password").value })
    });

    const data = await r.json();

    if (!r.ok) throw new Error(data.error || "Sign-in failed.");

    token = data.token;
    sessionStorage.setItem("ownerToken", token);

    $("loginPanel").classList.add("hidden");
    $("dashboardPanel").classList.remove("hidden");

    connectSocket();

  } catch (e) {
    $("loginStatus").textContent = e.message;
  }
}

$("loginBtn").addEventListener("click", signIn);

$("password").addEventListener("keydown", e => {
  if (e.key === "Enter") signIn();
});

if (token) {
  $("loginPanel").classList.add("hidden");
  $("dashboardPanel").classList.remove("hidden");
  connectSocket();
}

$("inviteBtn").addEventListener("click", async () => {
  try {
    const r = await fetch("/api/invite", {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    });

    const data = await r.json();

    if (!r.ok) throw new Error(data.error || "Could not create invitation.");

    inviteUrl = location.origin + "/share?code=" +
      encodeURIComponent(data.code);

    $("inviteLink").textContent = inviteUrl;
    $("inviteBox").classList.remove("hidden");

    setStatus("Invitation ready. It expires in 10 minutes.", "good");

  } catch (e) {
    setStatus(e.message, "bad");
  }
});

$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(inviteUrl);
    $("copyBtn").textContent = "Copied";
  } catch {
    $("copyBtn").textContent = "Copy unavailable — select the link";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await fetch("/api/logout", {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    });
  } catch {}

  sessionStorage.removeItem("ownerToken");
  token = null;
  closePeer();

  if (ws) ws.close();

  location.reload();
});
