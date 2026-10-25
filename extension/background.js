// Mini Player extension service worker.
// IMPORTANT: replace API_BASE with your deployed HTTPS backend origin before testing.
// Razorpay API secrets belong on the backend only; never put them in this file.
const API_BASE = 'https://your-api.example.com';

chrome.runtime.onInstalled.addListener((details) => {
  // Remove the prototype-only manual entitlement. Do not touch the server identity.
  chrome.storage.local.remove('pro', () => { void chrome.runtime.lastError; });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-pip') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://www.netflix.com/')) return;
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle-pip' });
  } catch (error) {
    console.debug('Mini Player shortcut not available in this tab:', error?.message || error);
  }
});

async function getInstallationIdentity() {
  let { installId, activationToken } = await chrome.storage.local.get(['installId', 'activationToken']);
  if (installId && activationToken) return { installId, activationToken };

  installId = crypto.randomUUID();
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  activationToken = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  await chrome.storage.local.set({ installId, activationToken });
  return { installId, activationToken };
}

function getConfiguredApiBase() {
  if (!API_BASE || API_BASE.includes('your-api.example.com')) {
    throw new Error('Premium backend is not configured yet. Set API_BASE in background.js and the matching host permission in manifest.json.');
  }
  const parsed = new URL(API_BASE);
  if (parsed.protocol !== 'https:') throw new Error('Premium backend must use HTTPS.');
  return parsed.origin;
}

async function apiRequest(path, body) {
  const base = getConfiguredApiBase();
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Premium API request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function notifyNetflixTabs(active, status) {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.netflix.com/*' });
    await Promise.all(tabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'premium-status-updated',
          active: active === true,
          status: status || 'unknown'
        });
      } catch (_) {
        // A matching tab may not be a watch page yet or its content script may not be ready.
      }
    }));
  } catch (error) {
    console.debug('Could not notify Netflix tabs about Premium status:', error?.message || error);
  }
}

async function getPremiumStatus() {
  try {
    const identity = await getInstallationIdentity();
    const data = await apiRequest('/api/entitlement', identity);
    const result = {
      ok: true,
      active: data.active === true,
      status: data.status || 'unknown',
      currentEnd: data.currentEnd || null,
      cancelAtCycleEnd: data.cancelAtCycleEnd === true
    };
    await notifyNetflixTabs(result.active, result.status);
    return result;
  } catch (error) {
    return { ok: false, active: false, status: 'unverified', error: error?.message || 'Could not verify Premium status.' };
  }
}

async function createPremiumCheckout() {
  const identity = await getInstallationIdentity();
  return apiRequest('/api/checkout', identity);
}

async function cancelPremiumSubscription() {
  const identity = await getInstallationIdentity();
  return apiRequest('/api/cancel', identity);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'premium:status' || message?.type === 'premium:refresh') {
    getPremiumStatus().then(sendResponse).catch((error) => {
      sendResponse({ ok: false, active: false, error: error?.message || 'Could not verify Premium status.' });
    });
    return true;
  }

  if (message?.type === 'premium:checkout') {
    createPremiumCheckout()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, active: error?.data?.active === true, error: error?.message || 'Could not create checkout.' }));
    return true;
  }

  if (message?.type === 'premium:cancel') {
    cancelPremiumSubscription()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Could not schedule cancellation.' }));
    return true;
  }

  return false;
});
