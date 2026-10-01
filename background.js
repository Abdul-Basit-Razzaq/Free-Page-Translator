// background.js

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translateBatch") {
    translateBatch(request.texts, request.targetLang)
      .then(translatedTexts => sendResponse({ success: true, translatedTexts }))
      .catch(error => sendResponse({ success: false, error: error.toString() }));
    return true; // Indicates that sendResponse will be called asynchronously
  }
});

async function translateBatch(texts, targetLang) {
  // For a completely free approach, we use the unofficial Google Translate API endpoint
  // Note: For production use, consider LibreTranslate or a paid API to avoid rate limiting.
  // We process the batch by sending individual requests or a combined string, but to be safe 
  // with URL length limits, we'll do promise.all for small batches.
  
  const concurrency = 4;
  const results = new Array(texts.length);

  async function translateOne(text) {
    if (!text.trim()) return text;

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Translate HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data && data[0]) {
      return data[0].map((chunk) => chunk[0]).join("");
    }
    return text;
  }

  let index = 0;
  async function worker() {
    while (index < texts.length) {
      const i = index++;
      const text = texts[i];
      try {
        results[i] = await translateOne(text);
      } catch (e) {
        console.error("Translation error for text:", text, e);
        results[i] = text;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, texts.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
