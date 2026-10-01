// content.js

let isTranslated = false;
let currentTargetLang = "en";
let lastTranslatedLang = null;

const originalTextMap = new Map();
const originalAttrMap = new Map();
const translatedCache = new Map();

let observer = null;
let translationQueue = [];
let batchTimeout = null;
let syncTimeout = null;
let syncIntervalId = null;
let isApplyingTranslation = false;

const SYNC_INTERVAL_MS = 8000;
const BATCH_DEBOUNCE_MS = 300;

browser.runtime.onMessage.addListener((request) => {
  if (request.action === "translate") {
    currentTargetLang = request.targetLang;
    startTranslation(Boolean(request.force));
  } else if (request.action === "restore") {
    restoreOriginal();
  }
});

browser.storage.local.get(["targetLang", "autoTranslate"]).then((res) => {
  if (res.autoTranslate && res.targetLang) {
    currentTargetLang = res.targetLang;
    startTranslation(false);
  }
});

function startTranslation(force = false) {
  if (!force && isTranslated && currentTargetLang === lastTranslatedLang) {
    syncTranslations();
    return;
  }

  lastTranslatedLang = currentTargetLang;
  isTranslated = true;

  if (!document.body) {
    document.addEventListener(
      "DOMContentLoaded",
      () => extractAndTranslateDOM(document.body),
      { once: true }
    );
  } else {
    extractAndTranslateDOM(document.body);
  }

  if (!observer && document.body) {
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (!syncIntervalId) {
    syncIntervalId = setInterval(() => {
      if (isTranslated) syncTranslations();
    }, SYNC_INTERVAL_MS);
  }
}

function restoreOriginal() {
  isTranslated = false;
  lastTranslatedLang = null;

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }

  clearTimeout(batchTimeout);
  clearTimeout(syncTimeout);
  translationQueue = [];

  isApplyingTranslation = true;
  try {
    for (const [node, originalText] of originalTextMap.entries()) {
      if (document.contains(node)) {
        node.nodeValue = originalText;
      }
    }

    for (const [el, attrs] of originalAttrMap.entries()) {
      if (document.contains(el)) {
        for (const [attr, originalText] of Object.entries(attrs)) {
          el.setAttribute(attr, originalText);
        }
      }
    }
  } finally {
    isApplyingTranslation = false;
  }
}

function extractAndTranslateDOM(rootElement) {
  if (!rootElement || !isTranslated) return;

  const nodesToTranslate = [];
  const attrsToTranslate = [];

  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentNode;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.nodeName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.nodeValue.trim() === "") {
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!originalTextMap.has(node)) {
      originalTextMap.set(node, node.nodeValue);
    }
    nodesToTranslate.push({
      type: "text",
      node,
      text: originalTextMap.get(node),
    });
  }

  const elementsWithAttrs = rootElement.querySelectorAll(
    "[placeholder], [title], [alt], [aria-label]"
  );
  elementsWithAttrs.forEach((el) => {
    ["placeholder", "title", "alt", "aria-label"].forEach((attr) => {
      if (!el.hasAttribute(attr)) return;
      const val = el.getAttribute(attr);
      if (val.trim() === "") return;

      if (!originalAttrMap.has(el)) originalAttrMap.set(el, {});
      if (!originalAttrMap.get(el)[attr]) {
        originalAttrMap.get(el)[attr] = val;
      }
      attrsToTranslate.push({
        type: "attr",
        el,
        attr,
        text: originalAttrMap.get(el)[attr],
      });
    });
  });

  queueForTranslation([...nodesToTranslate, ...attrsToTranslate]);
}

function handleMutations(mutations) {
  if (!isTranslated || isApplyingTranslation) return;

  const newElements = [];

  mutations.forEach((mutation) => {
    if (mutation.type === "childList") {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          newElements.push(node);
        } else if (
          node.nodeType === Node.TEXT_NODE &&
          node.nodeValue.trim() !== ""
        ) {
          if (!originalTextMap.has(node)) {
            originalTextMap.set(node, node.nodeValue);
            queueForTranslation([
              { type: "text", node, text: node.nodeValue },
            ]);
          }
        }
      });
    } else if (mutation.type === "characterData") {
      const node = mutation.target;
      if (node.nodeType !== Node.TEXT_NODE) return;

      const original = originalTextMap.get(node);
      if (original !== undefined) {
        const cacheKey = `${original}_${currentTargetLang}`;
        const cached = translatedCache.get(cacheKey);
        if (cached && node.nodeValue !== cached) {
          if (node.nodeValue === original) {
            queueForTranslation([{ type: "text", node, text: original }]);
          } else {
            applyTranslation({ type: "text", node }, cached);
          }
        }
      } else if (node.nodeValue.trim() !== "") {
        originalTextMap.set(node, node.nodeValue);
        queueForTranslation([{ type: "text", node, text: node.nodeValue }]);
      }
    }
  });

  newElements.forEach((el) => extractAndTranslateDOM(el));
  scheduleSyncTranslations();
}

function scheduleSyncTranslations() {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(syncTranslations, 150);
}

function syncTranslations() {
  if (!isTranslated || isApplyingTranslation) return;

  isApplyingTranslation = true;
  try {
    for (const [node, original] of originalTextMap.entries()) {
      if (!document.contains(node)) continue;
      const cacheKey = `${original}_${currentTargetLang}`;
      const translated = translatedCache.get(cacheKey);
      if (!translated) continue;
      if (node.nodeValue !== translated) {
        if (node.nodeValue === original) {
          node.nodeValue = translated;
        }
      }
    }

    for (const [el, attrs] of originalAttrMap.entries()) {
      if (!document.contains(el)) continue;
      for (const [attr, original] of Object.entries(attrs)) {
        const cacheKey = `${original}_${currentTargetLang}`;
        const translated = translatedCache.get(cacheKey);
        if (!translated) continue;
        const current = el.getAttribute(attr);
        if (current !== translated && current === original) {
          el.setAttribute(attr, translated);
        }
      }
    }
  } finally {
    isApplyingTranslation = false;
  }
}

function queueForTranslation(items) {
  items.forEach((item) => {
    const cacheKey = `${item.text}_${currentTargetLang}`;
    if (translatedCache.has(cacheKey)) {
      applyTranslation(item, translatedCache.get(cacheKey));
    } else {
      translationQueue.push(item);
    }
  });

  if (translationQueue.length > 0) {
    clearTimeout(batchTimeout);
    batchTimeout = setTimeout(processTranslationBatch, BATCH_DEBOUNCE_MS);
  }
}

function processTranslationBatch() {
  if (translationQueue.length === 0) return;

  const seen = new Set();
  const batch = [];
  for (const item of translationQueue) {
    const key =
      item.type === "text"
        ? `text:${item.text}`
        : `attr:${item.el}:${item.attr}:${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    batch.push(item);
  }
  translationQueue = [];

  const textsToTranslate = batch.map((item) => item.text);

  browser.runtime
    .sendMessage({
      action: "translateBatch",
      texts: textsToTranslate,
      targetLang: currentTargetLang,
    })
    .then((response) => {
      if (response && response.success) {
        response.translatedTexts.forEach((translatedText, index) => {
          const item = batch[index];
          const cacheKey = `${item.text}_${currentTargetLang}`;
          translatedCache.set(cacheKey, translatedText);
          applyTranslation(item, translatedText);
        });
      }
    })
    .catch((err) => {
      if (err && String(err).includes("Extension context invalidated")) {
        return;
      }
      console.error("Translation batch failed", err);
    });
}

function applyTranslation(item, translatedText) {
  isApplyingTranslation = true;
  try {
    if (item.type === "text") {
      if (document.contains(item.node)) {
        item.node.nodeValue = translatedText;
      }
    } else if (item.type === "attr") {
      if (document.contains(item.el)) {
        item.el.setAttribute(item.attr, translatedText);
      }
    }
  } finally {
    isApplyingTranslation = false;
  }
}
