document.addEventListener('DOMContentLoaded', () => {
  const targetLangSelect = document.getElementById('targetLang');
  const autoTranslateCheck = document.getElementById('autoTranslate');
  const translateBtn = document.getElementById('translateBtn');
  const restoreBtn = document.getElementById('restoreBtn');

  // Load saved settings
  browser.storage.local.get(['targetLang', 'autoTranslate']).then(res => {
    if (res.targetLang) targetLangSelect.value = res.targetLang;
    if (res.autoTranslate) autoTranslateCheck.checked = res.autoTranslate;
  });

  // Save settings when changed
  targetLangSelect.addEventListener('change', (e) => {
    browser.storage.local.set({ targetLang: e.target.value });
  });

  autoTranslateCheck.addEventListener('change', (e) => {
    browser.storage.local.set({ autoTranslate: e.target.checked });
  });

  // Action buttons
  translateBtn.addEventListener('click', () => {
    const lang = targetLangSelect.value;
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      browser.tabs.sendMessage(tabs[0].id, { action: "translate", targetLang: lang });
    });
  });

  restoreBtn.addEventListener('click', () => {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      browser.tabs.sendMessage(tabs[0].id, { action: "restore" });
    });
  });
});
