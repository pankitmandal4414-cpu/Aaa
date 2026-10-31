# Consent-based one-to-one live camera sharing

This project adds a private dashboard and an explicit visitor-controlled camera-sharing page to the Matrix-style demo.

## Privacy and safety behaviour

- The visitor must tick a clear consent checkbox, click **Agree & start camera sharing**, and grant the browser's camera permission.
- The visitor sees their own preview and a visible Stop button while the camera is active.
- The dashboard cannot activate the visitor's camera.
- One visitor can connect per invitation. Each invite is single-use and expires after 10 minutes.
- The app does not record, store, or upload video to this server. WebRTC sends the media peer-to-peer when possible. The server relays only connection setup messages (offer/answer/ICE).
- The dashboard is password-protected. Use a unique password of at least 16 characters.
- Share invitations only with people who knowingly agree to participate. Do not disguise the camera-sharing purpose.

## Important hosting change

**GitHub Pages alone cannot run the Node.js signalling server.** Deploy this full repository to a Node.js host that provides HTTPS (for example, Render or another trusted Node host). You can keep the source code in GitHub; the host runs `server.js`.

## Deploy

1. Upload the entire project folder to a GitHub repository (keep `server.js`, `package.json`, `public/`, and `.gitignore` at the repository root).
2. Create a Node web service from that GitHub repository on your chosen host.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variable `DASHBOARD_PASSWORD` with a unique random password of 16+ characters. Do not put the real password in GitHub or in frontend code.
6. Deploy. Open the HTTPS service URL and sign in at `/dashboard`.

## Use

1. Sign in to `/dashboard`.
2. Click **Create sharing link** and send the link privately to one person.
3. The visitor opens the link, reads the notice, checks the consent box, clicks **Agree & start camera sharing**, and grants camera permission.
4. Your dashboard displays the visitor's live stream once the connection is established.
5. The visitor can click **Stop sharing now** or close the page at any time. You can end the session by signing out.

## Technical notes

- WebRTC uses a public STUN server for connection discovery. Some networks require a TURN relay; this starter project does not include one, so some connections may fail.
- HTTPS is required for camera permission except on localhost.
- The demo keeps sessions and invitation codes in server memory. Restarting the server invalidates them.
- For production use, add a reputable TURN service, stronger account management, monitoring, and security review. Never store camera recordings unless participants have separately and explicitly agreed.
