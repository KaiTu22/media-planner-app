// JSONP client for the Apps Script backend. Plain fetch() doesn't work here:
// Apps Script's own DOMAIN-restricted auth check 302-redirects and never
// attaches CORS headers, so a cross-origin fetch fails even with a valid
// session. A <script> tag load isn't subject to CORS and still carries the
// browser's existing Google session, so JSONP is the required call pattern
// until this is replaced by a real token-based auth layer.
// (Verified end-to-end 2026-08-31 against the closed_deals pilot endpoint.)

let callbackId = 0;

export function jsonpRequest(baseUrl, params = {}, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `__appsScriptCallback_${callbackId++}`;
    const script = document.createElement('script');

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Apps Script request timed out — you may need to sign in to your Google account.'));
    }, timeoutMs);

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Apps Script request failed to load.'));
    };

    const query = new URLSearchParams({ ...params, callback: callbackName });
    script.src = `${baseUrl}?${query.toString()}`;
    document.body.appendChild(script);
  });
}

// Writes can't use JSONP (script tags are GET-only) and can't use fetch()
// (same CORS wall as reads, since Apps Script's own domain-login check
// 302-redirects without CORS headers). A hidden iframe + form POST isn't
// subject to CORS, so the write itself goes through — but Google sends
// X-Frame-Options: sameorigin on script.google.com, so the browser refuses
// to render doPost's response inside the iframe at all. That kills any
// postMessage-based response (confirmed 2026-08-31: writes landed in the
// sheet with correct Session.getActiveUser() attribution, but the iframe
// never delivered a message back). So this only fires the write — callers
// must verify success with a follow-up jsonpRequest read, not a response
// from this call.
export function appsScriptPost(baseUrl, params = {}, { settleMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    const iframeName = `__appsScriptWriteFrame_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    iframe.name = iframeName;

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = baseUrl;
    form.target = iframeName;
    Object.entries(params).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();

    // No reliable "done" signal is available (see comment above), so this
    // just gives the request time to land before resolving. Callers confirm
    // the outcome themselves via a follow-up read.
    setTimeout(() => {
      form.remove();
      iframe.remove();
      resolve();
    }, settleMs);
  });
}

// Confirms a write actually landed by polling a read until a condition is
// true, rather than trusting a single follow-up read right after
// appsScriptPost resolves — writes involving extra backend work (e.g. Drive
// folder creation) can take longer than the fixed settle delay above.
export async function verifyByPolling(check, { attempts = 8, intervalMs = 800 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Write did not appear after polling — it may have failed or be delayed.');
}
