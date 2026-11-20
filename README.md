<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/fe85faad-f779-4c13-9a11-5a6875c34ed2

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Build Windows EXE

1. Install dependencies:
   `npm install`
2. Build the installer:
   `npm run build:exe`
3. Open the generated installer in `release/`.

The Electron app serves the built React application locally and keeps the TURN credential API available inside the desktop application.
