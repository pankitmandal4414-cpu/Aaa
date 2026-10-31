const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

if (!DASHBOARD_PASSWORD || DASHBOARD_PASSWORD.length < 16) {
  console.error("Set DASHBOARD_PASSWORD to a unique value at least 16 characters long.");
  process.exit(1);
}

app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null
    }
  }
}));

app.use(express.json({ limit: "10kb" }));

// Serve files directly from the repository root.
app.get(
  ["/style.css", "/dashboard.js", "/share.js"],
  (req, res) => {
    res.sendFile(path.join(__dirname, path.basename(req.path)));
  }
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const sessions = new Map();
let ownerSocket = null;
let room = null;

const SESSION_TTL = 8 * 60 * 60 * 1000;
const INVITE_TTL = 10 * 60 * 1000;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));

  return aa.length === bb.length &&
    crypto.timingSafeEqual(aa, bb);
}

function getToken(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

function authenticated(req, res, next) {
  const token = getToken(req);
  const expiry = sessions.get(token);

  if (!expiry || expiry < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({
      error: "Please sign in again."
    });
  }

  next();
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function endRoom(reason = "Session ended") {
  if (room) {
    send(room.owner, { type: "ended", reason });
    send(room.visitor, { type: "ended", reason });
  }

  room = null;
}

function newCode() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

// Pages
app.get("/", (_req, res) => {
  res.redirect("/dashboard");
});

app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

app.get("/share", (_req, res) => {
  res.sendFile(path.join(__dirname, "share.html"));
});

// Dashboard login
app.post("/api/login", loginLimiter, (req, res) => {
  const password = req.body && req.body.password;

  if (!safeEqual(password || "", DASHBOARD_PASSWORD)) {
    return res.status(401).json({
      error: "Incorrect password."
    });
  }

  const token = crypto.randomBytes(32).toString("hex");

  sessions.set(token, Date.now() + SESSION_TTL);

  res.json({ token });
});

// Create one-time invitation
app.post("/api/invite", authenticated, (req, res) => {
  if (!ownerSocket || ownerSocket.readyState !== WebSocket.OPEN) {
    return res.status(409).json({
      error: "Dashboard connection is not ready. Refresh and try again."
    });
  }

  endRoom("A new invitation was created.");

  const code = newCode();

  room = {
    code,
    expiresAt: Date.now() + INVITE_TTL,
    owner: ownerSocket,
    visitor: null
  };

  res.json({
    code,
    expiresInSeconds: INVITE_TTL / 1000
  });
});

// Dashboard logout
app.post("/api/logout", authenticated, (req, res) => {
  sessions.delete(getToken(req));

  endRoom("Dashboard signed out.");

  if (ownerSocket) {
    ownerSocket.close(1000, "Signed out");
  }

  ownerSocket = null;

  res.json({ ok: true });
});

// WebSocket signalling
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/signal") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit("connection", ws);
  });
});

wss.on("connection", ws => {
  let role = null;
  let authenticatedSocket = false;

  const authTimeout = setTimeout(() => {
    if (!authenticatedSocket) {
      ws.close(1008, "Authentication timeout");
    }
  }, 5000);

  ws.on("message", raw => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!msg || typeof msg.type !== "string") return;

    if (!authenticatedSocket) {
      if (msg.type === "auth-owner") {
        const token = String(msg.token || "");
        const expiry = sessions.get(token);

        if (!expiry || expiry < Date.now()) {
          ws.close(1008, "Sign-in required");
          return;
        }

        if (ownerSocket && ownerSocket !== ws) {
          ownerSocket.close(1000, "Dashboard opened elsewhere");
        }

        ownerSocket = ws;
        role = "owner";
        authenticatedSocket = true;

        clearTimeout(authTimeout);

        send(ws, { type: "ready", role });
        return;
      }

      if (msg.type === "auth-visitor") {
        const code = String(msg.code || "").toUpperCase();

        if (
          !room ||
          room.code !== code ||
          room.expiresAt < Date.now() ||
          room.visitor
        ) {
          ws.close(1008, "Invitation is invalid, expired, or already used");
          return;
        }

        room.visitor = ws;
        role = "visitor";
        authenticatedSocket = true;

        clearTimeout(authTimeout);

        send(ws, { type: "ready", role });
        send(room.owner, { type: "visitor-joined" });
        return;
      }

      ws.close(1008, "Authentication required");
      return;
    }

    if (
      !room ||
      (role === "owner" && room.owner !== ws) ||
      (role === "visitor" && room.visitor !== ws)
    ) {
      return;
    }

    if (!["offer", "answer", "ice", "hangup"].includes(msg.type)) {
      return;
    }

    const peer = role === "owner" ? room.visitor : room.owner;

    if (!peer) return;

    if (msg.type === "hangup") {
      send(peer, {
        type: "ended",
        reason: "The other person stopped sharing."
      });

      endRoom("Sharing stopped.");
      return;
    }

    // Only WebRTC signalling is relayed.
    // Video and audio are not stored on this server.
    send(peer, {
      type: msg.type,
      data: msg.data
    });
  });

  ws.on("close", () => {
    clearTimeout(authTimeout);

    if (role === "owner" && ownerSocket === ws) {
      ownerSocket = null;
      endRoom("Dashboard disconnected.");
    } else if (
      role === "visitor" &&
      room &&
      room.visitor === ws
    ) {
      const oldRoom = room;
      room = null;

      send(oldRoom.owner, {
        type: "ended",
        reason: "Visitor disconnected or stopped sharing."
      });
    }
  });

  ws.on("error", () => {});
});

server.listen(PORT, () => {
  console.log(`Consent camera app listening on port ${PORT}`);
});
