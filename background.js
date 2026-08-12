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
  
  const promises = texts.map(async (text) => {
    if (!text.trim()) return text;
    
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const response = await fetch(url);
      const data = await response.json();
      
      // The API returns an array where data[0] contains chunks of translated text
      if (data && data[0]) {
        return data[0].map(chunk => chunk[0]).join('');
      }
      return text; // fallback to original if parsing fails
    } catch (e) {
      console.error("Translation error for text:", text, e);
      return text;
    }
  });

  return Promise.all(promises);
}
