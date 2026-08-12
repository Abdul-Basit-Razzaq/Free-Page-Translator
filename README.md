# Free Page Translator (Firefox Extension)

A lightweight, completely free Firefox extension that automatically detects and translates web pages while preserving the original HTML structure and dynamic content.

## Features

- 🌍 **Completely Free:** Powered by the open Google Translate API endpoint, requiring no API keys or subscriptions.
- ⚡ **Dynamic Translation:** Uses `MutationObserver` to automatically translate content as you scroll or as new elements pop up.
- 🛡️ **HTML Preservation:** Uses `TreeWalker` to extract and translate pure text nodes, guaranteeing that your page's CSS styles, event listeners, and layouts do not break.
- 🧠 **Smart Caching:** Avoids duplicate API calls by caching translated strings in-memory.
- 🔄 **One-Click Restore:** Instantly revert the entire page back to its original language without reloading.

## Installation (For Users)

1. Download the extension from the official Firefox Add-ons Store (Link coming soon).
2. Click the extension icon in your browser toolbar.
3. Select your desired target language.
4. Click "Translate Page" or toggle "Auto-translate pages" for a seamless experience.

## Developer Setup (Running Locally)

To run this extension locally for development:

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/free-page-translator.git
   ```
2. Open Firefox and navigate to `about:debugging` in the URL bar.
3. Click on **"This Firefox"** in the left sidebar.
4. Click **"Load Temporary Add-on..."**
5. Select the `manifest.json` file from the cloned directory.
6. The extension is now loaded and ready to test!

## How it Works

Unlike many translation extensions that ruthlessly overwrite the `innerHTML` of a website, this extension safely traverses the Document Object Model (DOM) to pinpoint specific text nodes and attributes (`placeholder`, `title`, `alt`). 

API requests are batched and routed through the `background.js` service worker to bypass strict Cross-Origin Resource Sharing (CORS) policies.

## License

This project is open-source and available under the [MIT License](LICENSE).
