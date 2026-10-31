# Cyber Access Demo 2.0

A Matrix-inspired, static cybersecurity learning demo for GitHub Pages.

## Files

- `index.html` — page structure
- `style.css` — Matrix-style visual design
- `app.js` — browser inspection, camera preview, connection indicators, and simulated scan

## Publish with GitHub Pages

1. Create a public GitHub repository.
2. Upload all three files (`index.html`, `style.css`, `app.js`) to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then save.
6. Open the Pages URL shown by GitHub.

## Camera permission

Camera access requires a supported browser and a secure context, normally HTTPS. GitHub Pages provides HTTPS. The camera starts only after the visitor presses **Enable camera** and grants the browser permission. Press **Stop camera** to end the preview.

The camera stream is attached directly to the local video element. This project contains no upload endpoint, analytics, tracking code, or external JavaScript libraries.

## Privacy and limitations

- The page does not remotely access or control a phone.
- Browser-reported values are limited and may be reduced or obscured by the browser.
- The simulated scan is only an animation; it does not scan the device.
- Do not add code to collect or transmit visitor information without clear, informed consent.
- Test only devices and systems you own or have explicit permission to assess.

## Fonts

The stylesheet requests Google Fonts for appearance. If unavailable, system fallback fonts are used. No functionality depends on those fonts.
