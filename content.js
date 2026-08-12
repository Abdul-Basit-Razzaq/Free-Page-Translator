// content.js

let isTranslated = false;
let currentTargetLang = 'en';

// Maps to store original data
const originalTextMap = new Map(); // Node -> original text
const originalAttrMap = new Map(); // Element -> { attr: originalText }
const translatedCache = new Map(); // originalText -> translatedText

let observer = null;
let translationQueue = [];
let batchTimeout = null;

// Listen for messages from popup
browser.runtime.onMessage.addListener((request) => {
  if (request.action === "translate") {
    currentTargetLang = request.targetLang;
    startTranslation();
  } else if (request.action === "restore") {
    restoreOriginal();
  }
});

// Check auto-translate on load
browser.storage.local.get(['targetLang', 'autoTranslate']).then(res => {
  if (res.autoTranslate && res.targetLang) {
    currentTargetLang = res.targetLang;
    startTranslation();
  }
});

function startTranslation() {
  if (isTranslated && currentTargetLang === lastTranslatedLang) return;
  lastTranslatedLang = currentTargetLang;
  isTranslated = true;
  
  // Translate initial DOM
  extractAndTranslateDOM(document.body);
  
  // Observe for dynamic changes
  if (!observer) {
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}

function restoreOriginal() {
  isTranslated = false;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  // Restore text nodes
  for (const [node, originalText] of originalTextMap.entries()) {
    if (document.contains(node)) {
      node.nodeValue = originalText;
    }
  }
  
  // Restore attributes
  for (const [el, attrs] of originalAttrMap.entries()) {
    if (document.contains(el)) {
      for (const [attr, originalText] of Object.entries(attrs)) {
        el.setAttribute(attr, originalText);
      }
    }
  }
}

function extractAndTranslateDOM(rootElement) {
  const nodesToTranslate = [];
  const attrsToTranslate = [];
  
  // 1. Find Text Nodes
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
    acceptNode: function(node) {
      if (node.parentNode.nodeName === 'SCRIPT' || 
          node.parentNode.nodeName === 'STYLE' || 
          node.parentNode.nodeName === 'NOSCRIPT') {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.nodeValue.trim() === '') {
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while(walker.nextNode()) {
    const node = walker.currentNode;
    if (!originalTextMap.has(node)) {
      originalTextMap.set(node, node.nodeValue);
    }
    nodesToTranslate.push({ type: 'text', node: node, text: originalTextMap.get(node) });
  }

  // 2. Find Attributes (placeholder, title, alt, aria-label)
  const elementsWithAttrs = rootElement.querySelectorAll('[placeholder], [title], [alt], [aria-label]');
  elementsWithAttrs.forEach(el => {
    ['placeholder', 'title', 'alt', 'aria-label'].forEach(attr => {
      if (el.hasAttribute(attr)) {
        const val = el.getAttribute(attr);
        if (val.trim() !== '') {
          if (!originalAttrMap.has(el)) originalAttrMap.set(el, {});
          if (!originalAttrMap.get(el)[attr]) {
            originalAttrMap.get(el)[attr] = val;
          }
          attrsToTranslate.push({ type: 'attr', el: el, attr: attr, text: originalAttrMap.get(el)[attr] });
        }
      }
    });
  });

  queueForTranslation([...nodesToTranslate, ...attrsToTranslate]);
}

function handleMutations(mutations) {
  if (!isTranslated) return;
  
  let newElements = [];
  
  mutations.forEach(mutation => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          newElements.push(node);
        } else if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
          if (!originalTextMap.has(node)) {
             originalTextMap.set(node, node.nodeValue);
             queueForTranslation([{ type: 'text', node: node, text: node.nodeValue }]);
          }
        }
      });
    } else if (mutation.type === 'characterData') {
      // Handle text modification
      if (mutation.target.nodeType === Node.TEXT_NODE && !originalTextMap.has(mutation.target)) {
         originalTextMap.set(mutation.target, mutation.target.nodeValue);
         queueForTranslation([{ type: 'text', node: mutation.target, text: mutation.target.nodeValue }]);
      }
    }
  });

  newElements.forEach(el => extractAndTranslateDOM(el));
}

function queueForTranslation(items) {
  items.forEach(item => {
    // Check cache first
    const cacheKey = `${item.text}_${currentTargetLang}`;
    if (translatedCache.has(cacheKey)) {
      applyTranslation(item, translatedCache.get(cacheKey));
    } else {
      translationQueue.push(item);
    }
  });

  if (translationQueue.length > 0) {
    clearTimeout(batchTimeout);
    batchTimeout = setTimeout(processTranslationBatch, 300); // 300ms debounce
  }
}

function processTranslationBatch() {
  if (translationQueue.length === 0) return;
  
  const batch = [...translationQueue];
  translationQueue = []; // Reset queue
  
  const textsToTranslate = batch.map(item => item.text);
  
  browser.runtime.sendMessage({
    action: "translateBatch",
    texts: textsToTranslate,
    targetLang: currentTargetLang
  }).then(response => {
    if (response && response.success) {
      response.translatedTexts.forEach((translatedText, index) => {
        const item = batch[index];
        const cacheKey = `${item.text}_${currentTargetLang}`;
        translatedCache.set(cacheKey, translatedText);
        applyTranslation(item, translatedText);
      });
    }
  }).catch(err => console.error("Translation batch failed", err));
}

function applyTranslation(item, translatedText) {
  if (item.type === 'text') {
    if (document.contains(item.node)) {
      item.node.nodeValue = translatedText;
    }
  } else if (item.type === 'attr') {
    if (document.contains(item.el)) {
      item.el.setAttribute(item.attr, translatedText);
    }
  }
}

let lastTranslatedLang = null;
