/**
 * NQ-Assistant - Background Service Worker v2
 * 消息中转 + 持久化存储 (chrome.storage.local)
 */
'use strict';

const STORAGE_KEY = 'nq_messages';

// ============ 持久化存储 ============
async function loadMessages() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function saveMessages(messages) {
  await chrome.storage.local.set({ [STORAGE_KEY]: messages });
}

// ============ 消息处理 ============
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.tab) {
    handleContentMessage(request, sendResponse);
    return true;
  }

  switch (request.action) {
    case 'sidePanelReady':
      loadMessages().then(msgs => sendResponse({ messages: msgs }));
      return true;

    case 'getAllMessages':
      loadMessages().then(msgs => sendResponse({ messages: msgs }));
      return true;

    case 'clearAllMessages':
      saveMessages([]).then(() => {
        notifyActiveTab({ action: 'clearMessages' });
        sendToSidePanel({ action: 'messagesCleared' });
        sendResponse({ success: true });
      });
      return true;

    case 'rescan':
      notifyActiveTab({ action: 'rescan' });
      sendResponse({ success: true });
      break;

    case 'exportMessages':
      loadMessages().then(msgs => sendResponse({ messages: msgs }));
      return true;
  }
});

async function handleContentMessage(request, sendResponse) {
  switch (request.action) {
    case 'newMessage':
      if (request.data && request.data.id) {
        const msgs = await loadMessages();
        if (!msgs.find(m => m.id === request.data.id)) {
          msgs.push(request.data);
          await saveMessages(msgs);
          sendToSidePanel({ action: 'newMessage', data: request.data });
        }
      }
      sendResponse({ received: true });
      break;

    case 'updateMessage':
      if (request.data) {
        const { id, content, isComplete, edited } = request.data;
        const msgs = await loadMessages();
        const idx = msgs.findIndex(m => m.id === id);
        if (idx >= 0) {
          msgs[idx].content = content;
          msgs[idx].isComplete = isComplete;
          if (edited !== undefined) msgs[idx].edited = edited;
          await saveMessages(msgs);
          sendToSidePanel({ action: 'updateMessage', data: { id, content, isComplete, edited } });
        }
      }
      sendResponse({ received: true });
      break;

    case 'updateOrder':
      if (request.data && request.data.orderedIds) {
        const msgs = await loadMessages();
        const reordered = request.data.orderedIds
          .map(id => msgs.find(m => m.id === id))
          .filter(Boolean);
        await saveMessages(reordered);
        sendToSidePanel({ action: 'orderUpdated', data: { messages: reordered } });
      }
      sendResponse({ received: true });
      break;
  }
}

function sendToSidePanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function notifyActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
    }
  });
}

chrome.action.onClicked.addListener((tab) => {});

console.log('[NQ-Assistant] Background v2 (persistent) started');
