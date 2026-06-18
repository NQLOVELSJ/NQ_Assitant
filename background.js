/**
 * NQ-Assistant - Background Service Worker v3
 * 仅负责持久化存储 (chrome.storage.local)
 */
'use strict';

const STORAGE_KEY = 'nq_messages';

async function loadMessages() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function saveMessages(messages) {
  await chrome.storage.local.set({ [STORAGE_KEY]: messages });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.tab) {
    handleContentMessage(request, sendResponse);
    return true;
  }

  switch (request.action) {
    case 'getAllMessages':
      loadMessages().then(msgs => sendResponse({ messages: msgs }));
      return true;

    case 'clearAllMessages':
      saveMessages([]).then(() => sendResponse({ success: true }));
      return true;
  }
});

async function handleContentMessage(request, sendResponse) {
  switch (request.action) {
    case 'saveMessages':
      await saveMessages(request.data || []);
      sendResponse({ success: true });
      break;
  }
}
