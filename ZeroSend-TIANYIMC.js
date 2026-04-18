var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

var Config = {
  SharePath: "s",
  // 分享路径
  DeletePath: "delete",
  // 删除路径
  Shareid_control: 2,
  // 1: UUID, 2: 哈希ID
  Max_times: -1,
  // 最大浏览次数，-1表示无限制
  Max_countdown: 10080,
  // 最长倒计时（分钟），-1表示不限制，1440是一天，10080是一周，43200是一个月，525600是一年
  HmacKey: "\u98CE\u4E4B\u6687\u60F3",
  // HMAC密钥，用于请求签名验证
  HomePageCacheDuration: 36e5,
  // 首页内存缓存时间（毫秒），1小时 = 3600000
  BrowserCacheDuration: 86400,
  // 浏览器缓存时间（秒），1天 = 86400
  WriteDomain: "",
  // 写操作域名（如 "write.yourdomain.com"），留空则不限制域名（仅用于测试）
  ReadDomain: "",
  // 访问页域名（如 "read.yourdomain.com"），留空则使用请求域名。生成的分享链接将使用此域名。
  CfTeamDomain: "",
  // Cloudflare Zero Trust 团队域名（如 "your-team"，对应 your-team.cloudflareaccess.com）
  CfAccessAudience: ""
  // Cloudflare Access 应用程序 Audience（AUD）标签，在 Zero Trust 应用中获取
};

function getReadOrigin(request) {
  if (Config.ReadDomain) return `https://${Config.ReadDomain}`;
  return new URL(request.url).origin;
}
__name(getReadOrigin, "getReadOrigin");

var createResponse = /* @__PURE__ */ __name((body, status = 200, contentType = "text/html; charset=UTF-8", extraHeaders = {}) => new Response(body, {
  status,
  headers: { "Content-Type": contentType, ...extraHeaders }
}), "createResponse");
var createJSONResponse = /* @__PURE__ */ __name((data, status = 200) => createResponse(JSON.stringify(data), status, "application/json; charset=UTF-8"), "createJSONResponse");
var createHTMLResponse = /* @__PURE__ */ __name((html, status = 200, cacheSeconds = 0) => {
  const headers = { "Content-Type": "text/html; charset=UTF-8" };
  if (cacheSeconds > 0) {
    headers["Cache-Control"] = `public, max-age=${cacheSeconds}`;
  }
  return createResponse(html, status, "text/html; charset=UTF-8", headers);
}, "createHTMLResponse");
var createRedirectResponse = /* @__PURE__ */ __name((location = "/") => createResponse("404", 302, "text/plain; charset=UTF-8", { Location: location }), "createRedirectResponse");
var createForbiddenResponse = /* @__PURE__ */ __name(() => createResponse("", 403, "text/plain; charset=UTF-8"), "createForbiddenResponse");
var ERROR_MESSAGES = {
  NOT_FOUND: '\u4E0D\u5B58\u5728\u6216\u5DF2\u8FC7\u671F\u6216\u5DF2\u88AB\u9500\u6BC1\uFF0C<a href="/"><strong>\u8FD4\u56DE\u9996\u9875</strong></a>\u3002',
  INVALID_DATA: '\u6587\u6863\u6570\u636E\u65E0\u6548\uFF0C<a href="/"><strong>\u8FD4\u56DE\u9996\u9875</strong></a>\u3002'
};

var DEFAULT_SETTINGS = {
  defaultViews: 1,
  defaultExpiration: 1440,
  defaultAllowViewerDestroy: true,
  attachmentWarnSizeMB: 64,
  fileMaxSizeMB: 100,
  defaultAttachmentMaxDownloads: -1,
  defaultAttachmentOnePerAccess: false
};
async function getSettings(env) {
  try {
    const raw = await env.Worker_Secret_doc.get("settings");
    if (!raw) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
__name(getSettings, "getSettings");
async function saveSettings(env, data) {
  const settings = {};
  if (data.defaultViews !== undefined) settings.defaultViews = Math.max(1, parseInt(data.defaultViews) || 1);
  if (data.defaultExpiration !== undefined) settings.defaultExpiration = Math.max(1, parseInt(data.defaultExpiration) || 1440);
  if (data.defaultAllowViewerDestroy !== undefined) settings.defaultAllowViewerDestroy = data.defaultAllowViewerDestroy !== false && data.defaultAllowViewerDestroy !== "false";
  if (data.attachmentWarnSizeMB !== undefined) settings.attachmentWarnSizeMB = Math.max(1, parseFloat(data.attachmentWarnSizeMB) || 64);
  if (data.fileMaxSizeMB !== undefined) settings.fileMaxSizeMB = Math.max(1, parseFloat(data.fileMaxSizeMB) || 100);
  if (data.defaultAttachmentMaxDownloads !== undefined) settings.defaultAttachmentMaxDownloads = parseInt(data.defaultAttachmentMaxDownloads) || -1;
  if (data.defaultAttachmentOnePerAccess !== undefined) settings.defaultAttachmentOnePerAccess = data.defaultAttachmentOnePerAccess === true || data.defaultAttachmentOnePerAccess === "true";
  await env.Worker_Secret_doc.put("settings", JSON.stringify(settings));
  homePageCache = null;
  homePageCacheTime = 0;
}
__name(saveSettings, "saveSettings");

var crc32Table = (() => {
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();
function crc32(str) {
  let crc = 0 ^ -1;
  for (let i = 0, len = str.length; i < len; i++) {
    crc = crc >>> 8 ^ crc32Table[(crc ^ str.charCodeAt(i)) & 255];
  }
  return (crc ^ -1) >>> 0;
}
__name(crc32, "crc32");
function generateDocIdWithCrc(docId) {
  return `${docId}${crc32(docId).toString(16).padStart(8, "0")}`;
}
__name(generateDocIdWithCrc, "generateDocIdWithCrc");
function validateAndExtractDocId(docIdWithCrc) {
  if (docIdWithCrc.length < 8) return null;
  const crc = docIdWithCrc.slice(-8);
  const docId = docIdWithCrc.slice(0, -8);
  return crc === crc32(docId).toString(16).padStart(8, "0") ? docId : null;
}
__name(validateAndExtractDocId, "validateAndExtractDocId");
async function generateHmacSignature(message, key) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(generateHmacSignature, "generateHmacSignature");
async function verifyHmacSignature(message, signature, key) {
  try {
    return signature === await generateHmacSignature(message, key);
  } catch {
    return false;
  }
}
__name(verifyHmacSignature, "verifyHmacSignature");

async function verifyRequestSignature(request) {
  const token = request.headers.get("X-Signature");
  if (!token) return false;
  const body = await request.text();
  let requestId;
  try {
    requestId = JSON.parse(body).requestId;
  } catch {
    return false;
  }
  return requestId ? await verifyHmacSignature(body, token, Config.HmacKey) : false;
}
__name(verifyRequestSignature, "verifyRequestSignature");

function validateInput(markdown, views, expiration, attachmentIds) {
  if ((!markdown || markdown === "") && (!Array.isArray(attachmentIds) || attachmentIds.length === 0)) return "\u8BF7\u8F93\u5165\u6587\u672C\u5185\u5BB9\u6216\u6DFB\u52A0\u6587\u4EF6";
  if (!views || views === "" || views < 0) return "\u8BF7\u8F93\u5165\u23F3\u6B63\u786E\u7684\u67E5\u770B\u6B21\u6570";
  if (parseInt(views) === 0) return "\u23F3\u67E5\u770B\u6B21\u6570\u4E0D\u80FD\u4E3A0\uFF081=\u9605\u540E\u5373\u711A, \u226510000=\u65E0\u9650\u6B21\uFF09";
  if (!expiration || expiration === "" || expiration < 0) return "\u8BF7\u8F93\u5165\u23F2\uFE0F\u6B63\u786E\u7684\u6709\u6548\u671F";
  return null;
}
__name(validateInput, "validateInput");
function processViews(views, maxTimes) {
  const viewsInt = parseInt(views);
  if (viewsInt === 0 || viewsInt === 1) return viewsInt;
  return maxTimes === -1 ? viewsInt >= 1e4 ? -1 : viewsInt : Math.min(viewsInt, maxTimes);
}
__name(processViews, "processViews");
function processExpiration(expiration, maxCountdown) {
  const expirationMs = parseInt(expiration);
  const now = Date.now();
  if (maxCountdown === -1) {
    return now + expirationMs * 60 * 1e3;
  }
  const effectiveExpiration = expirationMs < 1 || expirationMs > maxCountdown ? maxCountdown : expirationMs;
  return now + effectiveExpiration * 60 * 1e3;
}
__name(processExpiration, "processExpiration");
function formatRemainingTime(ms) {
  if (ms === void 0 || isNaN(ms) || ms === "") return "\u4E0D\u5B58\u5728";
  const totalSeconds = Math.floor(ms / 1e3);
  return `${Math.floor(totalSeconds / 60)}\u5206 ${totalSeconds % 60}\u79D2`;
}
__name(formatRemainingTime, "formatRemainingTime");

function generateUUIDv7() {
  const timestamp = Date.now();
  const timestampBytes = new Uint8Array(8);
  let ts = timestamp;
  for (let i = 7; i >= 0; i--) {
    timestampBytes[i] = ts & 255;
    ts >>= 8;
  }
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);
  const uuid = new Uint8Array(16);
  uuid.set(timestampBytes.slice(2), 0);
  uuid[6] = 112 | randomBytes[0] & 15;
  uuid[7] = randomBytes[1];
  uuid[8] = 128 | randomBytes[2] & 63;
  uuid.set(randomBytes.slice(3), 9);
  const hex = Array.from(uuid, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
__name(generateUUIDv7, "generateUUIDv7");
async function generateHashId() {
  const timestamp = Date.now().toString();
  const randomBytes = new Uint8Array(64);
  crypto.getRandomValues(randomBytes);
  const encoder = new TextEncoder();
  const timestampBytes = encoder.encode(timestamp);
  const combinedBytes = new Uint8Array(timestampBytes.length + randomBytes.length);
  combinedBytes.set(timestampBytes, 0);
  combinedBytes.set(randomBytes, timestampBytes.length);
  const hashBuffer = await crypto.subtle.digest("SHA-512", combinedBytes);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(generateHashId, "generateHashId");
async function generateDocId(shareidControl) {
  if (shareidControl === 2) {
    return await generateHashId();
  }
  return generateUUIDv7();
}
__name(generateDocId, "generateDocId");

var getCommonFunctions = /* @__PURE__ */ __name(() => `
    const HMAC_KEY = '${Config.HmacKey}';
    const generateHmacSignature = async (message, key) => {
      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
      return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    };
    const generateRequestId = async () => {
      const timestamp = Date.now().toString();
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const encoder = new TextEncoder();
      const data = timestamp + String.fromCharCode(...randomBytes);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    };
    const sendSignedRequest = async (url, data) => {
      const requestId = await generateRequestId();
      const body = JSON.stringify({ ...data, requestId });
      const token = await generateHmacSignature(body, HMAC_KEY);
      
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': token
        },
        body: body
      });
    };
    
    const debounce = (func, wait) => {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    };

    const setTheme = (isDark) => {
      const root = document.documentElement;
      root.style.setProperty('--bg-color', isDark ? '#0d1117' : '#fff');
      root.style.setProperty('--text-color', isDark ? '#c9d1d9' : '#24292e');
      root.style.setProperty('--link-color', isDark ? '#58a6ff' : '#0366d6');
      root.style.setProperty('--border-color', isDark ? '#30363d' : '#e1e4e8');
      root.style.setProperty('--code-bg-color', isDark ? '#161b22' : '#f6f8fa');
      const lightTheme = document.getElementById('highlight-theme-light');
      const darkTheme = document.getElementById('highlight-theme-dark');
      if (lightTheme) lightTheme.disabled = isDark;
      if (darkTheme) darkTheme.disabled = !isDark;
    };

    const formatRemainingTime = (ms) => {
      if (ms === undefined || isNaN(ms) || ms === "") return '\u4E0D\u5B58\u5728';
      const totalSeconds = Math.floor(ms / 1000);
      return Math.floor(totalSeconds / 60) + '\u5206 ' + (totalSeconds % 60) + '\u79D2';
    };

    const encodeBase64 = (txt_md) => btoa(String.fromCharCode(...new TextEncoder().encode(txt_md)));

    const decodeBase64 = (txt_md) => {
      const decodedtxt_md = atob(txt_md);
      return new TextDecoder().decode(new Uint8Array(decodedtxt_md.split('').map(char => char.charCodeAt(0))));
    };

    const generateRandomPassword = (inputId, length = 20) => {
      const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
      let password = '';
      const randomBytes = new Uint8Array(length);
      crypto.getRandomValues(randomBytes);
      for (let i = 0; i < length; i++) {
        password += charset.charAt(randomBytes[i] % charset.length);
      }
      const passwordInput = document.getElementById(inputId);
      if (passwordInput) passwordInput.value = password;
    };

    const togglePasswordVisibility = (inputId) => {
      const passwordInput = document.getElementById(inputId);
      if (!passwordInput) return;
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      const button = passwordInput.parentElement.querySelector('button:last-child');
      if (button) button.textContent = type === 'password' ? '\u663E\u793A' : '\u9690\u85CF';
    };

    const deriveKey = async (password, salt) => {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
      );
      return await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 500000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    };

    const decompress = async (compressedData) => {
      const stream = new DecompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      writer.write(new Uint8Array(compressedData));
      writer.close();
      return new TextDecoder().decode(await new Response(stream.readable).arrayBuffer());
    };

    const configureMarked = () => {
      const renderer = new marked.Renderer();
      renderer.link = ({ href, title, text }) => {
        const titleAttr = title ? ' title="' + title + '"' : '';
        return '<a href="' + href + '"' + titleAttr + ' target="_blank" rel="noopener noreferrer">' + text + '</a>';
      };
      marked.setOptions({
        gfm: true, breaks: true, headerIds: false,
        renderer: renderer,
        highlight: (code, lang) => {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          return hljs.highlight(code, { language }).value;
        }
      });
    };

    const themeToggle = document.getElementById('theme-toggle-checkbox');
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = savedTheme ? savedTheme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    themeToggle.checked = prefersDark;
    setTheme(prefersDark);
    themeToggle.addEventListener('change', (e) => {
      const isDark = e.target.checked;
      setTheme(isDark);
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  `, "getCommonFunctions");
var getDocPageFunctions = /* @__PURE__ */ __name((markdown, isError, remainingTime, remainingViews, docId, usePasswordEncryption) => `
    const isErrorPage = ${isError};
    const usePasswordEncryption = ${usePasswordEncryption};
    let originalMarkdownContent = '';

    const decrypt = async (encryptedData, urlkey, password = null) => {
      try {
        const decoded = atob(encryptedData);
        const combined = new Uint8Array(decoded.split('').map(char => char.charCodeAt(0)));
        const nonce = combined.slice(0, 12);
        const ciphertext = combined.slice(12);
        
        const cryptoKey = password 
          ? await deriveKey(password, btoa(String.fromCharCode(...urlkey)))
          : await crypto.subtle.importKey('raw', urlkey, { name: 'AES-GCM' }, false, ['decrypt']);
        
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cryptoKey, ciphertext);
        return await decompress(decrypted);
      } catch (error) {
        throw new Error('\u89E3\u5BC6\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u5BC6\u7801\u662F\u5426\u6B63\u786E');
      }
    };

    const decryptDocument = async () => {
      const password = document.getElementById('sharePassword').value;
      if (!password) { alert('\u8BF7\u8F93\u5165\u5BC6\u7801'); return; }
      
      try {
        const hash = window.location.hash.substring(1);
        if (!hash) throw new Error('\u7F3A\u5C11\u89E3\u5BC6\u5BC6\u94A5');
        
        const urlkey = new Uint8Array(atob(hash).split('').map(char => char.charCodeAt(0)));
        const encryptedData = ${JSON.stringify(markdown)};
        const decryptedMarkdown = await decrypt(encryptedData, urlkey, password);
        
        originalMarkdownContent = decryptedMarkdown;
        configureMarked();
        document.getElementById('markdown-container').innerHTML = marked.parse(decryptedMarkdown);
        hljs.highlightAll();
        addCopyButtons();
      } catch (error) {
        document.getElementById('markdown-container').innerHTML = '<p><strong><span style="color: #ff0000;">' + error.message + '</span></strong></p>';
      }
    };

    document.getElementById('sharePassword')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') decryptDocument();
    });

    const addCopyButtons = () => {
      document.querySelectorAll('pre').forEach(pre => {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(pre.querySelector('code').innerText).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = 'Copy', 2000);
          });
        });
        pre.appendChild(copyBtn);
      });
    };

    const renderMarkdown = debounce(async () => {
      try {
        const encryptedData = ${JSON.stringify(markdown)};
        if (!encryptedData) throw new Error('\u6587\u6863\u4E0D\u5B58\u5728\u6216\u5DF2\u8FC7\u671F');
        
        const hash = window.location.hash.substring(1);
        if (!hash) throw new Error('\u7F3A\u5C11\u89E3\u5BC6\u5BC6\u94A5');
        
        const urlkey = new Uint8Array(atob(hash).split('').map(char => char.charCodeAt(0)));
        const decryptedMarkdown = await decrypt(encryptedData, urlkey);
        
        originalMarkdownContent = decryptedMarkdown;
        configureMarked();
        document.getElementById('markdown-container').innerHTML = marked.parse(decryptedMarkdown);
        hljs.highlightAll();
        addCopyButtons();
      } catch (error) {
        document.getElementById('markdown-container').innerHTML = '<p><strong><span style="color: #ff0000;">' + error.message + '</span></strong></p>';
      }
    }, 300);

    if (!isErrorPage) {
      setTimeout(() => {
        if (usePasswordEncryption) {
          document.getElementById('markdown-container').innerHTML = '<p><strong><span style="color: #ff0000;">\u8BF7\u8F93\u5165\u5BC6\u7801\u8FDB\u884C\u89E3\u5BC6\u3002</span></strong></p>';
        } else {
          renderMarkdown();
        }
      }, 3000);
    }

    async function copyDocument() {
      if (${isError}) return;
      try {
        await navigator.clipboard.writeText(originalMarkdownContent);
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = '\u2705\u6587\u6863\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F';
        document.body.appendChild(notification);
        notification.style.display = 'block';
        setTimeout(() => {
          notification.style.display = 'none';
          setTimeout(() => document.body.removeChild(notification), 300);
        }, 2000);
      } catch (error) {}
    }

    async function confirmDestruction() {
      if (${isError}) return;
      if (!confirm('\u6B64\u4EFD\u6587\u6863\u5C06\u4F1A\u88AB\u9500\u6BC1\uFF0C\u4E0D\u518D\u652F\u6301\u67E5\u770B')) return;
      const response = await sendSignedRequest('/${Config.DeletePath}/${docId}', {});
      const data = await response.json();
      if (data.success) {
        location.reload();
      } else {
        document.getElementById('markdown-container').innerHTML = '<p><strong><span style="color: #ff0000;">\u9500\u6BC1\u6587\u6863\u65F6\u51FA\u9519</span></strong></p>';
      }
    }

    let remainingTime = ${remainingTime};
    const remainingTimeElement = document.getElementById('remaining-time');
    const updateRemainingTime = () => {
      if (remainingTime !== 0) {
        remainingTime -= 1000;
        if (remainingTime < 0) {
          remainingTime = 0;
          clearInterval(timerInterval);
          location.reload();
        }
        remainingTimeElement.textContent = ' \u23F1\uFE0F\u5269\u4F59\u65F6\u95F4: ' + formatRemainingTime(remainingTime);
      }
    };
    updateRemainingTime();
    const timerInterval = setInterval(updateRemainingTime, 1000);
  `, "getDocPageFunctions");
var getHomePageFunctions = /* @__PURE__ */ __name((settings) => `
    const ATTACH_WARN_SIZE_MB = ${settings.attachmentWarnSizeMB};
    const FILE_MAX_SIZE_MB = ${settings.fileMaxSizeMB};
    const DEFAULT_ATTACH_MAX_DOWNLOADS = ${settings.defaultAttachmentMaxDownloads};

    let pendingFiles = [];

    const showNotification = () => {
      const notification = document.getElementById('notification');
      notification.style.display = 'block';
      setTimeout(() => notification.style.display = 'none', 2000);
    };

    const copyLink = debounce(() => {
      navigator.clipboard.writeText(document.getElementById('link').textContent).then(showNotification);
    }, 300);

    const generateUrlkey = async () => crypto.getRandomValues(new Uint8Array(32));
    const generateNonce = () => crypto.getRandomValues(new Uint8Array(12));

    const compress = async (text) => {
      const encoder = new TextEncoder();
      const stream = new CompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      writer.write(encoder.encode(text));
      writer.close();
      return await new Response(stream.readable).arrayBuffer();
    };

    const encrypt = async (plaintext, urlkey, password = null, salt = null) => {
      const nonce = generateNonce();
      const compressedData = await compress(plaintext);

      const cryptoKey = password && salt
        ? await deriveKey(password, salt)
        : await crypto.subtle.importKey('raw', urlkey, { name: 'AES-GCM' }, false, ['encrypt']);

      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cryptoKey, compressedData);
      const combined = new Uint8Array(nonce.length + encrypted.byteLength);
      combined.set(nonce, 0);
      combined.set(new Uint8Array(encrypted), nonce.length);
      return btoa(String.fromCharCode(...combined));
    };

    const formatFileSize = (bytes) => {
      if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
      if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return bytes + ' B';
    };

    const renderFileList = () => {
      const fileList = document.getElementById('fileList');
      const attachOptions = document.getElementById('attachOptions');
      if (pendingFiles.length === 0) {
        fileList.innerHTML = '';
        if (attachOptions) attachOptions.style.display = 'none';
        return;
      }
      if (attachOptions) attachOptions.style.display = 'flex';
      fileList.innerHTML = pendingFiles.map(function(item, idx) {
        return '<div style="display:flex;align-items:center;gap:6px;padding:3px 6px;background-color:var(--code-bg-color);border:1px solid var(--border-color);border-radius:4px;margin-bottom:3px;font-size:13px;">' +
          '<span style="flex:1;word-break:break-all;">' + item.file.name + '</span>' +
          '<span style="flex-shrink:0;opacity:0.6;">' + formatFileSize(item.file.size) + '</span>' +
          '<button type="button" onclick="removePendingFile(' + idx + ')" style="background-color:#dc3545;padding:1px 6px;font-size:12px;width:auto;height:22px;margin:0;">\u2715</button>' +
          '</div>';
      }).join('');
    };

    const removePendingFile = (idx) => {
      pendingFiles.splice(idx, 1);
      renderFileList();
    };

    const handleFileSelect = (event) => {
      const files = event.target.files;
      for (const file of files) {
        if (file.size > FILE_MAX_SIZE_MB * 1024 * 1024) {
          alert('\u274C \u6587\u4EF6\u8FC7\u5927\\n\\n\u6587\u4EF6 "' + file.name + '" \u5927\u5C0F\u4E3A ' + formatFileSize(file.size) + '\uFF0C\u8D85\u8FC7\u6700\u5927\u9650\u5236 ' + FILE_MAX_SIZE_MB + ' MB\u3002');
          continue;
        }
        if (file.size >= ATTACH_WARN_SIZE_MB * 1024 * 1024) {
          const ok = confirm('\u26A0\uFE0F \u5927\u6587\u4EF6\u63D0\u793A\\n\\n\u6587\u4EF6 "' + file.name + '" \u5927\u5C0F\u4E3A ' + formatFileSize(file.size) + '\uFF0C\u8D85\u8FC7 ' + ATTACH_WARN_SIZE_MB + ' MB\u3002\\n\\n\u8BF7\u6CE8\u610FR2\u989D\u5EA6\u4E0E\u4E0A\u4F20\u4E2D\u65AD\u98CE\u9669\u3002\\n\\n\u662F\u5426\u7EE7\u7EED\u6DFB\u52A0\uFF1F');
          if (!ok) continue;
        }
        pendingFiles.push({ file: file });
      }
      renderFileList();
      event.target.value = '';
    };

    document.getElementById('fileInput').addEventListener('change', handleFileSelect);

    const uploadSingleFile = async (item) => {
      const file = item.file;
      const requestId = await generateRequestId();
      const maxDownloads = parseInt(document.getElementById('attachMaxDownloads').value) || -1;
      const onePerAccess = document.getElementById('attachOnePerAccess').value === 'true';
      const meta = JSON.stringify({ requestId, maxDownloads, onePerAccess });
      const token = await generateHmacSignature(meta, HMAC_KEY);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('_meta', meta);
      const resp = await fetch('/upload', { method: 'POST', headers: { 'X-Signature': token }, body: formData });
      if (!resp.ok) throw new Error('\u6587\u4EF6\u4E0A\u4F20\u5931\u8D25: ' + file.name);
      return await resp.json();
    };

    const createDocument = debounce(async () => {
      const markdown = document.getElementById('markdownText').value;
      const views = document.getElementById('views').value;
      const expiration = document.getElementById('expiration').value;
      const password = document.getElementById('password').value;
      const allowViewerDestroy = document.getElementById('allowViewerDestroy').value !== 'no';
      const submitButton = document.querySelector('button[onclick="createDocument()"]');

      if ((!markdown || markdown.trim() === '') && pendingFiles.length === 0) { alert('\u8BF7\u8F93\u5165\u6587\u672C\u5185\u5BB9\u6216\u6DFB\u52A0\u6587\u4EF6'); return; }
      submitButton.disabled = true;
      submitButton.textContent = '\u751F\u6210\u4E2D...';

      try {
        const urlkey = await generateUrlkey();
        let encryptedContent;
        let usePasswordEncryption = false;

        if (password) {
          usePasswordEncryption = true;
          encryptedContent = await encrypt(markdown, urlkey, password, btoa(String.fromCharCode(...urlkey)));
        } else {
          encryptedContent = await encrypt(markdown, urlkey);
        }

        const attachmentIds = [];
        if (pendingFiles.length > 0) {
          submitButton.textContent = '\u4E0A\u4F20\u9644\u4EF6\u4E2D...';
          for (const item of pendingFiles) {
            const result = await uploadSingleFile(item);
            attachmentIds.push(result.fileId);
          }
        }

        const response = await sendSignedRequest('/submit', {
          views, expiration, usePasswordEncryption, markdown: encryptedContent, allowViewerDestroy, attachmentIds
        });

        const data = await response.json();
        if (data.error) {
          alert(data.error);
        } else {
          const urlkeyBase64 = btoa(String.fromCharCode(...urlkey));
          const linkUrl = data.link + '#' + urlkeyBase64;
          document.getElementById('link').textContent = linkUrl;
          document.getElementById('linkContainer').style.display = 'flex';
          copyLink();
          document.getElementById('qrContainer').style.display = 'block';
          document.getElementById('qrCode').innerHTML = '';
          new QRCode(document.getElementById('qrCode'), {
            text: linkUrl,
            width: 160,
            height: 160
          });
        }
      } catch (error) {
        alert('\u52A0\u5BC6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5: ' + error.message);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = '\u751F\u6210\u7AEF\u5230\u7AEF\u52A0\u5BC6\u94FE\u63A5\u{1F517}';
      }
    }, 300);

    let isPreviewMode = false;

    const renderPreview = debounce(() => {
      configureMarked();
      document.getElementById('previewContent').innerHTML = marked.parse(document.getElementById('markdownText').value);
      hljs.highlightAll();
    }, 300);

    const togglePreview = () => {
      const previewContainer = document.getElementById('previewContainer');
      const previewToggle = document.getElementById('previewToggle');
      const markdownText = document.getElementById('markdownText');

      isPreviewMode = !isPreviewMode;

      if (isPreviewMode) {
        renderPreview();
        previewContainer.style.display = 'block';
        markdownText.style.display = 'none';
        previewToggle.textContent = '\u7F16\u8F91';
      } else {
        previewContainer.style.display = 'none';
        markdownText.style.display = 'block';
        previewToggle.textContent = '\u9884\u89C8';
      }
    };

    const markdownTextEl = document.getElementById('markdownText');
    markdownTextEl.addEventListener('input', () => {
      if (isPreviewMode) renderPreview();
    });

    markdownTextEl.addEventListener('dragover', e => e.preventDefault());
    markdownTextEl.addEventListener('drop', e => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      for (const f of files) {
        if (/\\.(md|txt|markdown)$/i.test(f.name)) {
          const reader = new FileReader();
          reader.onload = ev => { markdownTextEl.value = ev.target.result; updateCharCount(); };
          reader.readAsText(f);
          break;
        }
      }
    });
    markdownTextEl.addEventListener('paste', e => {
      if (e.clipboardData.files && e.clipboardData.files.length > 0) {
        const f = e.clipboardData.files[0];
        if (/\\.(md|txt|markdown)$/i.test(f.name)) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = ev => { markdownTextEl.value = ev.target.result; updateCharCount(); };
          reader.readAsText(f);
        }
      }
    });

    const updateCharCount = () => {
      const textarea = document.getElementById('markdownText');
      const charCount = document.getElementById('charCount');
      if (textarea && charCount) charCount.textContent = textarea.value.length;
    };
    updateCharCount();
  `, "getHomePageFunctions");
var getDocPageContent = /* @__PURE__ */ __name((markdown, isError, remainingTime, remainingViews, docId, usePasswordEncryption, allowViewerDestroy, attachmentLinks = []) => `
    <div class="doc-header" style="margin-bottom: 8px; margin-top: 40px;">
      <div class="doc-header-row" style="display: flex; align-items: center; gap: 8px;">
        <div class="info-block" style="flex: 1; display: flex; align-items: center; justify-content: space-between; background-color: var(--code-bg-color); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; height: 32px; box-sizing: border-box;">
          <div style="display: flex; gap: 15px;">
            <p style="margin: 0; font-size: 13px; line-height: 24px;">\u23F3\u5269\u4F59\u67E5\u770B\u6B21\u6570: ${remainingViews === -1 ? "\u65E0\u9650" : remainingViews === null ? "\u4E0D\u5B58\u5728" : remainingViews}</p>
            <p id="remaining-time" style="margin: 0; font-size: 13px; line-height: 24px;"> \u23F1\uFE0F\u5269\u4F59\u65F6\u95F4: ${formatRemainingTime(remainingTime)}</p>
          </div>
          <div style="display: flex; gap: 6px;">
            <button ${isError ? 'disabled="disabled"' : ""} onclick="copyDocument()" style="background-color: #1E90FF; padding: 3px 8px; margin: 0; height: 24px; font-size: 12px;">\u590D\u5236\u6587\u6863</button>
            ${allowViewerDestroy ? `<button ${isError ? 'disabled="disabled"' : ""} onclick="confirmDestruction()" style="background-color: #ff0000; padding: 3px 8px; margin: 0; height: 24px; font-size: 12px;">\u9500\u6BC1\u6587\u6863</button>` : ""}
          </div>
        </div>
        
        ${usePasswordEncryption ? `
        <div class="password-block" style="flex: 1; display: flex; align-items: center; gap: 6px; background-color: var(--code-bg-color); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; height: 32px; box-sizing: border-box;">
          <label for="sharePassword" style="margin: 0; flex-shrink: 0; font-size: 13px; color: var(--text-color); line-height: 24px;">\u{1F512} \u5BC6\u7801\uFF1A</label>
          <div style="flex: 1; position: relative; display: flex; align-items: center;">
            <input type="password" id="sharePassword" placeholder="\u8F93\u5165\u5BC6\u7801\u89E3\u5BC6\u6587\u6863" style="width: 100%; height: 24px; margin: 0; padding: 2px 60px 2px 8px; font-size: 13px;">
            <div style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%);">
              <button type="button" onclick="togglePasswordVisibility('sharePassword')" style="background-color: #1E90FF; padding: 2px 6px; font-size: 11px; width: auto; height: auto; margin: 0;">\u663E\u793A</button>
            </div>
          </div>
          <button ${isError ? 'disabled="disabled"' : ""} onclick="decryptDocument()" style="background-color: #1E90FF; padding: 3px 8px; width: auto; white-space: nowrap; height: 24px; margin: 0; font-size: 12px;">\u89E3\u5BC6</button>
        </div>
        ` : ""}
      </div>

      <style>
        @media (max-width: 768px) {
          .doc-header { margin-top: 35px; }
          .doc-header-row { flex-direction: column; }
          .info-block, .password-block { width: 100%; flex: none; }
          .info-block { flex-wrap: wrap; height: auto; min-height: 32px; }
        }
      </style>
    </div>
    <article class="markdown-body" id="markdown-container">${isError ? `${markdown}` : '<p><strong><span style="color: #ff0000;">\u{1F510}\u6B63\u5728\u7AEF\u5230\u7AEF\u89E3\u5BC6\u6587\u6863</span></strong></p>'}</article>
    ${attachmentLinks && attachmentLinks.length > 0 ? `
    <div class="attachments-section" style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 12px;">
      <p style="margin: 0 0 8px; font-size: 14px; font-weight: bold; color: var(--text-color);">\uD83D\uDCCE \u9644\u4EF6</p>
      ${attachmentLinks.map(att => {
        const sizeStr = att.size >= 1048576 ? (att.size/1048576).toFixed(1)+"MB" : att.size >= 1024 ? (att.size/1024).toFixed(1)+"KB" : att.size+"B";
        const dlInfo = att.remainingDownloads === -1 ? "" : `\uFF08\u5269\u4F59 ${att.remainingDownloads} \u6B21\u4E0B\u8F7D\uFF09`;
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background-color:var(--code-bg-color);border:1px solid var(--border-color);border-radius:4px;margin-bottom:6px;">
          <span style="font-size:13px;flex:1;word-break:break-all;">${att.filename}</span>
          <span style="font-size:12px;color:var(--text-color);opacity:0.6;flex-shrink:0;">${sizeStr}${dlInfo}</span>
          <a href="${att.downloadUrl}" style="background-color:var(--link-color);color:#fff;border:none;padding:3px 8px;border-radius:4px;font-size:12px;text-decoration:none;flex-shrink:0;">\u4E0B\u8F7D</a>
        </div>`;
      }).join("")}
    </div>
    ` : ""}
  `, "getDocPageContent");
var getHomePageContent = /* @__PURE__ */ __name((settings) => `
    <div class="header-section" style="text-align: center; margin-bottom: 8px; flex-shrink: 0;">
      <p style="margin: 0; font-size: 16px; color: var(--text-color); opacity: 0.8;">\u8BA9\u4F60\u7684\u79D8\u5BC6\u5728\u2601\uFE0F\u98DE\u4E00\u4F1A \u2708\uFE0F</p>
    </div>

    <div class="form-section" style="flex: 1 0 auto; display: flex; flex-direction: column; min-height: 0;">
      <div class="form-group" style="margin-bottom: 8px; flex: 1; display: flex; flex-direction: column; min-height: 0;">
        <div class="editor-wrapper" style="position: relative; flex: 1; min-height: 300px;">
          <textarea id="markdownText" class="editor-box" placeholder="\u8BF7\u8F93\u5165\u4F60\u7684\u79D8\u5BC6\uD83D\uDCC4\uFF0C\u652F\u6301 MarkDown \u683C\u5F0F\u3002" maxlength="100000" oninput="updateCharCount()"></textarea>
          <div style="position: absolute; bottom: 5px; right: 5px; font-size: 12px; color: var(--text-color); opacity: 0.7; z-index: 5;">
            <span id="charCount">0</span>/100000
          </div>
          <button type="button" id="previewToggle" onclick="togglePreview()" style="background-color: #1E90FF; position: absolute; top: 5px; right: 5px; padding: 4px 8px; font-size: 12px; width: auto; z-index: 10; margin: 0;">\u9884\u89C8</button>
          <div id="previewContainer" class="editor-box" style="display: none; background-color: var(--bg-color); border: 1px solid var(--border-color); padding: 10px;">
            <article class="markdown-body" id="previewContent" style="height: 100%; overflow-y: auto;"></article>
          </div>
        </div>
      </div>

      <div class="options-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 0; flex-shrink: 0;">
        <div class="form-group" style="display: flex; align-items: center; gap: 6px; height: 38px; margin-bottom: 0;">
          <label for="views" style="margin: 0; flex-shrink: 0; font-size: 14px; color: var(--text-color); line-height: 38px;">\u231B \u67E5\u770B\u6B21\u6570\uFF1A</label>
          <div style="flex: 1; position: relative; display: flex; align-items: center;">
            <input type="number" id="views" value="${settings.defaultViews}" min="1" max="10000" step="1" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="width: 100%; height: 32px; margin: 0;">
          </div>
        </div>

        <div class="form-group" style="display: flex; align-items: center; gap: 6px; height: 38px; margin-bottom: 0;">
          <label for="expiration" style="margin: 0; flex-shrink: 0; font-size: 14px; color: var(--text-color); line-height: 38px;">\u23F2\uFE0F \u6709\u6548\u671F\uFF1A</label>
          <div style="flex: 1; position: relative; display: flex; align-items: center;">
            <input type="number" id="expiration" value="${settings.defaultExpiration}" min="1" step="1" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="width: 100%; height: 32px; margin: 0;">
          </div>
          <small style="flex-shrink: 0; font-size: 12px; color: var(--text-color); opacity: 0.7; line-height: 38px; margin: 0;">\u5206\u949F</small>
        </div>
      </div>

      <div class="password-section" style="margin-top: 8px; margin-bottom: 0; height: 38px; flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 6px; height: 100%;">
          <label for="password" style="margin: 0; flex-shrink: 0; font-size: 14px; color: var(--text-color); line-height: 38px;">\u{1F512} \u5BC6\u7801\uFF1A</label>
          <div style="flex: 1; position: relative; display: flex; align-items: center;">
            <input type="password" id="password" placeholder="\u53EF\u9009\uFF0C\u8BBE\u7F6E\u5BC6\u7801\u52A0\u5BC6" style="width: 100%; height: 32px; margin: 0;">
            <div style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); display: flex; gap: 5px;">
              <button type="button" onclick="generateRandomPassword('password')" style="background-color: #1E90FF; padding: 2px 6px; font-size: 12px; width: auto; height: auto; margin: 0;">\u968F\u673A\u5BC6\u7801</button>
              <button type="button" onclick="togglePasswordVisibility('password')" style="background-color: #1E90FF; padding: 2px 6px; font-size: 12px; width: auto; height: auto; margin: 0;">\u663E\u793A</button>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top: 8px; margin-bottom: 0; height: 38px; flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 6px; height: 100%;">
          <label for="allowViewerDestroy" style="margin: 0; flex-shrink: 0; font-size: 14px; color: var(--text-color); line-height: 38px;">\u{1F6AB} \u5141\u8BB8\u8BBF\u95EE\u7AEF\u9500\u6BC1\uFF1A</label>
          <select id="allowViewerDestroy" style="height: 32px; margin: 0; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-color); color: var(--text-color); font-size: 14px; box-sizing: border-box; width: auto;">
            <option value="yes" ${settings.defaultAllowViewerDestroy ? "selected" : ""}>\u662F\uFF08\u9ED8\u8BA4\uFF09</option>
            <option value="no" ${!settings.defaultAllowViewerDestroy ? "selected" : ""}>\u5426</option>
          </select>
        </div>
      </div>

      <div id="attachSection" style="margin-top: 8px; flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <label style="margin: 0; flex-shrink: 0; font-size: 14px; color: var(--text-color); line-height: 38px;">\uD83D\uDCC1 \u6587\u4EF6\uFF1A</label>
          <input type="file" id="fileInput" style="display:none" multiple>
          <button type="button" id="addFileBtn" onclick="document.getElementById('fileInput').click()" style="background-color: #6c757d; padding: 4px 10px; font-size: 13px; width: auto; height: 32px; margin: 0;">\u9009\u62E9\u6587\u4EF6</button>
          <small style="font-size: 12px; color: var(--text-color); opacity: 0.7;">\u6700\u5927 ${settings.fileMaxSizeMB} MB/\u6587\u4EF6</small>
        </div>
        <div id="fileList" style="margin-top: 4px;"></div>
        <div id="attachOptions" style="display:none; margin-top: 6px; flex-wrap: wrap; gap: 8px; align-items: center;">
          <label style="font-size: 13px; color: var(--text-color);">\u6700\u5927\u4E0B\u8F7D\u6B21\u6570\uFF1A</label>
          <input type="number" id="attachMaxDownloads" value="${settings.defaultAttachmentMaxDownloads}" min="-1" style="width: 70px; height: 28px; margin: 0; padding: 2px 4px; font-size: 13px;" title="-1 \u4E3A\u65E0\u9650\u5236">
          <small style="font-size: 12px; opacity: 0.7;">-1 \u65E0\u9650</small>
          <label style="font-size: 13px; color: var(--text-color); margin-left: 8px;">\u6BCF\u6B21\u8BBF\u95EE\u9650\u4E0B\u8F7D\u4E00\u6B21\uFF1A</label>
          <select id="attachOnePerAccess" style="height: 28px; padding: 0 6px; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-color); color: var(--text-color); font-size: 13px;">
            <option value="false" ${!settings.defaultAttachmentOnePerAccess ? "selected" : ""}>\u5426</option>
            <option value="true" ${settings.defaultAttachmentOnePerAccess ? "selected" : ""}>\u662F</option>
          </select>
        </div>
      </div>

      <div style="margin-top: 8px; height: 38px; flex-shrink: 0;">
        <button onclick="createDocument()" style="background-color: #1E90FF; width: 100%; height: 100%; font-size: 16px; font-weight: bold; margin: 0;">\u751F\u6210\u7AEF\u5230\u7AEF\u52A0\u5BC6\u94FE\u63A5 \u{1F517}</button>
      </div>

      <style>
        .editor-box {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          border-radius: 4px;
          box-sizing: border-box;
          overflow-y: auto;
        }
        #markdownText {
          background-color: var(--bg-color);
          color: var(--text-color);
          border: 1px solid var(--border-color);
          padding: 10px;
          resize: none;
        }
        @media (max-width: 768px) {
          .options-grid { grid-template-columns: 1fr; }
          .form-section > .form-group:first-child { flex: none; height: 40vh; min-height: 200px; max-height: 400px; }
          .editor-wrapper { min-height: auto; }
        }
      </style>

    </div>

    <div class="link-section" style="margin-top: 8px; flex-shrink: 0;">
      <div id="linkContainer" style="background-color: var(--code-bg-color); border: 1px solid var(--border-color); border-radius: 4px; padding: 8px; display: none; align-items: flex-start; gap: 6px; flex-wrap: wrap; min-height: 38px; box-sizing: border-box;">
        <h3 style="margin: 0; font-size: 14px; color: var(--text-color); flex-shrink: 0; line-height: 22px;">\u5206\u4EAB\u94FE\u63A5\uFF1A</h3>
        <p id="link" onclick="copyLink()" style="margin: 0; word-wrap: break-word; color: var(--link-color); cursor: pointer; flex: 1; min-width: 0; line-height: 22px; font-size: 14px;"></p>
      </div>
      <div id="qrContainer" style="display:none; margin-top: 8px; text-align: center;">
        <div id="qrCode" style="display: inline-block;"></div>
      </div>
    </div>

    <div class="notification" id="notification">\u2705 \u94FE\u63A5\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F</div>

    <div style="margin-top: auto; text-align: center; font-size: 14px; color: var(--text-color); opacity: 0.8; padding-top: 10px; border-top: 1px solid var(--border-color);">
      <p style="margin: 0;">ZeroSend - \u6781\u7B80\u3001\u5F00\u6E90\u7AEF\u5230\u7AEF\u52A0\u5BC6\u7684\u9605\u540E\u5373\u711A\u6587\u4EF6\u5206\u4EAB\u3002 | &copy; <a href="https://github.com/tianyimc" target="_blank" rel="noopener noreferrer" style="color: var(--link-color); text-decoration: none;">tianyimc.com</a> <a href="https://github.com/tianyimc/ZeroSend" target="_blank" rel="noopener noreferrer" style="color: var(--link-color); text-decoration: none;">\u57FA\u4E8E\u5F00\u6E90\u9879\u76EE</a> | v2.0.0 | <a href="/admin" style="color: var(--link-color); text-decoration: none;">\u{1F4CB} \u7BA1\u7406</a></p>
    </div>
  `, "getHomePageContent");
function renderHTML(markdown = "", isDocPage = false, remainingViews = 0, isError = false, remainingTime = 0, docId = "", usePasswordEncryption = false, allowViewerDestroy = true, attachmentLinks = [], settings = null) {
  const effectiveSettings = settings || DEFAULT_SETTINGS;
  const commonFunctions = getCommonFunctions();
  const docPageFunctions = getDocPageFunctions(markdown, isError, remainingTime, remainingViews, docId, usePasswordEncryption);
  const homePageFunctions = getHomePageFunctions(effectiveSettings);
  const pageContent = isDocPage ? getDocPageContent(markdown, isError, remainingTime, remainingViews, docId, usePasswordEncryption, allowViewerDestroy, attachmentLinks) : getHomePageContent(effectiveSettings);
  const pageFunctions = isDocPage ? docPageFunctions : homePageFunctions;
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZeroSend - \u7AEF\u5230\u7AEF\u52A0\u5BC6\u7684\u9605\u540E\u5373\u711A\u6587\u4EF6\u5206\u4EAB</title>
  <meta name="description" content="ZeroSend - \u6781\u7B80\u3001\u5F00\u6E90\u3001\u7AEF\u5230\u7AEF\u52A0\u5BC6\u7684\u9605\u540E\u5373\u711A\u6587\u4EF6\u5206\u4EAB\u3002 | ZeroSend - Minimalist, open-source, end-to-end encrypted self-destructing file sharing.">
  <meta name="keywords" content="\u9605\u540E\u5373\u711A, \u6587\u672C\u52A0\u5BC6, \u804A\u5929, \u5F00\u6E90, \u5B89\u5168, \u52A0\u5BC6, \u7AEF\u5230\u7AEF, \u5BC6\u6587">
  <link rel="icon" type="image/png" href="data:image/x-icon;base64,AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAQAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPa3/ED6m/1NAnP9VQZH/VUOG/1VEff9ITnr1AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADy0/5s+q///P6D//0GV//9Civ//RID//5KCsIL0kE9V/pNHVf6UR1X+lEdV/pNHRv2SRgEAAAAAAAAAAAAAAAA7u/+pPbL//zCR5v8aZ7//PYz3/0OG//+7hoX//ZJI//6USP/+lEj//pRI//6USP/+k0dFAAAAAAAAAAAAAAAAOsL/qTy5//8ZcsD/AEaU/y+C4v9Cjf//uoiG//2TSP/+lEj//pRI//6USP/+lEj//pRHVQAAAAAAAAAAAAAAADnJ/6k7wP//Oa/4/y6R4/8/n/7/QZT//7mNh//8mUv//ppL//6aSv/+mUr//phK//6YSVUAAAAAAAAAAAAAAAA4zf5zOsf//Du8//89sf//Pqb//0qc9f/am23//aFO//6hTv/+oE7//qBN//6fTf/+nk1VAAAAAAAAAAAAAAAAAAAAAFfB4lmKsrT/8JVT/1ep5v/7pVL//alS//6oUf/+qFH//qdR//6mUf/+plD//qVQVQAAAAAAAAAAAAAAAAAAAADHsYBUb7/P/1S55/+jsqT//bBV//6wVf/9r1X//a1U//2sVP/9rFT//axT//2rU1UAAAAAAAAAAAAAAAAAAAAA+bhdU/65Wf/+uFn//rhZ//63Wf/+tlj/+7FX//mrVv/4p1b/96dV//mpVv/6q1VWAAAAAAAAAAAAAAAAAAAAAP7AXVP/wF3//8Bc//+/XP//vlz//btb//mwWf/1p1j/86FX//KfVv/zoFb/9qteVgAAAAAAAAAAAAAAAAAAAAD/x2BT/8dg///GYP//xl///8Vf//y+Xv/4uWn//tyt//7hsf/95K3/++WmxffIhQ0AAAAAAAAAAAAAAAAAAAAA/85jU//OY///zWP//81j///MYv/8xGH/+cR5//3jrv/85qr/++mmxfvopw0AAAAAAAAAAAAAAAAAAAAAAAAAAP/VZlP/1Wb//9Rm///UZv//02b//c1k//nLef/76af/+uyjxfrqow0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/22lR/9xq///baf//2mn//9pp//7XaP/51Xn/+e6gxfntoQ0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgP8AAIADAACAAwAAgAMAAIADAACAAwAAwAMAAMADAADAAwAAwAMAAMADAADABwAAwA8AAMAfAADAPwAA//8AAA==">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.8.1/github-markdown.min.css">
  <link id="highlight-theme-light" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css">
  <link id="highlight-theme-dark" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css" disabled>
  <script src="https://fastly.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
  <style>
    :root {
      --bg-color: #fff;
      --text-color: #24292e;
      --link-color: #0366d6;
      --border-color: #e1e4e8;
      --code-bg-color: #f6f8fa;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #0d1117;
        --text-color: #c9d1d9;
        --link-color: #58a6ff;
        --border-color: #30363d;
        --code-bg-color: #161b22;
      }
    }
    body {
      font-family: Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      overflow: hidden;
      visibility: hidden;
    }
    .container {
      background-color: var(--bg-color);
      padding: 20px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      width: 88%;
      height: 90%;
      max-height: 90%;
      max-width: 90%;
      border: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      overflow: auto;
      position: relative;
    }
    @media (max-width: 768px) {
      body { overflow: auto; align-items: flex-start; padding: 10px 0; height: auto; min-height: 100vh; }
      .container { width: 92%; height: auto; min-height: 90vh; max-height: none; padding: 12px; margin: auto; }
    }
    @media (prefers-color-scheme: dark) {
      .container { box-shadow: 0 0 10px rgba(255, 255, 255, 0.1); }
    }
    textarea, input {
      background-color: var(--bg-color);
      color: var(--text-color);
      border: 1px solid var(--border-color);
      width: 100%;
      margin-top: 10px;
      border-radius: 4px;
      padding: 10px;
      box-sizing: border-box;
      resize: none;
    }
    textarea { height: 250px; }
    button {
      background-color: var(--link-color);
      color: #fff;
      border: none;
      padding: 10px;
      cursor: pointer;
      border-radius: 4px;
      width: 100%;
      margin-top: 5px;
    }
    button:hover { opacity: 0.8; }
    #link {
      margin-top: 20px;
      cursor: pointer;
      color: var(--link-color);
      word-wrap: break-word;
    }
    #link:hover { text-decoration: underline; }
    .markdown-body {
      overflow-y: auto;
      color: var(--text-color);
      padding-right: 10px;
      -webkit-overflow-scrolling: touch;
    }
    .markdown-body pre {
      background-color: var(--code-bg-color);
      position: relative;
    }
    .markdown-body pre:hover .copy-btn { opacity: 1; }
    .copy-btn {
      position: absolute;
      top: 4px;
      right: 8px;
      width: 50px;
      height: 24px;
      background-color: var(--code-bg-color);
      border: 1px solid var(--border-color);
      color: var(--text-color);
      border-radius: 4px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.3s;
      font-size: 12px;
      display: flex;
      justify-content: center;
      align-items: center;
      transform: translateY(-6px);
    }
    .theme-toggle {
      position: absolute;
      top: 10px;
      right: 10px;
      cursor: pointer;
      z-index: 1000;
    }
    .theme-toggle input { display: none; }
    .theme-toggle label {
      display: block;
      width: 40px;
      height: 20px;
      background-color: #ccc;
      border-radius: 20px;
      position: relative;
      transition: background-color 0.3s;
    }
    .theme-toggle label:before {
      content: "\u2600\uFE0F";
      display: flex;
      justify-content: center;
      align-items: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: #fff;
      position: absolute;
      top: 2px;
      left: 2px;
      transition: transform 0.3s;
      font-size: 10px;
    }
    .theme-toggle input:checked + label { background-color: #2196F3; }
    .theme-toggle input:checked + label:before {
      content: "\u{1F319}";
      transform: translateX(20px);
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background-color: var(--bg-color); }
    ::-webkit-scrollbar-thumb { background-color: var(--border-color); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background-color: #aaa; }
    .notification {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--link-color);
      color: #fff;
      padding: 10px 20px;
      border-radius: 4px;
      display: none;
      z-index: 1000;
    }
    .form-group { margin-bottom: 15px; }
    .info-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
      padding: 10px;
      border-radius: 4px;
      background-color: var(--code-bg-color);
    }
    .info-container p { margin: 0; font-size: 14px; color: var(--text-color); }
    .info-container button { width: auto; padding: 5px 10px; margin-left: 10px; }
    #markdown-container { box-shadow: 0 0 0 1px #ccc; padding: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="theme-toggle">
      <input type="checkbox" id="theme-toggle-checkbox">
      <label for="theme-toggle-checkbox"></label>
    </div>
    
    ${pageContent}
    
    <script>
      ${commonFunctions}
      ${pageFunctions}
      document.body.style.visibility = 'visible';
    <\/script>
  </div>
</body>
</html>`;
}
__name(renderHTML, "renderHTML");

async function createDocument(request, env) {
  const requestBody = await request.text();
  if (new Blob([requestBody]).size > 100 * 1024) {
    return new Response("", { status: 204, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  }
  const { markdown, views, expiration, usePasswordEncryption, allowViewerDestroy, attachmentIds } = JSON.parse(requestBody);
  const errorMessage = validateInput(markdown, views, expiration, attachmentIds);
  if (errorMessage) {
    return createJSONResponse({ error: errorMessage }, 400);
  }
  const viewsInt = processViews(views, Config.Max_times);
  const expirationMs = processExpiration(expiration, Config.Max_countdown);
  if (isNaN(viewsInt) || isNaN(expirationMs) || expirationMs <= 0) {
    return createJSONResponse({ error: "\u65E0\u6548\u7684\u53C2\u6570\u503C" }, 400);
  }
  const docId = await generateDocId(Config.Shareid_control);
  await env.Worker_Secret_doc.put(docId, JSON.stringify({
    markdown,
    views: viewsInt,
    expiration: expirationMs,
    usePasswordEncryption,
    allowViewerDestroy: allowViewerDestroy !== false,
    attachmentIds: Array.isArray(attachmentIds) ? attachmentIds : []
  }));
  const link = `${getReadOrigin(request)}/${Config.SharePath}/${generateDocIdWithCrc(docId)}`;
  return createJSONResponse({ link });
}
__name(createDocument, "createDocument");
async function getDocument(docIdWithCrc, env, request) {
  const docId = validateAndExtractDocId(docIdWithCrc);
  if (!docId) return createRedirectResponse();
  const value = await env.Worker_Secret_doc.get(docId);
  if (!value) {
    return createHTMLResponse(renderHTML(ERROR_MESSAGES.NOT_FOUND, true, 0, true, 0, ""));
  }
  const data = JSON.parse(value);
  if (isNaN(data.expiration) || data.expiration <= 0 || isNaN(data.views)) {
    await env.Worker_Secret_doc.delete(docId);
    return createHTMLResponse(renderHTML(ERROR_MESSAGES.INVALID_DATA, true, 0, true, 0, ""));
  }
  const origin = getReadOrigin(request);
  const shareUrl = `${origin}/${Config.SharePath}/${docIdWithCrc}`;
  if (Date.now() > data.expiration) {
    await archiveDocument(docId, docIdWithCrc, shareUrl, data, "expired", env);
    return createHTMLResponse(renderHTML(ERROR_MESSAGES.NOT_FOUND, true, 0, true, 0, ""));
  }
  if (data.views !== 0 && data.views !== -1) {
    data.views -= 1;
    if (data.views <= 0) {
      await archiveDocument(docId, docIdWithCrc, shareUrl, data, "views_depleted", env);
    } else {
      await env.Worker_Secret_doc.put(docId, JSON.stringify(data));
    }
  }
  const attachmentLinks = [];
  if (Array.isArray(data.attachmentIds) && data.attachmentIds.length > 0) {
    for (const fileId of data.attachmentIds) {
      try {
        const metaStr = await env.Worker_Secret_doc.get(`file:${fileId}`);
        if (!metaStr) continue;
        const fileMeta = JSON.parse(metaStr);
        let downloadUrl = `/file/${fileId}`;
        if (fileMeta.onePerAccess) {
          const token = await generateDownloadToken(fileId, env);
          downloadUrl = `/file/${fileId}?token=${token}`;
        }
        attachmentLinks.push({
          filename: fileMeta.filename,
          size: fileMeta.size,
          contentType: fileMeta.contentType,
          remainingDownloads: fileMeta.remainingDownloads,
          downloadUrl
        });
      } catch {}
    }
  }
  const remainingTime = Math.max(0, data.expiration - Date.now());
  const allowViewerDestroy = data.allowViewerDestroy !== false;
  return createHTMLResponse(renderHTML(data.markdown, true, data.views, false, remainingTime, docIdWithCrc, data.usePasswordEncryption || false, allowViewerDestroy, attachmentLinks));
}
//tianyimc tianyimc@contact.com 20260419
__name(getDocument, "getDocument");
async function deleteDocument(docIdWithCrc, env, request) {
  // Permanent purge of a history entry
  if (docIdWithCrc.startsWith("hist:")) {
    const innerDocIdWithCrc = docIdWithCrc.slice(5);
    const docId = validateAndExtractDocId(innerDocIdWithCrc);
    if (!docId) return createJSONResponse({ success: false, error: "Invalid document ID" });
    await env.Worker_Secret_doc.delete(`hist:${docId}`);
    return createJSONResponse({ success: true });
  }
  // Archive active doc → history
  const docId = validateAndExtractDocId(docIdWithCrc);
  if (!docId) return createJSONResponse({ success: false, error: "Invalid document ID" });
  const value = await env.Worker_Secret_doc.get(docId);
  if (value) {
    try {
      const data = JSON.parse(value);
      const origin = getReadOrigin(request);
      const shareUrl = `${origin}/${Config.SharePath}/${docIdWithCrc}`;
      await archiveDocument(docId, docIdWithCrc, shareUrl, data, "manual", env);
    } catch {
      await env.Worker_Secret_doc.delete(docId);
    }
  }
  return createJSONResponse({ success: true });
}
__name(deleteDocument, "deleteDocument");

async function archiveDocument(docId, docIdWithCrc, shareUrl, data, reason, env) {
  if (Array.isArray(data.attachmentIds) && data.attachmentIds.length > 0) {
    for (const fileId of data.attachmentIds) {
      try {
        await env.Worker_Secret_doc.delete(`file:${fileId}`);
        if (env.Secret_doc_R2) await env.Secret_doc_R2.delete(fileId);
      } catch {}
    }
  }
  const histData = {
    docIdWithCrc,
    shareUrl,
    expiration: data.expiration,
    views: data.views,
    usePasswordEncryption: data.usePasswordEncryption || false,
    reason,
    destroyedAt: Date.now()
  };
  await env.Worker_Secret_doc.put(`hist:${docId}`, JSON.stringify(histData));
  await env.Worker_Secret_doc.delete(docId);
}
__name(archiveDocument, "archiveDocument");

async function listDocuments(request, env) {
  const origin = getReadOrigin(request);
  const active = [];
  const history = [];
  let cursor = void 0;
  const now = Date.now();
  do {
    const listResult = await env.Worker_Secret_doc.list(cursor !== void 0 ? { cursor } : {});
    for (const key of listResult.keys) {
      const value = await env.Worker_Secret_doc.get(key.name);
      if (!value) continue;
      try {
        const data = JSON.parse(value);
        if (key.name.startsWith("hist:")) {
          history.push(data);
        } else if (!isNaN(data.expiration) && data.expiration > now) {
          const docIdWithCrc = generateDocIdWithCrc(key.name);
          active.push({
            docIdWithCrc,
            expiration: data.expiration,
            views: data.views,
            usePasswordEncryption: data.usePasswordEncryption || false,
            attachmentCount: Array.isArray(data.attachmentIds) ? data.attachmentIds.length : 0,
            shareUrl: `${origin}/${Config.SharePath}/${docIdWithCrc}`
          });
        } else {
          // Auto-archive expired or invalid entries encountered during listing
          const docIdWithCrc = generateDocIdWithCrc(key.name);
          const shareUrl = `${origin}/${Config.SharePath}/${docIdWithCrc}`;
          await archiveDocument(key.name, docIdWithCrc, shareUrl, data, "expired", env);
        }
      } catch {
      }
    }
    cursor = listResult.list_complete ? void 0 : listResult.cursor;
  } while (cursor !== void 0);
  return createJSONResponse({ active, history });
}
__name(listDocuments, "listDocuments");

async function generateDownloadToken(fileId, env) {
  const tokenBytes = new Uint8Array(16);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.Worker_Secret_doc.put(`dltoken:${token}`, JSON.stringify({ fileId, expiresAt: Date.now() + 3600000 }), { expirationTtl: 3600 });
  return token;
}
__name(generateDownloadToken, "generateDownloadToken");

async function uploadFile(request, env) {
  if (!env.Secret_doc_R2) return createJSONResponse({ error: "R2\u672A\u914D\u7F6E" }, 500);
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return createJSONResponse({ error: "\u8BF7\u6C42\u4F53\u65E0\u6548" }, 400);
  }
  const file = formData.get("file");
  const metaStr = formData.get("_meta");
  const sigHeader = request.headers.get("X-Signature");
  if (!file || !metaStr || !sigHeader) return createJSONResponse({ error: "\u53C2\u6570\u7F3A\u5931" }, 400);
  const valid = await verifyHmacSignature(metaStr, sigHeader, Config.HmacKey);
  if (!valid) return createForbiddenResponse();
  let meta;
  try {
    meta = JSON.parse(metaStr);
  } catch {
    return createJSONResponse({ error: "\u65E0\u6548\u7684\u5143\u6570\u636E" }, 400);
  }
  const MAX_SIZE = Math.max(1, (await getSettings(env)).fileMaxSizeMB) * 1024 * 1024;
  if (file.size > MAX_SIZE) return createJSONResponse({ error: "\u6587\u4EF6\u5927\u5C0F\u8D85\u8FC7\u9650\u5236" }, 400);
  const filename = file.name || "file";
  const contentType = file.type || "application/octet-stream";
  const timestamp = Date.now().toString();
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const enc = new TextEncoder();
  const nameBytes = enc.encode(filename + timestamp);
  const combined = new Uint8Array(nameBytes.length + randomBytes.length);
  combined.set(nameBytes, 0);
  combined.set(randomBytes, nameBytes.length);
  const hashBuf = await crypto.subtle.digest("SHA-256", combined);
  const fileId = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const arrayBuffer = await file.arrayBuffer();
  await env.Secret_doc_R2.put(fileId, arrayBuffer, { httpMetadata: { contentType } });
  const maxDownloads = meta.maxDownloads !== undefined ? parseInt(meta.maxDownloads) : -1;
  const onePerAccess = meta.onePerAccess === true;
  const fileMeta = {
    filename,
    contentType,
    size: file.size,
    maxDownloads,
    onePerAccess,
    remainingDownloads: maxDownloads,
    uploadedAt: Date.now()
  };
  await env.Worker_Secret_doc.put(`file:${fileId}`, JSON.stringify(fileMeta));
  return createJSONResponse({ fileId, filename, size: file.size, contentType });
}
__name(uploadFile, "uploadFile");

async function downloadFile(fileId, token, env) {
  if (!env.Secret_doc_R2) return new Response("\u670D\u52A1\u672A\u914D\u7F6E", { status: 500, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  const metaStr = await env.Worker_Secret_doc.get(`file:${fileId}`);
  if (!metaStr) return new Response("\u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u5DF2\u8FC7\u671F", { status: 404, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  let meta;
  try {
    meta = JSON.parse(metaStr);
  } catch {
    return new Response("\u6587\u4EF6\u6570\u636E\u65E0\u6548", { status: 404, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  }
  if (meta.onePerAccess === true) {
    if (!token) return new Response("\u9700\u8981\u4E0B\u8F7D\u4EE4\u724C", { status: 403, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
    const tokenDataStr = await env.Worker_Secret_doc.get(`dltoken:${token}`);
    if (!tokenDataStr) return new Response("\u4E0B\u8F7D\u4EE4\u724C\u65E0\u6548\u6216\u5DF2\u8FC7\u671F", { status: 403, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
    let tokenData;
    try { tokenData = JSON.parse(tokenDataStr); } catch { return new Response("\u4EE4\u724C\u6570\u636E\u65E0\u6548", { status: 403, headers: { "Content-Type": "text/plain; charset=UTF-8" } }); }
    if (tokenData.fileId !== fileId) return new Response("\u4EE4\u724C\u4E0E\u6587\u4EF6\u4E0D\u5339\u914D", { status: 403, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
    if (Date.now() > tokenData.expiresAt) return new Response("\u4E0B\u8F7D\u4EE4\u724C\u5DF2\u8FC7\u671F", { status: 403, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
    await env.Worker_Secret_doc.delete(`dltoken:${token}`);
  }
  if (meta.remainingDownloads === 0) return new Response("\u6587\u4EF6\u4E0B\u8F7D\u6B21\u6570\u5DF2\u7528\u5B8C", { status: 410, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  const r2Object = await env.Secret_doc_R2.get(fileId);
  if (!r2Object) return new Response("\u6587\u4EF6\u4E0D\u5B58\u5728", { status: 404, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  if (meta.remainingDownloads !== -1) {
    meta.remainingDownloads -= 1;
    if (meta.remainingDownloads <= 0) {
      await env.Worker_Secret_doc.delete(`file:${fileId}`);
      await env.Secret_doc_R2.delete(fileId);
    } else {
      await env.Worker_Secret_doc.put(`file:${fileId}`, JSON.stringify(meta));
    }
  }
  const safeFilename = encodeURIComponent(meta.filename);
  return new Response(r2Object.body, {
    headers: {
      "Content-Type": meta.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${safeFilename}`,
      "Cache-Control": "no-store"
    }
  });
}
__name(downloadFile, "downloadFile");

async function getSettingsPageHTML(env) {
  const settings = await getSettings(env);
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\u2699\uFE0F \u8BBE\u7F6E - ZeroSend</title>
  <style>
    :root { --bg-color:#fff; --text-color:#24292e; --link-color:#0366d6; --border-color:#e1e4e8; --code-bg-color:#f6f8fa; }
    @media (prefers-color-scheme: dark) { :root { --bg-color:#0d1117; --text-color:#c9d1d9; --link-color:#58a6ff; --border-color:#30363d; --code-bg-color:#161b22; } }
    body { font-family: Arial, sans-serif; background-color: var(--bg-color); color: var(--text-color); margin: 0; padding: 20px; min-height: 100vh; box-sizing: border-box; visibility: hidden; }
    .settings-container { max-width: 700px; margin: 0 auto; }
    h2 { margin: 0 0 16px; font-size: 20px; }
    .section-title { font-size: 15px; font-weight: bold; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border-color); }
    .form-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .form-row label { min-width: 220px; font-size: 14px; color: var(--text-color); }
    .form-row input, .form-row select { flex: 1; height: 32px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-color); color: var(--text-color); font-size: 14px; box-sizing: border-box; }
    button { background-color: var(--link-color); color: #fff; border: none; padding: 8px 20px; cursor: pointer; border-radius: 4px; font-size: 14px; }
    button:hover { opacity: 0.8; }
    a { color: var(--link-color); }
    .notification { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background-color: var(--link-color); color: #fff; padding: 10px 20px; border-radius: 4px; display: none; z-index: 1000; }
    .theme-toggle { position: fixed; top: 14px; right: 20px; cursor: pointer; }
    .theme-toggle input { display: none; }
    .theme-toggle label { display: block; width: 40px; height: 20px; background-color: #ccc; border-radius: 20px; position: relative; transition: background-color 0.3s; }
    .theme-toggle label:before { content: "\u2600\uFE0F"; display: flex; justify-content: center; align-items: center; width: 16px; height: 16px; border-radius: 50%; background-color: #fff; position: absolute; top: 2px; left: 2px; transition: transform 0.3s; font-size: 10px; }
    .theme-toggle input:checked + label { background-color: #2196F3; }
    .theme-toggle input:checked + label:before { content: "\u{1F319}"; transform: translateX(20px); }
    .about-text { font-size: 14px; line-height: 1.8; color: var(--text-color); }
    @media (max-width: 600px) { .form-row { flex-direction: column; align-items: flex-start; } .form-row label { min-width: auto; } .form-row input, .form-row select { width: 100%; } }
  </style>
</head>
<body>
  <div class="theme-toggle"><input type="checkbox" id="theme-toggle-checkbox"><label for="theme-toggle-checkbox"></label></div>
  <div class="settings-container">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <a href="/admin" style="font-size:14px;">\u2190 \u8FD4\u56DE\u7BA1\u7406</a>
      <h2 style="margin:0;">\u2699\uFE0F \u8BBE\u7F6E</h2>
    </div>
    <div class="section-title">\u9ED8\u8BA4\u503C\u8BBE\u7F6E</div>
    <div class="form-row">
      <label>\u9ED8\u8BA4\u67E5\u770B\u6B21\u6570</label>
      <input type="number" id="defaultViews" value="${settings.defaultViews}" min="1">
    </div>
    <div class="form-row">
      <label>\u9ED8\u8BA4\u6709\u6548\u65F6\u957F\uFF08\u5206\u949F\uFF09</label>
      <input type="number" id="defaultExpiration" value="${settings.defaultExpiration}" min="1">
    </div>
    <div class="form-row">
      <label>\u9ED8\u8BA4\u5141\u8BB8\u8BBF\u95EE\u7AEF\u9500\u6BC1</label>
      <select id="defaultAllowViewerDestroy">
        <option value="true" ${settings.defaultAllowViewerDestroy ? "selected" : ""}>\u662F</option>
        <option value="false" ${!settings.defaultAllowViewerDestroy ? "selected" : ""}>\u5426</option>
      </select>
    </div>
    <div class="form-row">
      <label>\u9644\u4EF6\u8B66\u544A\u6700\u5C0F\u5927\u5C0F\uFF08MB\uFF09</label>
      <input type="number" id="attachmentWarnSizeMB" value="${settings.attachmentWarnSizeMB}" min="1" step="0.1">
    </div>
    <div class="form-row">
      <label>\u6587\u4EF6\u6700\u5927\u5927\u5C0F\uFF08MB\uFF09</label>
      <input type="number" id="fileMaxSizeMB" value="${settings.fileMaxSizeMB}" min="1" step="1">
    </div>
    <div class="form-row">
      <label>\u9644\u4EF6\u9ED8\u8BA4\u6700\u5927\u4E0B\u8F7D\u6B21\u6570</label>
      <input type="number" id="defaultAttachmentMaxDownloads" value="${settings.defaultAttachmentMaxDownloads}" title="-1 \u4E3A\u65E0\u9650\u5236">
    </div>
    <div class="form-row">
      <label>\u9ED8\u8BA4\u9650\u5236\u6BCF\u6B21\u8BBF\u95EE\u53EA\u80FD\u4E0B\u8F7D\u4E00\u6B21\u9644\u4EF6</label>
      <select id="defaultAttachmentOnePerAccess">
        <option value="false" ${!settings.defaultAttachmentOnePerAccess ? "selected" : ""}>\u5426</option>
        <option value="true" ${settings.defaultAttachmentOnePerAccess ? "selected" : ""}>\u662F</option>
      </select>
    </div>
    <button onclick="saveSettings()">\u4FDD\u5B58\u8BBE\u7F6E</button>

    <div class="section-title">\u5173\u4E8E</div>
        <div class="about-text">
          <p>\u5f53\u524d\u7248\u672c\uFF1Av2.0.0 Release</p>
          <p>\u4F5C\u8005\uFF1A<strong>tianyimc</strong></p>
          <p>\u9879\u76EE\u94FE\u63A5\uFF1A<a href="https://github.com/tianyimc/ZeroSend" target="_blank" rel="noopener noreferrer">tianyimc/ZeroSend</a></p>
          <p>\u8054\u7CFB\u90AE\u7BB1\uFF1Acontact@tianyimc.com</p>
         <p>\u611F\u8C22\u539F\u4ED3\u5E93\u4F5C\u8005 fzxx \u7684\u5F00\u6E90\u8D21\u732E\uFF0C\u672C\u9879\u76EE\u57FA\u4E8E\u5176\u5DE5\u4F5C\u8FDB\u884C\u4E8C\u6B21\u5F00\u53D1\u3002</p>
        </div>
  </div>
  <div class="notification" id="notification"></div>
  <script>
    ${getCommonFunctions()}

    const saveSettings = async () => {
      const data = {
        defaultViews: parseInt(document.getElementById('defaultViews').value) || 1,
        defaultExpiration: parseInt(document.getElementById('defaultExpiration').value) || 1440,
        defaultAllowViewerDestroy: document.getElementById('defaultAllowViewerDestroy').value === 'true',
        attachmentWarnSizeMB: parseFloat(document.getElementById('attachmentWarnSizeMB').value) || 64,
        fileMaxSizeMB: parseFloat(document.getElementById('fileMaxSizeMB').value) || 100,
        defaultAttachmentMaxDownloads: parseInt(document.getElementById('defaultAttachmentMaxDownloads').value) || -1,
        defaultAttachmentOnePerAccess: document.getElementById('defaultAttachmentOnePerAccess').value === 'true'
      };
      try {
        const resp = await sendSignedRequest('/api/settings', data);
        const result = await resp.json();
        if (result.success) {
          const n = document.getElementById('notification');
          n.textContent = '\u2705 \u8BBE\u7F6E\u5DF2\u4FDD\u5B58';
          n.style.display = 'block';
          setTimeout(() => n.style.display = 'none', 2500);
        } else {
          alert('\u4FDD\u5B58\u5931\u8D25: ' + (result.error || '\u672A\u77E5\u9519\u8BEF'));
        }
      } catch (e) {
        alert('\u4FDD\u5B58\u5931\u8D25: ' + e.message);
      }
    };

    window.addEventListener('DOMContentLoaded', () => { document.body.style.visibility = 'visible'; });
  <\/script>
</body>
</html>`;
}
__name(getSettingsPageHTML, "getSettingsPageHTML");

async function saveSettingsAPI(request, env) {
  const body = await request.text();
  let data;
  try { data = JSON.parse(body); } catch { return createJSONResponse({ error: "\u65E0\u6548\u7684\u8BF7\u6C42\u4F53" }, 400); }
  await saveSettings(env, data);
  return createJSONResponse({ success: true });
}
__name(saveSettingsAPI, "saveSettingsAPI");

function getAdminPageHTML(request) {
  const commonFunctions = getCommonFunctions();
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\u6587\u6863\u7BA1\u7406 - ZeroSend</title>
  <link id="highlight-theme-light" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css">
  <link id="highlight-theme-dark" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css" disabled>
  <style>
    :root {
      --bg-color: #fff;
      --text-color: #24292e;
      --link-color: #0366d6;
      --border-color: #e1e4e8;
      --code-bg-color: #f6f8fa;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #0d1117;
        --text-color: #c9d1d9;
        --link-color: #58a6ff;
        --border-color: #30363d;
        --code-bg-color: #161b22;
      }
    }
    body {
      font-family: Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      box-sizing: border-box;
      visibility: hidden;
    }
    .admin-container {
      background-color: var(--bg-color);
      padding: 20px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
      border-radius: 8px;
      max-width: 1100px;
      margin: 0 auto;
      border: 1px solid var(--border-color);
      position: relative;
    }
    @media (prefers-color-scheme: dark) {
      .admin-container { box-shadow: 0 0 10px rgba(255,255,255,0.1); }
    }
    h2 { color: var(--text-color); margin-top: 0; font-size: 18px; }
    .section-title { font-size: 15px; font-weight: bold; margin: 20px 0 8px; padding-bottom: 6px; border-bottom: 2px solid var(--border-color); color: var(--text-color); }
    button {
      background-color: var(--link-color);
      color: #fff;
      border: none;
      padding: 6px 12px;
      cursor: pointer;
      border-radius: 4px;
      font-size: 13px;
      width: auto;
      margin: 0;
    }
    button:hover { opacity: 0.8; }
    button.danger { background-color: #dc3545; }
    button.secondary { background-color: #6c757d; }
    input[type="checkbox"] { width: auto; margin: 0; padding: 0; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
    th, td { border: 1px solid var(--border-color); padding: 8px 10px; text-align: left; }
    th { background-color: var(--code-bg-color); font-weight: bold; }
    tr:hover td { background-color: var(--code-bg-color); }
    .share-link { color: var(--link-color); cursor: pointer; word-break: break-all; font-size: 12px; }
    .share-link:hover { text-decoration: underline; }
    .share-link-disabled { color: #999; word-break: break-all; font-size: 12px; cursor: default; }
    .theme-toggle {
      position: absolute;
      top: 12px;
      right: 12px;
      cursor: pointer;
      z-index: 1000;
    }
    .theme-toggle input { display: none; }
    .theme-toggle label {
      display: block;
      width: 40px;
      height: 20px;
      background-color: #ccc;
      border-radius: 20px;
      position: relative;
      transition: background-color 0.3s;
    }
    .theme-toggle label:before {
      content: "\u2600\uFE0F";
      display: flex;
      justify-content: center;
      align-items: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: #fff;
      position: absolute;
      top: 2px;
      left: 2px;
      transition: transform 0.3s;
      font-size: 10px;
    }
    .theme-toggle input:checked + label { background-color: #2196F3; }
    .theme-toggle input:checked + label:before { content: "\u{1F319}"; transform: translateX(20px); }
    .notification {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--link-color);
      color: #fff;
      padding: 10px 20px;
      border-radius: 4px;
      display: none;
      z-index: 1000;
    }
    .toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    .toolbar label { font-size: 13px; cursor: pointer; margin: 0; }
    .status-bar { font-size: 12px; color: var(--text-color); opacity: 0.7; margin-left: auto; }
    .confirm-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 2000;
      justify-content: center;
      align-items: center;
    }
    .confirm-box {
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 24px;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
    }
    .confirm-box p { margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: var(--text-color); }
    .confirm-box-btns { display: flex; gap: 8px; justify-content: flex-end; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background-color: var(--bg-color); }
    ::-webkit-scrollbar-thumb { background-color: var(--border-color); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background-color: #aaa; }
    @media (max-width: 768px) {
      body { padding: 10px; }
      table { font-size: 11px; }
      th, td { padding: 5px 6px; }
    }
  </style>
</head>
<body>
  <div class="admin-container">
    <div class="theme-toggle">
      <input type="checkbox" id="theme-toggle-checkbox">
      <label for="theme-toggle-checkbox"></label>
    </div>
    <h2>\u{1F4CB} \u6587\u6863\u7BA1\u7406</h2>

    <div class="section-title">\u{1F4C4} \u6709\u6548\u6587\u6863</div>
    <div class="toolbar">
      <button onclick="loadDocs()">\u{1F504} \u5237\u65B0</button>
      <input type="checkbox" id="selectAllActive" onchange="toggleSelectAll('active', this.checked)">
      <label for="selectAllActive">\u5168\u9009</label>
      <button class="danger" onclick="deleteSelectedActive()">\u{1F5D1}\uFE0F \u5220\u9664\u6240\u9009</button>
      <span class="status-bar" id="statusBar">\u52A0\u8F7D\u4E2D...</span>
    </div>
    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr>
            <th style="width: 30px;"></th>
            <th>\u5206\u4EAB\u94FE\u63A5</th>
            <th style="width: 80px;">\u5269\u4F59\u6B21\u6570</th>
            <th style="width: 160px;">\u5230\u671F\u65F6\u95F4</th>
            <th style="width: 70px;">\u5BC6\u7801\u52A0\u5BC6</th>
            <th style="width: 60px;">\u64CD\u4F5C</th>
          </tr>
        </thead>
        <tbody id="activeTableBody">
          <tr><td colspan="6" style="text-align:center;">\u52A0\u8F7D\u4E2D...</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section-title">\u{1F4DC} \u5386\u53F2\u6587\u6863</div>
    <div class="toolbar">
      <input type="checkbox" id="selectAllHistory" onchange="toggleSelectAll('history', this.checked)">
      <label for="selectAllHistory">\u5168\u9009</label>
      <button class="danger" onclick="deleteSelectedHistory()">\u{1F5D1}\uFE0F \u6C38\u4E45\u5220\u9664</button>
      <span class="status-bar" id="histStatusBar"></span>
    </div>
    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr>
            <th style="width: 30px;"></th>
            <th>\u5206\u4EAB\u94FE\u63A5</th>
            <th style="width: 80px;">\u5269\u4F59\u6B21\u6570</th>
            <th style="width: 160px;">\u5230\u671F\u65F6\u95F4</th>
            <th style="width: 70px;">\u5BC6\u7801\u52A0\u5BC6</th>
            <th style="width: 60px;">\u64CD\u4F5C</th>
          </tr>
        </thead>
        <tbody id="historyTableBody">
          <tr><td colspan="6" style="text-align:center;">\u52A0\u8F7D\u4E2D...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Confirm Modal -->
  <div class="confirm-overlay" id="confirmModal">
    <div class="confirm-box">
      <p id="confirmMsg"></p>
      <div class="confirm-box-btns">
        <button class="secondary" id="confirmCancelBtn">\u53D6\u6D88</button>
        <button class="danger" id="confirmOkBtn">\u786E\u8BA4</button>
      </div>
    </div>
  </div>

  <div class="notification" id="notification"></div>
  <div style="margin-top: 16px; text-align: center; font-size: 14px; color: var(--text-color); opacity: 0.8; padding-top: 10px; border-top: 1px solid var(--border-color);">
    <p style="margin: 0;">ZeroSend - \u6781\u7B80\u3001\u5F00\u6E90\u7AEF\u5230\u7AEF\u52A0\u5BC6\u7684\u9605\u540E\u5373\u711A\u6587\u4EF6\u5206\u4EAB\u3002 | &copy; <a href="https://github.com/tianyimc" target="_blank" rel="noopener noreferrer" style="color: var(--link-color); text-decoration: none;">tianyimc.com</a> <a href="https://github.com/tianyimc/ZeroSend" target="_blank" rel="noopener noreferrer" style="color: var(--link-color); text-decoration: none;">\u57FA\u4E8E\u5F00\u6E90\u9879\u76EE</a> | v2.0.0 | <a href="/settings" style="color: var(--link-color);">\u2699\uFE0F \u8BBE\u7F6E</a></p>
  </div>
  <script>
    ${commonFunctions}

    const ADMIN_DELETE_PATH = '${Config.DeletePath}';

    const showNotification = (msg) => {
      const n = document.getElementById('notification');
      n.textContent = msg;
      n.style.display = 'block';
      setTimeout(() => n.style.display = 'none', 2500);
    };

    const showConfirm = (message, onConfirm) => {
      document.getElementById('confirmMsg').innerHTML = message;
      const modal = document.getElementById('confirmModal');
      modal.style.display = 'flex';
      document.getElementById('confirmOkBtn').onclick = () => {
        modal.style.display = 'none';
        onConfirm();
      };
      document.getElementById('confirmCancelBtn').onclick = () => {
        modal.style.display = 'none';
      };
    };

    let allActiveDocs = [];
    let allHistoryDocs = [];

    const formatExpiration = (ts) => new Date(ts).toLocaleString('zh-CN', { hour12: false });
    const formatViews = (v) => v === -1 ? '\u65E0\u9650' : String(v);

    const renderActiveDocs = (docs) => {
      const tbody = document.getElementById('activeTableBody');
      document.getElementById('selectAllActive').checked = false;
      if (!docs || docs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">\u6682\u65E0\u6587\u6863</td></tr>';
        document.getElementById('statusBar').textContent = '\u5171 0 \u4EFD\u6709\u6548\u6587\u6863';
        return;
      }
      document.getElementById('statusBar').textContent = '\u5171 ' + docs.length + ' \u4EFD\u6709\u6548\u6587\u6863';
      tbody.innerHTML = docs.map(function(doc) {
        const safeUrl = doc.shareUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const safeUrlForAttr = doc.shareUrl.replace(/'/g, "\\\\'");
        return '<tr>' +
          '<td style="text-align:center;"><input type="checkbox" class="active-check" value="' + doc.docIdWithCrc + '"></td>' +
          '<td><span class="share-link" onclick="copyShareLink(\\'' + safeUrlForAttr + '\\')" title="\u70B9\u51FB\u590D\u5236\u94FE\u63A5">' + safeUrl + '</span></td>' +
          '<td style="text-align:center;">' + formatViews(doc.views) + '</td>' +
          '<td>' + formatExpiration(doc.expiration) + '</td>' +
          '<td style="text-align:center;">' + (doc.usePasswordEncryption ? '\u{1F512} \u662F' : '\u5426') + '</td>' +
          '<td style="text-align:center;"><button class="danger" style="padding:3px 8px;font-size:12px;" onclick="archiveDoc(\\'' + doc.docIdWithCrc + '\\')">\u5220\u9664</button></td>' +
          '</tr>';
      }).join('');
    };

    const renderHistoryDocs = (docs) => {
      const tbody = document.getElementById('historyTableBody');
      document.getElementById('selectAllHistory').checked = false;
      if (!docs || docs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">\u6682\u65E0\u5386\u53F2\u6587\u6863</td></tr>';
        document.getElementById('histStatusBar').textContent = '\u5171 0 \u6761\u5386\u53F2\u8BB0\u5F55';
        return;
      }
      document.getElementById('histStatusBar').textContent = '\u5171 ' + docs.length + ' \u6761\u5386\u53F2\u8BB0\u5F55';
      tbody.innerHTML = docs.map(function(doc) {
        const safeUrl = doc.shareUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const viewsHtml = doc.reason === 'manual'
          ? '<span style="color:#dc3545;">\u4E3B\u52A8\u9500\u6BC1</span>'
          : '<span style="color:#dc3545;">' + (doc.views === -1 ? '\u65E0\u9650' : String(doc.views)) + '</span>';
        return '<tr>' +
          '<td style="text-align:center;"><input type="checkbox" class="history-check" value="' + doc.docIdWithCrc + '"></td>' +
          '<td><span class="share-link-disabled">' + safeUrl + '</span></td>' +
          '<td style="text-align:center;">' + viewsHtml + '</td>' +
          '<td style="color:#dc3545;">' + formatExpiration(doc.expiration) + '</td>' +
          '<td style="text-align:center;">' + (doc.usePasswordEncryption ? '\u{1F512} \u662F' : '\u5426') + '</td>' +
          '<td style="text-align:center;"><button class="danger" style="padding:3px 8px;font-size:12px;" onclick="purgeDoc(\\'' + doc.docIdWithCrc + '\\')">\u5220\u9664</button></td>' +
          '</tr>';
      }).join('');
    };

    const loadDocs = async () => {
      document.getElementById('statusBar').textContent = '\u52A0\u8F7D\u4E2D...';
      try {
        const resp = await fetch('/api/docs');
        if (!resp.ok) throw new Error('\u8BF7\u6C42\u5931\u8D25: ' + resp.status);
        const result = await resp.json();
        allActiveDocs = result.active || [];
        allHistoryDocs = result.history || [];
        renderActiveDocs(allActiveDocs);
        renderHistoryDocs(allHistoryDocs);
      } catch (e) {
        document.getElementById('activeTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:#dc3545;">\u52A0\u8F7D\u5931\u8D25: ' + e.message + '</td></tr>';
        document.getElementById('statusBar').textContent = '\u52A0\u8F7D\u5931\u8D25';
      }
    };

    const copyShareLink = (url) => {
      navigator.clipboard.writeText(url).then(() => showNotification('\u2705 \u94FE\u63A5\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F'));
    };

    const toggleSelectAll = (type, checked) => {
      document.querySelectorAll('.' + type + '-check').forEach(function(cb) { cb.checked = checked; });
    };

    // Archive single active doc (move to history)
    const archiveDoc = (docIdWithCrc) => {
      showConfirm(
        '\u6B64\u4EFD\u6587\u6863\u5C06\u4F1A\u88AB\u7EB3\u5165\u5386\u53F2\u6587\u6863\uFF0C\u4E0D\u518D\u652F\u6301\u67E5\u770B',
        async () => {
          try {
            const resp = await sendSignedRequest('/' + ADMIN_DELETE_PATH + '/' + docIdWithCrc, {});
            const data = await resp.json();
            if (data.success) {
              showNotification('\u2705 \u5DF2\u5F52\u5165\u5386\u53F2');
              await loadDocs();
            } else {
              showNotification('\u274C \u64CD\u4F5C\u5931\u8D25: ' + (data.error || '\u672A\u77E5\u9519\u8BEF'));
            }
          } catch (e) {
            showNotification('\u274C \u64CD\u4F5C\u51FA\u9519: ' + e.message);
          }
        }
      );
    };

    // Permanently purge a history entry
    const purgeDoc = (docIdWithCrc) => {
      showConfirm(
        '\u6B64\u6761\u8BB0\u5F55\u5C06\u88AB\u6C38\u4E45\u6292\u9664',
        async () => {
          try {
            const resp = await sendSignedRequest('/' + ADMIN_DELETE_PATH + '/hist:' + docIdWithCrc, {});
            const data = await resp.json();
            if (data.success) {
              showNotification('\u2705 \u8BB0\u5F55\u5DF2\u6C38\u4E45\u5220\u9664');
              await loadDocs();
            } else {
              showNotification('\u274C \u64CD\u4F5C\u5931\u8D25: ' + (data.error || '\u672A\u77E5\u9519\u8BEF'));
            }
          } catch (e) {
            showNotification('\u274C \u64CD\u4F5C\u51FA\u9519: ' + e.message);
          }
        }
      );
    };

    // Archive selected active docs
    const deleteSelectedActive = () => {
      const selected = Array.from(document.querySelectorAll('.active-check:checked')).map(function(cb) { return cb.value; });
      if (selected.length === 0) { showNotification('\u26A0\uFE0F \u8BF7\u5148\u9009\u62E9\u8981\u64CD\u4F5C\u7684\u6587\u6863'); return; }
      const n = selected.length;
      showConfirm(
        '\u9009\u4E2D\u7684<strong style="color:#dc3545;">' + n + '</strong>\u4EFD\u6587\u6863\u5C06\u4F1A\u88AB\u7EB3\u5165\u5386\u53F2\u6587\u6863\uFF0C\u4E0D\u518D\u652F\u6301\u67E5\u770B',
        async () => {
          let success = 0, fail = 0;
          for (let i = 0; i < selected.length; i++) {
            try {
              const resp = await sendSignedRequest('/' + ADMIN_DELETE_PATH + '/' + selected[i], {});
              const data = await resp.json();
              if (data.success) success++; else fail++;
            } catch (e) { fail++; }
          }
          showNotification('\u2705 \u5DF2\u5F52\u5165\u5386\u53F2 ' + success + ' \u4EFD' + (fail > 0 ? '\uFF0C' + fail + ' \u4EFD\u5931\u8D25' : ''));
          await loadDocs();
        }
      );
    };

    // Permanently purge selected history entries
    const deleteSelectedHistory = () => {
      const selected = Array.from(document.querySelectorAll('.history-check:checked')).map(function(cb) { return cb.value; });
      if (selected.length === 0) { showNotification('\u26A0\uFE0F \u8BF7\u5148\u9009\u62E9\u8981\u64CD\u4F5C\u7684\u8BB0\u5F55'); return; }
      const n = selected.length;
      showConfirm(
        '\u9009\u4E2D\u7684<strong style="color:#dc3545;">' + n + '</strong>\u6761\u8BB0\u5F55\u5C06\u88AB\u6C38\u4E45\u6292\u9664',
        async () => {
          let success = 0, fail = 0;
          for (let i = 0; i < selected.length; i++) {
            try {
              const resp = await sendSignedRequest('/' + ADMIN_DELETE_PATH + '/hist:' + selected[i], {});
              const data = await resp.json();
              if (data.success) success++; else fail++;
            } catch (e) { fail++; }
          }
          showNotification('\u2705 \u5DF2\u6C38\u4E45\u5220\u9664 ' + success + ' \u6761' + (fail > 0 ? '\uFF0C' + fail + ' \u6761\u5931\u8D25' : ''));
          await loadDocs();
        }
      );
    };

    window.addEventListener('DOMContentLoaded', async () => {
      await loadDocs();
      document.body.style.visibility = 'visible';
    });
  <\/script>
</body>
</html>`;
}
__name(getAdminPageHTML, "getAdminPageHTML");

var jwksCache = null;
var jwksCacheTime = 0;
//t
var JWKS_CACHE_TTL = 10 * 60 * 1e3;
//i
async function fetchJwks(teamDomain) {
  const now = Date.now();
  if (jwksCache && now - jwksCacheTime < JWKS_CACHE_TTL) return jwksCache;
  const resp = await fetch(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!resp.ok) return null;
  jwksCache = await resp.json();
  jwksCacheTime = now;
  return jwksCache;
}
//a
__name(fetchJwks, "fetchJwks");
//n
async function verifyCfAccessJwt(request) {
  const teamDomain = Config.CfTeamDomain;
  const audience = Config.CfAccessAudience;
  if (!teamDomain || !audience) return true;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const pad = (s) => s + "=".repeat((4 - s.length % 4) % 4);
    const header = JSON.parse(atob(pad(parts[0].replace(/-/g, "+").replace(/_/g, "/"))));
    const payload = JSON.parse(atob(pad(parts[1].replace(/-/g, "+").replace(/_/g, "/"))));
    const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audList.includes(audience)) return false;
    if (Math.floor(Date.now() / 1e3) > payload.exp) return false;
    const jwks = await fetchJwks(teamDomain);
    if (!jwks) return false;
    const jwk = jwks.keys.find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
      false,
      ["verify"]
    );
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sig = new Uint8Array(atob(pad(parts[2].replace(/-/g, "+").replace(/_/g, "/"))).split("").map((c) => c.charCodeAt(0)));
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sig, data);
  } catch {
    return false;
  }
}
//y
__name(verifyCfAccessJwt, "verifyCfAccessJwt");
//i
var homePageCache = null;
var homePageCacheTime = 0;
async function getHomePage(env) {
  const now = Date.now();
  if (homePageCache && now - homePageCacheTime < Config.HomePageCacheDuration) {
    return createHTMLResponse(homePageCache, 200, Config.BrowserCacheDuration);
  }
  const settings = await getSettings(env);
  homePageCache = renderHTML("", false, 0, false, 0, "", false, true, [], settings);
  homePageCacheTime = now;
  return createHTMLResponse(homePageCache, 200, Config.BrowserCacheDuration);
}
//m
__name(getHomePage, "getHomePage");
//c
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const { pathname, hostname } = url;
  const isWriteRequest = request.method === "POST" || (request.method === "GET" && (pathname === "/" || pathname === "/admin" || pathname === "/api/docs" || pathname === "/settings" || pathname === "/api/settings"));
  if (isWriteRequest && Config.WriteDomain) {
    if (hostname !== Config.WriteDomain) {
      return createHTMLResponse(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>ZeroSend只读端</title>
  <style>
    body {
      font-family: "Microsoft YaHei", Arial, sans-serif;
      background-color: #f9f9f9;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .notice {
      background-color: #fff;
      border: 2px solid #ccc;
      border-radius: 8px;
      padding: 20px 30px;
      max-width: 600px;
      text-align: center;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    .notice h2 {
      margin-top: 0;
      color: #333;
    }
    .notice p {
      font-size: 16px;
      line-height: 1.6;
      color: #555;
    }
  </style>
</head>
<body>
  <div class="notice">
    <h2>提示信息</h2>
    <p>
      此域名为只读端，不提供文档创建和管理功能。<br>
      如果你持有一个分享链接，可以直接访问查阅文档内容。<br>
      如需创建或管理文档，请前往写入端。
    </p>
    <p style="margin: 0;">ZeroSend - \u6781\u7B80\u3001\u5F00\u6E90\u7AEF\u5230\u7AEF\u52A0\u5BC6\u7684\u9605\u540E\u5373\u711A\u6587\u4EF6\u5206\u4EAB\u3002 | &copy; <a href="https://github.com/tianyimc" target="_blank" rel="noopener noreferrer" style="color: var(--link-color); text-decoration: none;">tianyimc.com</a> <a href="https://github.com/tianyimc/ZeroSend" target="_blank" rel="noopener noreferrer" style="color: var(--link-color); text-decoration: none;">\u57FA\u4E8E\u5F00\u6E90\u9879\u76EE</a> | v2.0.0 | <a href="/settings" style="color: var(--link-color);">\u2699\uFE0F \u8BBE\u7F6E</a></p>
    </div>
</body>
</html>`, 403);
    }
    if (!await verifyCfAccessJwt(request)) {
      return createForbiddenResponse();
    }
  }
  if (request.method === "POST") {
    if (pathname === "/upload") return await uploadFile(request, env);
    if (pathname === "/api/settings") {
      const requestClone = request.clone();
      if (!await verifyRequestSignature(requestClone)) return createForbiddenResponse();
      return await saveSettingsAPI(request, env);
    }
    const requestClone = request.clone();
    if (!await verifyRequestSignature(requestClone)) {
      return createForbiddenResponse();
    }
    if (pathname === "/submit") return await createDocument(request, env);
    if (pathname.startsWith(`/${Config.DeletePath}/`)) {
      return await deleteDocument(pathname.replace(`/${Config.DeletePath}/`, ""), env, request);
    }
    return createForbiddenResponse();
  }
  if (request.method === "GET" && pathname.startsWith("/file/")) {
    const fileId = pathname.replace("/file/", "");
    const token = url.searchParams.get("token") || null;
    return await downloadFile(fileId, token, env);
  }
  if (request.method === "GET" && pathname === "/settings") {
    return createHTMLResponse(await getSettingsPageHTML(env));
  }
  if (request.method === "GET" && pathname === "/api/settings") {
    return createJSONResponse(await getSettings(env));
  }
  if (request.method === "GET" && pathname.startsWith(`/${Config.SharePath}/`)) {
    return await getDocument(pathname.replace(`/${Config.SharePath}/`, ""), env, request);
  }
  if (request.method === "GET" && pathname === "/") {
    return await getHomePage(env);
  }
  if (request.method === "GET" && pathname === "/admin") {
    return createHTMLResponse(getAdminPageHTML(request));
  }
  if (request.method === "GET" && pathname === "/api/docs") {
    return await listDocuments(request, env);
  }
  return createRedirectResponse();
}
__name(handleRequest, "handleRequest");
var index_default = {
  async fetch(request, env, ctx) {
    return await handleRequest(request, env);
  }
};
export {
  index_default as default
};

// 项目来自ZeroSend，作者tianyimc，基于fzxx的Cloudflare Worker Secret doc.js
// GitHub地址：https://github.com/tianyimc/ZeroSend/ 请遵守相关开源协议使用和传播代码，谢谢！
// 联系我：contact@tianyimc.com
// 20260419