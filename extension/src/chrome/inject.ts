/**
 * Content script (Phase 3) — runs in the page's ISOLATED world at document_start.
 *
 * 1. Injects inpage.js into the page's MAIN world (so it can define window.ethereum there).
 * 2. Seeds it with the active account address from the background keyring.
 * 3. Bridges the inpage provider's postMessages (i_*) to the background worker and relays results.
 *
 * It deliberately forwards ONLY provider requests to the page — never wallet-internal events —
 * so a malicious dApp cannot eavesdrop on unrelated wallet activity.
 */

const SEPOLIA_CHAIN_ID = 11155111;

function faviconUrl(): string | null {
  const link = document.querySelector(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
  ) as HTMLLinkElement | null;
  if (link?.href) return link.href;
  try {
    return new URL("/favicon.ico", window.location.origin).href;
  } catch {
    return null;
  }
}

// Ask the background for the current active address (works even while locked; may be null).
function getActiveAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { scope: "zw", type: "EXT_GET_ACCOUNT" },
        (res: { ok?: boolean; result?: { address?: string | null } }) => {
          if (chrome.runtime.lastError || !res?.ok) return resolve(null);
          resolve(res.result?.address ?? null);
        }
      );
    } catch {
      resolve(null);
    }
  });
}

function init() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("static/js/inpage.js");
  script.type = "text/javascript";
  script.onload = async function () {
    (this as HTMLScriptElement).remove();
    const address = await getActiveAddress();
    window.postMessage(
      { type: "init", msg: { address, chainId: SEPOLIA_CHAIN_ID } },
      "*"
    );
  };
  (document.head || document.documentElement).prepend(script);
}

// Background → page: push active-account changes to the inpage provider.
chrome.runtime.onMessage.addListener((msg: { scope?: string; type?: string; address?: string | null }) => {
  if (msg?.scope !== "zw") return;
  if (msg.type === "EXT_ACCOUNT_CHANGED") {
    window.postMessage({ type: "accountsChanged", msg: { address: msg.address ?? null } }, "*");
  }
});

// Inpage (MAIN world) → background bridge.
window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window || !e.data?.type) return;
  const { type, msg } = e.data as { type: string; msg: Record<string, unknown> };
  const origin = window.location.origin;
  const favicon = faviconUrl();

  switch (type) {
    case "i_sendTransaction": {
      chrome.runtime.sendMessage(
        { scope: "zw", type: "EXT_SEND_TX", tx: msg.tx, origin, favicon },
        (res: { ok?: boolean; result?: string; error?: string }) => {
          const err = chrome.runtime.lastError?.message;
          window.postMessage(
            {
              type: "sendTransactionResult",
              msg: {
                id: msg.id,
                success: !!res?.ok,
                txHash: res?.result,
                error: err || res?.error,
              },
            },
            "*"
          );
        }
      );
      break;
    }
    case "i_signatureRequest": {
      chrome.runtime.sendMessage(
        {
          scope: "zw",
          type: "EXT_SIGN",
          method: msg.method,
          params: msg.params,
          origin,
          favicon,
        },
        (res: { ok?: boolean; result?: string; error?: string }) => {
          const err = chrome.runtime.lastError?.message;
          window.postMessage(
            {
              type: "signatureRequestResult",
              msg: {
                id: msg.id,
                success: !!res?.ok,
                signature: res?.result,
                error: err || res?.error,
              },
            },
            "*"
          );
        }
      );
      break;
    }
    case "i_rpcRequest": {
      chrome.runtime.sendMessage(
        { scope: "zw", type: "EXT_RPC", method: msg.method, params: msg.params },
        (res: { ok?: boolean; result?: unknown; error?: string; errorCode?: number; errorData?: unknown }) => {
          window.postMessage(
            {
              type: "rpcResponse",
              msg: {
                id: msg.id,
                result: res?.result,
                error: res?.ok ? undefined : res?.error || chrome.runtime.lastError?.message,
                errorCode: res?.errorCode,
                errorData: res?.errorData,
              },
            },
            "*"
          );
        }
      );
      break;
    }
  }
});

init();

export {};
