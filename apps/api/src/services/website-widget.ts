import { eq } from 'drizzle-orm';
import { chatbotConfig } from '@1person/core/db';
import { db } from '../lib/db';

export interface WebsiteWidgetInstall {
  enabled: boolean;
  scriptHtml: string;
}

function publicApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1').replace(/\/+$/, '');
}

function publicRuntimeBaseUrl(): string {
  return publicApiBaseUrl().replace(/\/api\/v1\/?$/, '');
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function widgetScriptUrl(): string {
  return `${publicRuntimeBaseUrl()}/widget.js`;
}

export function buildWidgetScriptTag(
  companyId: string,
  color?: string | null,
  pageId?: string | null,
  botId?: string | null,
): string {
  const attrs = [
    `src="${escapeAttribute(widgetScriptUrl())}"`,
    `data-company-id="${escapeAttribute(companyId)}"`,
    `data-api-url="${escapeAttribute(publicApiBaseUrl())}"`,
  ];
  if (color) attrs.push(`data-color="${escapeAttribute(color)}"`);
  if (pageId) attrs.push(`data-page-id="${escapeAttribute(pageId)}"`);
  if (botId) attrs.push(`data-bot-id="${escapeAttribute(botId)}"`);
  return `<script ${attrs.join(' ')} async></script>`;
}

export async function getWebsiteWidgetInstall(
  companyId: string,
  pageId?: string | null,
): Promise<WebsiteWidgetInstall> {
  const config = await db.query.chatbotConfig.findFirst({
    where: eq(chatbotConfig.companyId, companyId),
  });
  if (!config?.isActive || !config.embedEnabled) {
    return { enabled: false, scriptHtml: '' };
  }
  return {
    enabled: true,
    scriptHtml: buildWidgetScriptTag(companyId, config.primaryColor, pageId),
  };
}

export function renderWidgetScript(): string {
  return `(() => {
  const script = document.currentScript;
  const companyId = script?.dataset.companyId;
  const botId = script?.dataset.botId || '';
  const pageId = script?.dataset.pageId || '';
  const rootKey = companyId + (botId ? ':' + botId : '');
  if (!companyId || document.querySelector('[data-oneperson-widget-root="' + rootKey + '"]')) return;

  const apiBase = (script.dataset.apiUrl || new URL('/api/v1', script.src).toString()).replace(/\\/+$/, '');
  const configuredColor = script.dataset.color || '#6366f1';
  const storageKey = 'oneperson_widget_' + companyId + (botId ? '_' + botId : '');
  const visitorKey = storageKey + '_visitor';
  const conversationKey = storageKey + '_conversation_' + (pageId || 'default');
  const visitorId = localStorage.getItem(visitorKey)
    || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()));
  localStorage.setItem(visitorKey, visitorId);

  const root = document.createElement('div');
  root.dataset.onepersonWidgetRoot = rootKey;
  document.body.appendChild(root);
  const shadow = root.attachShadow({ mode: 'open' });

  const state = {
    config: {
      name: 'AI Assistant',
      greeting: 'Hi! How can I help you today?',
      primaryColor: configuredColor,
      avatarUrl: '',
      poweredByVisible: true
    },
    open: false,
    loading: false,
    conversationId: localStorage.getItem(conversationKey) || '',
    messages: []
  };

  const css = document.createElement('style');
  css.textContent = \`
    :host{all:initial;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}
    .opw-launcher{position:fixed;right:22px;bottom:22px;z-index:2147483000;width:58px;height:58px;border:0;border-radius:999px;background:var(--opw-color);color:#fff;box-shadow:0 18px 38px rgba(15,23,42,.24);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .16s ease,box-shadow .16s ease}
    .opw-launcher:hover{transform:translateY(-1px);box-shadow:0 22px 44px rgba(15,23,42,.28)}
    .opw-panel{position:fixed;right:22px;bottom:92px;z-index:2147483000;width:min(380px,calc(100vw - 28px));height:min(560px,calc(100vh - 120px));background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.22);overflow:hidden;display:flex;flex-direction:column}
    .opw-header{background:var(--opw-color);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}
    .opw-avatar{width:34px;height:34px;border-radius:999px;background:#ffffff26;display:flex;align-items:center;justify-content:center;overflow:hidden;font-weight:700}
    .opw-avatar img{width:100%;height:100%;object-fit:cover}
    .opw-title{font:700 14px/1.2 inherit;margin:0}.opw-sub{font:400 12px/1.2 inherit;margin:2px 0 0;color:#ffffffcc}
    .opw-close{margin-left:auto;border:0;background:#ffffff1f;color:#fff;border-radius:999px;width:30px;height:30px;cursor:pointer;font-size:18px;line-height:1}
    .opw-body{flex:1;overflow:auto;padding:14px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}
    .opw-msg{max-width:86%;border-radius:16px;padding:10px 12px;font:400 14px/1.45 inherit;white-space:pre-wrap;word-break:break-word}
    .opw-bot{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;color:#0f172a;border-top-left-radius:6px}
    .opw-user{align-self:flex-end;background:var(--opw-color);color:#fff;border-top-right-radius:6px}
    .opw-quick{align-self:flex-start;display:flex;flex-wrap:wrap;gap:6px;max-width:92%}
    .opw-quick button{border:1px solid color-mix(in srgb,var(--opw-color) 35%,#cbd5e1);background:#fff;color:var(--opw-color);border-radius:999px;padding:7px 10px;font:600 12px/1 inherit;cursor:pointer}
    .opw-typing{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;color:#64748b;border-radius:16px;border-top-left-radius:6px;padding:10px 12px;font:400 13px/1 inherit}
    .opw-input{border-top:1px solid #e2e8f0;padding:10px;background:#fff;display:flex;gap:8px}
    .opw-input input{flex:1;border:1px solid #cbd5e1;border-radius:999px;padding:10px 12px;font:400 14px/1 inherit;outline:none}
    .opw-input input:focus{border-color:var(--opw-color);box-shadow:0 0 0 3px color-mix(in srgb,var(--opw-color) 16%,transparent)}
    .opw-input button{width:42px;border:0;border-radius:999px;background:var(--opw-color);color:#fff;cursor:pointer;font:700 14px/1 inherit}
    .opw-input button:disabled{opacity:.55;cursor:not-allowed}
    .opw-powered{padding:0 12px 10px;text-align:center;color:#94a3b8;background:#fff;font:500 11px/1 inherit}
    @media(max-width:480px){.opw-panel{right:12px;bottom:84px;width:calc(100vw - 24px);height:min(560px,calc(100vh - 106px))}.opw-launcher{right:16px;bottom:16px}}
  \`;
  shadow.appendChild(css);

  function icon() {
    return '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 8.5h9M7.5 12h5.5M21 11.5c0 4.14-4.03 7.5-9 7.5-1.05 0-2.06-.15-3-.43L4 20l1.45-3.38C3.94 15.28 3 13.49 3 11.5 3 7.36 7.03 4 12 4s9 3.36 9 7.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function render() {
    const color = state.config.primaryColor || configuredColor;
    shadow.host.style.setProperty('--opw-color', color);
    const panel = state.open ? \`
      <section class="opw-panel" aria-label="Website chat">
        <header class="opw-header">
          <div class="opw-avatar">\${state.config.avatarUrl ? '<img src="' + escapeHtml(state.config.avatarUrl) + '" alt="">' : escapeHtml((state.config.name || 'A').slice(0,1).toUpperCase())}</div>
          <div><p class="opw-title">\${escapeHtml(state.config.name || 'AI Assistant')}</p><p class="opw-sub">Usually replies instantly</p></div>
          <button class="opw-close" type="button" data-close aria-label="Close chat">&times;</button>
        </header>
        <div class="opw-body" data-body>
          \${state.messages.map(renderMessage).join('')}
          \${state.loading ? '<div class="opw-typing">Typing...</div>' : ''}
        </div>
        <form class="opw-input" data-form>
          <input name="message" autocomplete="off" placeholder="Type your message..." \${state.loading ? 'disabled' : ''}>
          <button type="submit" \${state.loading ? 'disabled' : ''}>&rarr;</button>
        </form>
        \${state.config.poweredByVisible === false ? '' : '<div class="opw-powered">Powered by 1Person</div>'}
      </section>\` : '';
    shadow.innerHTML = '<style>' + css.textContent + '</style>' + panel + \`
      <button class="opw-launcher" type="button" data-toggle aria-label="Open chat">\${icon()}</button>
    \`;
    bind();
  }

  function renderMessage(message) {
    const bubble = '<div class="opw-msg ' + (message.role === 'user' ? 'opw-user' : 'opw-bot') + '">' + escapeHtml(message.content) + '</div>';
    const quick = message.quickReplies?.length
      ? '<div class="opw-quick">' + message.quickReplies.map((qr) => '<button type="button" data-quick="' + escapeHtml(qr.value) + '">' + escapeHtml(qr.label) + '</button>').join('') + '</div>'
      : '';
    return bubble + quick;
  }

  function bind() {
    shadow.querySelector('[data-toggle]')?.addEventListener('click', () => {
      state.open = !state.open;
      if (state.open && state.messages.length === 0) {
        state.messages.push({ role: 'assistant', content: state.config.greeting || 'Hi! How can I help you today?' });
      }
      render();
      scrollBottom();
    });
    shadow.querySelector('[data-close]')?.addEventListener('click', () => { state.open = false; render(); });
    shadow.querySelector('[data-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.message;
      send(String(input.value || ''));
    });
    shadow.querySelectorAll('[data-quick]').forEach((button) => {
      button.addEventListener('click', () => send(button.getAttribute('data-quick') || ''));
    });
  }

  async function loadConfig() {
    try {
      const suffix = botId ? '?botId=' + encodeURIComponent(botId) : '';
      const response = await fetch(apiBase + '/chatbot/widget/' + encodeURIComponent(companyId) + '/config' + suffix);
      if (!response.ok) return false;
      state.config = { ...state.config, ...(await response.json()) };
      return true;
    } catch {
      return false;
    }
  }

  async function loadHistory() {
    if (!state.conversationId) return;
    try {
      const response = await fetch(
        apiBase
          + '/chatbot/widget/'
          + encodeURIComponent(companyId)
          + '/conversations/'
          + encodeURIComponent(state.conversationId)
          + '/history?visitorId='
          + encodeURIComponent(visitorId)
          + (botId ? '&botId=' + encodeURIComponent(botId) : '')
      );
      if (!response.ok) {
        localStorage.removeItem(conversationKey);
        state.conversationId = '';
        state.messages = [];
        return;
      }
      const payload = await response.json();
      if (Array.isArray(payload.messages) && payload.messages.length > 0) {
        state.messages = payload.messages.map((message) => ({
          role: message.role === 'user' ? 'user' : 'assistant',
          content: message.content || '',
          quickReplies: Array.isArray(message.quickReplies) ? message.quickReplies : []
        })).filter((message) => message.content);
      }
    } catch {
      // History is a convenience feature. If it fails, keep the widget usable.
    }
  }

  async function send(rawText) {
    const text = rawText.trim();
    if (!text || state.loading) return;
    state.messages.push({ role: 'user', content: text });
    state.loading = true;
    render();
    scrollBottom();
    try {
      const apiUrl = new URL(apiBase);
      const pageIsLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const apiIsLocal = ['localhost', '127.0.0.1'].includes(apiUrl.hostname);
      if (!pageIsLocal && apiIsLocal) {
        throw new Error('This published page is still connected to a local API. Set NEXT_PUBLIC_API_URL to your public HTTPS API URL, then publish this page again.');
      }
      if (window.location.protocol === 'https:' && apiUrl.protocol !== 'https:') {
        throw new Error('This published page needs an HTTPS API URL. Update NEXT_PUBLIC_API_URL to your public HTTPS tunnel, then publish this page again.');
      }
      const response = await fetch(apiBase + '/chatbot/widget/' + encodeURIComponent(companyId) + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: state.conversationId || null,
          botId: botId || null,
          message: text,
          visitorId,
          pageId: pageId || null,
          pageContext: collectPageContext()
        })
      });
      if (!response.ok) {
        let detail = 'Chat failed';
        try {
          const errorPayload = await response.json();
          detail = errorPayload?.message || errorPayload?.error?.message || errorPayload?.error || detail;
        } catch {}
        throw new Error(detail);
      }
      const payload = await response.json();
      state.conversationId = payload.conversationId || state.conversationId;
      if (state.conversationId) localStorage.setItem(conversationKey, state.conversationId);
      state.messages.push({
        role: 'assistant',
        content: payload.response || 'I could not answer that just now.',
        quickReplies: payload.quickReplies || []
      });
    } catch (error) {
      state.messages.push({
        role: 'assistant',
        content: error instanceof Error && error.message
          ? error.message
          : 'Sorry, I could not send that. Please try again in a moment.'
      });
    } finally {
      state.loading = false;
      render();
      scrollBottom();
    }
  }

  function collectPageContext() {
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
      .map((node) => (node.textContent || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 12);
    const text = (document.body?.innerText || '')
      .replace(/\\s+/g, ' ')
      .replace(/Powered by 1Person/gi, '')
      .trim()
      .slice(0, 2600);
    return {
      url: window.location.href,
      title: document.title || '',
      description: metaDescription,
      headings,
      text
    };
  }

  function scrollBottom() {
    requestAnimationFrame(() => {
      const body = shadow.querySelector('[data-body]');
      if (body) body.scrollTop = body.scrollHeight;
      const input = shadow.querySelector('input[name="message"]');
      if (input) input.focus();
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  loadConfig().then(async (ok) => {
    if (ok) {
      await loadHistory();
      render();
    } else root.remove();
  });
})();`;
}
