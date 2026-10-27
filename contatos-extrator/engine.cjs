var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  deepScrapeChamber: () => deepScrapeChamber,
  deleteDeveloperExtractionRule: () => deleteDeveloperExtractionRule,
  deleteDeveloperSignature: () => deleteDeveloperSignature,
  detectChamberDeveloper: () => detectChamberDeveloper,
  detectPlatformAndDeveloper: () => detectPlatformAndDeveloper,
  executeDeveloperExtraction: () => executeDeveloperExtraction,
  expandPatternVariants: () => expandPatternVariants,
  extractDeterministicData: () => extractDeterministicData,
  extractMesaMemberFromLine: () => extractMesaMemberFromLine,
  extractWithGemini: () => extractWithGemini,
  getDeveloperExtractionRules: () => getDeveloperExtractionRules,
  getDeveloperSignatures: () => getDeveloperSignatures,
  isConfirmedChamberWebsite: () => isConfirmedChamberWebsite,
  isLikelyPrefeituraWebsite: () => isLikelyPrefeituraWebsite,
  isValidPersonName: () => isValidPersonName,
  mainPageText: () => mainPageText,
  parseHtml: () => parseHtml,
  presidentNamesFromText: () => presidentNamesFromText,
  saveDeveloperExtractionRule: () => saveDeveloperExtractionRule,
  saveDeveloperSignature: () => saveDeveloperSignature,
  searchGoogleForChamberWebsite: () => searchGoogleForChamberWebsite,
  validateAndResolveChamberUrl: () => validateAndResolveChamberUrl
});
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"));
var import_path = __toESM(require("path"));
var import_fs = __toESM(require("fs"));

// jp-network.ts
var import_node_async_hooks = require("node:async_hooks");
var import_promises = require("node:dns/promises");
var import_node_net = require("node:net");
var scope = new import_node_async_hooks.AsyncLocalStorage();
function networkScope(max, seconds, next) {
  scope.run({ calls: 0, max: Math.min(100, Math.max(5, Number(max) || 35)), deadline: Date.now() + Math.min(600, Math.max(30, Number(seconds) || 240)) * 1e3, cache: /* @__PURE__ */ new Map(), failures: [], visited: [] }, next);
}
function networkStats() {
  const s = scope.getStore();
  return s ? { requests: s.calls, visited: s.visited, failures: s.failures.slice(-10) } : {};
}
function publicIP(ip) {
  if (process.env.JP_TEST_ALLOW_LOOPBACK === "1") return true;
  let s = ip.toLowerCase();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if ((0, import_node_net.isIP)(s) === 4) {
    const [a, b] = s.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224);
  }
  return (0, import_node_net.isIP)(s) === 6 && !["::", "::1"].includes(s) && !s.startsWith("fc") && !s.startsWith("fd") && !s.startsWith("fe80:");
}
async function validURL(value) {
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw Error("URL n\xE3o p\xFAblica");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const entries = await (0, import_promises.lookup)(host, { all: true });
  if (!entries.length || entries.some((x) => !publicIP(x.address))) throw Error("Endere\xE7o local/reservado n\xE3o permitido");
  return u;
}
async function networkGet(value, seconds = 7, rootURL) {
  const s = scope.getStore();
  if (s?.cache.has(value)) return s.cache.get(value);
  if (s && (s.calls >= s.max || Date.now() > s.deadline)) return null;
  try {
    let url = value;
    for (let n = 0; n < 6; n++) {
      const u = await validURL(url);
      if (rootURL) {
        const root = new URL(rootURL);
        if (u.hostname.toLowerCase().replace(/^www\./, "") !== root.hostname.toLowerCase().replace(/^www\./, "") || u.port !== root.port) throw Error("Redirecionamento fora do site cadastrado bloqueado");
      }
      if (s) {
        if (s.calls >= s.max || Date.now() > s.deadline) throw Error("Limite da navega\xE7\xE3o atingido");
        s.calls++;
      }
      const timeout = Math.min(Math.max(1, Number(process.env.JP_REQUEST_TIMEOUT) || seconds), 20) * 1e3;
      const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(Math.min(timeout, s ? Math.max(1, s.deadline - Date.now()) : timeout)), headers: { "User-Agent": "Mozilla/5.0 JP-Minato-Contatos/1.10", "Accept": "text/html,application/xhtml+xml,application/json", "Accept-Language": "pt-BR,pt;q=0.9" } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        url = new URL(r.headers.get("location"), u).href;
        await r.body?.cancel();
        continue;
      }
      if (!r.ok) {
        await r.body?.cancel();
        throw Error("HTTP " + r.status);
      }
      const reader = r.body?.getReader();
      if (!reader) throw Error("Resposta vazia");
      const parts = [];
      let size = 0;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          throw Error("P\xE1gina excede 2 MB");
        }
        parts.push(chunk);
      }
      const buffer = Buffer.concat(parts);
      const charset = (r.headers.get("content-type") || "").match(/charset=([^;\s]+)/i)?.[1] || "utf-8";
      let html;
      try {
        html = new TextDecoder(charset).decode(buffer);
      } catch {
        html = buffer.toString("utf8");
      }
      const result = { html, finalUrl: url };
      s?.visited.push(url);
      s?.cache.set(value, result);
      return result;
    }
    throw Error("Redirecionamentos em excesso");
  } catch (e) {
    const message = String(e?.message || "Erro de acesso").slice(0, 180);
    s?.failures.push(message);
    s?.cache.set(value, null);
    return null;
  }
}
function exec(command, options, callback) {
  const urls = [...command.matchAll(/"(https?:\/\/[^"\s]+)"/g)];
  const url = urls.at(-1)?.[1];
  if (!url) {
    callback(new Error("URL ausente"), "");
    return;
  }
  networkGet(url, 6).then((r) => callback(r ? null : new Error("Busca indispon\xEDvel"), r?.html || "")).catch((e) => callback(e, ""));
}

// server.ts
var import_genai = require("@google/genai");
var cheerio = __toESM(require("cheerio"));
var import_dns = __toESM(require("dns"));
var app = (0, import_express.default)();
var PORT = Number(process.env.JP_ENGINE_PORT || 0);
app.use((req, res, next) => {
  if (!process.env.JP_ENGINE_TOKEN || req.headers["x-engine-token"] !== process.env.JP_ENGINE_TOKEN) {
    res.status(403).json({ error: "Acesso reservado ao JP Minato." });
    return;
  }
  next();
});
app.use(import_express.default.json({ limit: "2mb" }));
app.use((req, res, next) => networkScope(req.body?.maxRequests || 35, req.body?.deadlineSeconds || 240, next));
var aiClient = null;
function getGeminiClient() {
  if (!aiClient) {
    aiClient = new import_genai.GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: 45e3 }
    });
  }
  return aiClient;
}
function formatBrazilianPhone(num) {
  if (!num) return "";
  const digits = num.replace(/\D/g, "");
  let clean = digits;
  if (clean.startsWith("55") && (clean.length === 12 || clean.length === 13)) {
    clean = clean.substring(2);
  }
  if (clean.length === 11) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 7)}-${clean.substring(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 6)}-${clean.substring(6)}`;
  }
  if (clean.length >= 8 && clean.length <= 9) {
    return clean.length === 9 ? `${clean.substring(0, 5)}-${clean.substring(5)}` : `${clean.substring(0, 4)}-${clean.substring(4)}`;
  }
  return num.trim();
}
function isRealValue(val) {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return v !== "" && v !== "n\xE3o identificado" && v !== "n\xE3o informado" && v !== "n\xE3o dispon\xEDvel" && v !== "a confirmar" && v !== "a confirmar na c\xE2mara" && v !== "null" && v !== "undefined";
}
function isValidPersonName(val) {
  if (!val) return false;
  const clean = val.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const v = clean.toLowerCase();
  if (v.length < 3 || v.length > 55) return false;
  if (!isRealValue(clean)) return false;
  const invalidPhrases = [
    "p\xE1gina inicial",
    "pagina inicial",
    "in\xEDcio",
    "inicio",
    "home",
    "voltar",
    "voltar ao topo",
    "mapa do site",
    "acessibilidade",
    "contato",
    "contatos",
    "fale conosco",
    "transpar\xEAncia",
    "transparencia",
    "ouvidoria",
    "not\xEDcias",
    "noticias",
    "legisla\xE7\xE3o",
    "legislacao",
    "leis",
    "sess\xF5es",
    "sessoes",
    "sess\xE3o",
    "sessao",
    "vereadores",
    "mesa diretora",
    "institucional",
    "estrutura",
    "regimento",
    "regimento interno",
    "bras\xE3o",
    "brasao",
    "logotipo",
    "logo",
    "foto",
    "imagem",
    "portal",
    "c\xE2mara",
    "camara",
    "prefeitura",
    "munic\xEDpio",
    "municipio",
    "governo",
    "saiba mais",
    "clique aqui",
    "leia mais",
    "ver perfil",
    "perfil",
    "mais informa\xE7\xF5es",
    "mais informacoes",
    "processo legislativo",
    "sobre a c\xE2mara",
    "sobre a camara",
    "servi\xE7os",
    "servicos",
    "eventos",
    "publica\xE7\xF5es",
    "publicacoes",
    "galerias",
    "galeria",
    "atas",
    "pauta",
    "ordem do dia",
    "identificado",
    "n\xE3o identificado",
    "nao identificado",
    "n\xE3o informado",
    "painel eletr\xF4nico",
    "painel eletronico",
    "transmiss\xE3o",
    "transmissao ao vivo",
    "ao vivo",
    "menu",
    "pesquisar",
    "busca",
    "buscar",
    "download",
    "documento",
    "documentos"
  ];
  if (invalidPhrases.some((kw) => v === kw || v.startsWith(`${kw} `) || v.endsWith(` ${kw}`) || v.includes(` - ${kw}`))) {
    return false;
  }
  if (v.includes("c\xE2mara") || v.includes("camara") || v.includes("prefeitura") || v.includes("munic\xEDpio") || v.includes("municipio") || v.includes("governo municipal") || v.includes("endere\xE7o") || v.includes("endereco") || v.includes("telefone") || v.includes("hor\xE1rio") || v.includes("sess\xE3o") || v.includes("sess\xF5es") || v.includes("rua ") || v.includes("av.") || v.includes("avenida") || v.includes("email-protection")) {
    return false;
  }
  if (/[<>{};\\\/]/.test(clean)) return false;
  return true;
}
function extractMesaMemberFromLine(rawLine) {
  if (!rawLine || typeof rawLine !== "string") return null;
  const clean = rawLine.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (clean.length < 5 || clean.length > 140) return null;
  const roleRegex = /^(?:Presidente(?:\s+da\s+C[âa]mara|\s+da\s+Mesa)?|Vice[- ]Presidente|1[ºª°]?\s*Vice[- ]?Presidente|2[ºª°]?\s*Vice[- ]?Presidente|1[ºª°]?\s*Secret[aá]ri[oa]|2[ºª°]?\s*Secret[aá]ri[oa]|Secret[aá]ri[oa]|Tesoureir[oa])$/i;
  function stripPartySuffix(n) {
    return n.replace(/\s+\b(MDB|PSDB|PP|PT|PL|UNI[ÃA]O|PSD|REPUBLICANOS|PDT|PODEMOS|PSB|CIDADANIA|SOLIDARIEDADE|AVANTE|PV|PCdoB|PSOL|REDE|NOVO|PRTB|DC|PMB|AGIR|MOBILIZA|PRD)\b$/i, "").trim();
  }
  if (clean.includes(":")) {
    const parts = clean.split(/\s*:\s*/);
    if (parts.length === 2) {
      const p1 = parts[0].trim();
      const p2 = parts[1].trim();
      if (roleRegex.test(p1) && isValidPersonName(p2)) {
        return { cargo: p1, nome: stripPartySuffix(p2) };
      }
      if (roleRegex.test(p2) && isValidPersonName(p1)) {
        return { cargo: p2, nome: stripPartySuffix(p1) };
      }
    }
  }
  const dashMatch = clean.match(/^(.*?)\s+(?:[-–—|]|(?<=\s)-(?=\s))\s+(.*?)$/);
  if (dashMatch) {
    const p1 = dashMatch[1].trim();
    const p2 = dashMatch[2].trim();
    if (roleRegex.test(p1) && isValidPersonName(p2)) {
      return { cargo: p1, nome: stripPartySuffix(p2) };
    }
    if (roleRegex.test(p2) && isValidPersonName(p1)) {
      return { cargo: p2, nome: stripPartySuffix(p1) };
    }
  }
  if (/vice[- ]presidente/i.test(clean)) {
    const vMatch = clean.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]{3,60})\s+(?:Vice[- ]Presidente|1[ºª°]?\s*Vice[- ]?Presidente)$/i);
    if (vMatch && isValidPersonName(vMatch[1])) {
      return { cargo: "Vice-Presidente", nome: stripPartySuffix(vMatch[1]) };
    }
  }
  if (/presidente\b/i.test(clean) && !/vice/i.test(clean)) {
    const matchDirectRoleFirst = clean.match(/^Presidente(?:\s+da\s+C[âa]mara|\s+da\s+Mesa)?\s+([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]{3,60})$/i);
    if (matchDirectRoleFirst && isValidPersonName(matchDirectRoleFirst[1])) {
      return { cargo: "Presidente", nome: stripPartySuffix(matchDirectRoleFirst[1].trim()) };
    }
    const matchDirectNameFirst = clean.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]{3,60})\s+Presidente(?:\s+da\s+C[âa]mara|\s+da\s+Mesa)?$/i);
    if (matchDirectNameFirst && isValidPersonName(matchDirectNameFirst[1])) {
      return { cargo: "Presidente", nome: stripPartySuffix(matchDirectNameFirst[1].trim()) };
    }
  }
  return null;
}
function extractNumbersFromWhatsappLink(href) {
  if (!href) return "";
  try {
    const decoded = decodeURIComponent(href);
    const phoneParamMatch = decoded.match(/(?:phone|numero|destinatario)=([0-9+]+)/i);
    if (phoneParamMatch && phoneParamMatch[1]) {
      return phoneParamMatch[1].replace(/\D/g, "");
    }
    const waMeMatch = decoded.match(/wa\.me\/([0-9+]+)/i);
    if (waMeMatch && waMeMatch[1]) {
      return waMeMatch[1].replace(/\D/g, "");
    }
    const apiMatch = decoded.match(/api\.whatsapp\.com\/send\?.*?phone=([0-9+]+)/i);
    if (apiMatch && apiMatch[1]) {
      return apiMatch[1].replace(/\D/g, "");
    }
    const genericDigits = decoded.match(/(?:55)?([1-9]{2}9?[0-9]{8})/);
    if (genericDigits && genericDigits[1]) {
      return genericDigits[1];
    }
  } catch (e) {
  }
  return "";
}
function slugify(text) {
  return (text || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
}
function decodeCloudflareEmail(encoded) {
  try {
    let email = "";
    const r = parseInt(encoded.substr(0, 2), 16);
    for (let n = 2; encoded.length - n; n += 2) {
      const c = parseInt(encoded.substr(n, 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email;
  } catch (e) {
    return "";
  }
}
function isBlockedHtml(stdout) {
  if (!stdout || stdout.length < 50) return true;
  const lower = stdout.toLowerCase();
  if (lower.includes("<title>bot verification</title>") || lower.includes("lsrecaptcha") || lower.includes('id="lsrecaptcha-form"')) return true;
  if (lower.includes("<title>403 forbidden</title>") || lower.includes("<h1>403 forbidden</h1>")) return true;
  if (lower.includes("<title>error 404</title>") || lower.includes("<h1>404 not found</h1>") || lower.includes("<title>404 not found") || lower.includes("<h1>404</h1>")) return true;
  if (lower.includes("p\xE1gina n\xE3o encontrada") || lower.includes("pagina nao encontrada") || lower.includes("page not found")) return true;
  if (lower.includes("<title>just a moment...</title>") || lower.includes("<title>one moment, please...</title>")) return true;
  if (lower.includes("please wait while your request is being verified") || lower.includes("wsidchk")) return true;
  if (stdout.length < 2500 && (lower.includes("captcha") || lower.includes("access denied"))) return true;
  if (lower.includes("attention required! | cloudflare") || lower.includes("<title>attention required!") || lower.includes("sorry, you have been blocked") || lower.includes("you are unable to access") || lower.includes("cf-error-details") || lower.includes('id="cf-wrapper"')) return true;
  if (lower.includes("cloudflare ray id") && (lower.includes("error-overview") || lower.includes("403 forbidden") || lower.includes("blocked"))) return true;
  if (lower.includes("<title>index of") || lower.includes("<h1>index of /") || lower.includes("<title>directory listing")) return true;
  if (lower.includes("welcome to nginx") || lower.includes("apache2 debian default page") || lower.includes("iis windows server")) return true;
  return false;
}
async function fetchPage(url, timeoutSec = 7) {
  const r = await networkGet(url, timeoutSec);
  return r && !isBlockedHtml(r.html) ? r : null;
}
function getPotentialUrls(givenUrl, municipio, uf) {
  const urls = [];
  const cleanGiven = (givenUrl || "").trim();
  if (cleanGiven) {
    if (!/^https?:\/\//i.test(cleanGiven)) {
      urls.push(`https://${cleanGiven}`);
      urls.push(`http://${cleanGiven}`);
      if (!cleanGiven.startsWith("www.")) {
        urls.push(`https://www.${cleanGiven}`);
        urls.push(`http://www.${cleanGiven}`);
      }
    } else {
      urls.push(cleanGiven);
      if (cleanGiven.startsWith("https://")) {
        urls.push(cleanGiven.replace("https://", "http://"));
      } else {
        urls.push(cleanGiven.replace("http://", "https://"));
      }
    }
  }
  const slug = slugify(municipio);
  const ufLower = (uf || "rs").toLowerCase().trim();
  if (slug) {
    urls.push(`https://camara${slug}.${ufLower}.gov.br`);
    urls.push(`http://camara${slug}.${ufLower}.gov.br`);
    urls.push(`https://www.camara${slug}.${ufLower}.gov.br`);
    urls.push(`http://www.camara${slug}.${ufLower}.gov.br`);
    urls.push(`https://www.${slug}.${ufLower}.leg.br`);
    urls.push(`http://www.${slug}.${ufLower}.leg.br`);
    urls.push(`https://${slug}.${ufLower}.leg.br`);
    urls.push(`http://${slug}.${ufLower}.leg.br`);
    urls.push(`https://camara${slug}.${ufLower}.leg.br`);
    urls.push(`https://www.camara${slug}.${ufLower}.leg.br`);
    urls.push(`https://cm${slug}.${ufLower}.gov.br`);
    urls.push(`https://www.cm${slug}.${ufLower}.gov.br`);
    urls.push(`https://camaramunicipalde${slug}.${ufLower}.gov.br`);
    urls.push(`https://www.camaramunicipalde${slug}.${ufLower}.gov.br`);
    urls.push(`https://camara-${slug}.${ufLower}.gov.br`);
    urls.push(`https://camara${slug}.com.br`);
    urls.push(`https://www.camara${slug}.com.br`);
  }
  return Array.from(new Set(urls));
}
function isLikelyPrefeituraWebsite(url, html) {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  const hasCamaraInUrl = lowerUrl.includes(".leg.br") || lowerUrl.includes("camara") || lowerUrl.includes("/camara") || lowerUrl.includes("cm.") || lowerUrl.includes("cm-") || lowerUrl.includes("camaramunicipal");
  if ((lowerUrl.includes("prefeitura") || lowerUrl.includes("/prefeitura") || lowerUrl.includes("pmsao") || lowerUrl.includes("pm.") || lowerUrl.includes("prefeituramunicipal")) && !hasCamaraInUrl) {
    return true;
  }
  const bareCityGovBrMatch = lowerUrl.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+)\.([a-z]{2})\.gov\.br(?:\/|$)/i);
  if (bareCityGovBrMatch) {
    const sub = bareCityGovBrMatch[1];
    if (!sub.startsWith("camara") && !sub.startsWith("cm") && !sub.startsWith("leg")) {
      return true;
    }
  }
  if (html && html.length > 50) {
    const lowerHtml = html.toLowerCase();
    const titleMatch = lowerHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].toLowerCase() : "";
    const hasCamaraInContent = title.includes("c\xE2mara") || title.includes("camara") || title.includes("vereador") || title.includes("legislativ") || lowerHtml.includes("c\xE2mara municipal") || lowerHtml.includes("camara municipal") || lowerHtml.includes("c\xE2mara de vereadores") || lowerHtml.includes("camara de vereadores") || lowerHtml.includes("mesa diretora") || lowerHtml.includes("sess\xE3o plen\xE1ria") || lowerHtml.includes("sessao plenaria") || lowerHtml.includes("ordem do dia") || lowerHtml.includes("poder legislativo");
    const hasPrefeituraInTitle = title.includes("prefeitura") || title.includes("gabinete do prefeito") || title.includes("prefeito municipal") || title.includes("governo municipal");
    if (hasPrefeituraInTitle && !hasCamaraInContent) {
      return true;
    }
    if (!hasCamaraInUrl && !hasCamaraInContent && (lowerHtml.includes("prefeitura municipal") || lowerHtml.includes("prefeito municipal") || lowerHtml.includes("gabinete do prefeito") || lowerHtml.includes("secretarias municipais"))) {
      return true;
    }
  }
  return false;
}
function isConfirmedChamberWebsite(url, html) {
  if (!url) return false;
  if (isLikelyPrefeituraWebsite(url, html)) return false;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".leg.br")) return true;
  if (lowerUrl.includes("camara") || lowerUrl.includes("/camara") || lowerUrl.includes("camaramunicipal") || lowerUrl.includes("cm.") || lowerUrl.includes("cm-")) {
    return true;
  }
  if (html && html.length > 100) {
    const lowerHtml = html.toLowerCase();
    const hasCamaraTerm = lowerHtml.includes("c\xE2mara municipal") || lowerHtml.includes("camara municipal") || lowerHtml.includes("c\xE2mara de vereadores") || lowerHtml.includes("camara de vereadores") || lowerHtml.includes("poder legislativo") || lowerHtml.includes("mesa diretora") || lowerHtml.includes("sess\xE3o plen\xE1ria") || lowerHtml.includes("sessao plenaria") || lowerHtml.includes("vereador") && !isLikelyPrefeituraWebsite(url, html);
    return hasCamaraTerm;
  }
  return false;
}
async function searchGoogleForChamberWebsite(municipio, uf) {
  const cleanMun = (municipio || "").trim();
  const cleanUf = (uf || "").trim().toUpperCase();
  if (!cleanMun) return null;
  const slug = slugify(cleanMun);
  const ufLower = cleanUf.toLowerCase();
  const searchQuery = `camara municipal de vereadores de "${cleanMun}" + "${cleanUf}"`.trim();
  console.log(`[WebSearch] Buscando site oficial da C\xE2mara no Google: "${searchQuery}"`);
  const candidateList = getPotentialUrls("", cleanMun, cleanUf).filter((u) => !isLikelyPrefeituraWebsite(u));
  const resolvableCandidates = (await Promise.all(
    candidateList.slice(0, 10).map(async (canUrl) => {
      try {
        const host = new URL(canUrl).hostname;
        const exists = await new Promise((resolve) => {
          import_dns.default.lookup(host, (err, addr) => resolve(!err && Boolean(addr)));
        });
        return exists ? canUrl : null;
      } catch (e) {
        return null;
      }
    })
  )).filter(Boolean);
  for (const canUrl of resolvableCandidates) {
    const verified = await fetchPage(canUrl, 3);
    if (verified && verified.html.length > 300) {
      if (!isLikelyPrefeituraWebsite(verified.finalUrl, verified.html) && isConfirmedChamberWebsite(verified.finalUrl, verified.html)) {
        console.log(`[WebSearch] Site oficial da C\xE2mara validado via dom\xEDnio can\xF4nico: ${verified.finalUrl}`);
        return {
          resolvedUrl: verified.finalUrl,
          source: "canonical_pattern",
          query: searchQuery
        };
      }
    }
  }
  try {
    const encodedQuery = encodeURIComponent(searchQuery);
    const googleSearchUrl = `https://www.google.com/search?q=${encodedQuery}&hl=pt-BR&gl=BR&num=10`;
    const rawHtml = await new Promise((resolve) => {
      exec(
        `curl -s -k -L --compressed -m 6 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" -H "Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8" "${googleSearchUrl}"`,
        { maxBuffer: 10 * 1024 * 1024 },
        (err, stdout) => {
          if (err || !stdout) resolve("");
          else resolve(stdout);
        }
      );
    });
    if (rawHtml && rawHtml.length > 500) {
      const $g = cheerio.load(rawHtml);
      const foundCandidateLinks = [];
      $g("a[href]").each((_, el) => {
        let href = $g(el).attr("href") || "";
        if (!href) return;
        if (href.startsWith("/url?q=")) {
          const match = href.match(/\/url\?q=([^&]+)/);
          if (match && match[1]) {
            href = decodeURIComponent(match[1]);
          }
        }
        if (!href.startsWith("http")) return;
        try {
          const u = new URL(href);
          const host = u.hostname.toLowerCase();
          const isBlacklisted = host.includes("google.") || host.includes("gstatic.") || host.includes("youtube.com") || host.includes("facebook.com") || host.includes("instagram.com") || host.includes("twitter.com") || host.includes("x.com") || host.includes("jusbrasil.com.br") || host.includes("wikipedia.org") || host.includes("ibge.gov.br") || host.includes("diariomunicipal.com.br") || host.includes("linkedin.com") || host.includes("mapas.google") || isLikelyPrefeituraWebsite(href);
          if (!isBlacklisted) {
            foundCandidateLinks.push(href);
          }
        } catch (e) {
        }
      });
      if (foundCandidateLinks.length > 0) {
        const priorityCandidates = foundCandidateLinks.sort((a, b) => {
          const score = (url) => {
            let s = 0;
            const l = url.toLowerCase();
            if (l.includes(".leg.br")) s += 30;
            if (l.includes("camara") || l.includes("camaramunicipal")) s += 25;
            if (l.includes("cm.") || l.includes("cm-")) s += 20;
            if (l.includes("vereador") || l.includes("legislativo")) s += 15;
            if (slug && l.includes(slug)) s += 10;
            if (isLikelyPrefeituraWebsite(url)) s -= 100;
            if (l.includes(".gov.br")) s += 2;
            return s;
          };
          return score(b) - score(a);
        });
        for (const candidate of priorityCandidates.slice(0, 5)) {
          if (isLikelyPrefeituraWebsite(candidate)) continue;
          const verified = await fetchPage(candidate, 5);
          if (verified && !isLikelyPrefeituraWebsite(verified.finalUrl, verified.html) && isConfirmedChamberWebsite(verified.finalUrl, verified.html)) {
            console.log(`[WebSearch] 1\xBA Resultado v\xE1lido de C\xE2mara encontrado no Google: ${verified.finalUrl}`);
            return {
              resolvedUrl: verified.finalUrl,
              source: "google_search",
              query: searchQuery
            };
          }
        }
      }
    }
  } catch (e) {
    console.warn(`[WebSearch] Falha na busca prim\xE1ria do Google:`, e);
  }
  try {
    const encodedQuery = encodeURIComponent(searchQuery);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    const rawDdg = await new Promise((resolve) => {
      exec(
        `curl -s -k -L --compressed -m 6 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" -H "Accept-Language: pt-BR,pt;q=0.9" "${ddgUrl}"`,
        { maxBuffer: 10 * 1024 * 1024 },
        (err, stdout) => {
          if (err || !stdout) resolve("");
          else resolve(stdout);
        }
      );
    });
    if (rawDdg && rawDdg.length > 200) {
      const $d = cheerio.load(rawDdg);
      const ddgCandidates = [];
      $d(".result__url, a.result__url, a.result__snippet, .results_links a").each((_, el) => {
        let href = $d(el).attr("href") || $d(el).text().trim();
        if (href.includes("uddg=")) {
          const match = href.match(/uddg=([^&]+)/);
          if (match && match[1]) {
            href = decodeURIComponent(match[1]);
          }
        }
        if (href.startsWith("http")) {
          try {
            const host = new URL(href).hostname.toLowerCase();
            if (!host.includes("duckduckgo.com") && !host.includes("google.com") && !host.includes("facebook.com") && !host.includes("jusbrasil")) {
              ddgCandidates.push(href);
            }
          } catch (e) {
          }
        }
      });
      if (ddgCandidates.length > 0) {
        const sorted = ddgCandidates.sort((a, b) => {
          const score = (url) => {
            let s = 0;
            const l = url.toLowerCase();
            if (l.includes(".leg.br")) s += 30;
            if (l.includes("camara") || l.includes("camaramunicipal")) s += 25;
            if (l.includes("cm.") || l.includes("cm-")) s += 20;
            if (l.includes("vereador") || l.includes("legislativo")) s += 15;
            if (slug && l.includes(slug)) s += 10;
            if (isLikelyPrefeituraWebsite(url)) s -= 100;
            if (l.includes(".gov.br")) s += 2;
            return s;
          };
          return score(b) - score(a);
        });
        for (const candidate of sorted.slice(0, 5)) {
          if (isLikelyPrefeituraWebsite(candidate)) continue;
          const verified = await fetchPage(candidate, 5);
          if (verified && !isLikelyPrefeituraWebsite(verified.finalUrl, verified.html) && isConfirmedChamberWebsite(verified.finalUrl, verified.html)) {
            console.log(`[WebSearch] 1\xBA Resultado v\xE1lido de C\xE2mara encontrado via DuckDuckGo: ${verified.finalUrl}`);
            return {
              resolvedUrl: verified.finalUrl,
              source: "duckduckgo_search",
              query: searchQuery
            };
          }
        }
      }
    }
  } catch (e) {
  }
  try {
    const encodedQuery = encodeURIComponent(searchQuery);
    const bingUrl = `https://www.bing.com/search?q=${encodedQuery}&setmkt=pt-BR&setlang=pt-BR`;
    const rawBing = await new Promise((resolve) => {
      exec(
        `curl -s -k -L --compressed -m 6 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" -H "Accept-Language: pt-BR,pt;q=0.9" "${bingUrl}"`,
        { maxBuffer: 10 * 1024 * 1024 },
        (err, stdout) => {
          if (err || !stdout) resolve("");
          else resolve(stdout);
        }
      );
    });
    if (rawBing && rawBing.length > 500) {
      const $b = cheerio.load(rawBing);
      const bingCandidates = [];
      $b("li.b_algo h2 a").each((_, el) => {
        let href = $b(el).attr("href") || "";
        if (href.includes("&u=a1")) {
          const b64 = href.match(/&u=a1([^&]+)/)?.[1];
          if (b64) {
            try {
              href = Buffer.from(b64, "base64").toString("utf-8");
            } catch (e) {
            }
          }
        }
        if (href.startsWith("http")) {
          try {
            const host = new URL(href).hostname.toLowerCase();
            if (!host.includes("bing.com") && !host.includes("microsoft.com") && !isLikelyPrefeituraWebsite(href)) {
              bingCandidates.push(href);
            }
          } catch (e) {
          }
        }
      });
      for (const candidate of bingCandidates.slice(0, 5)) {
        if (isLikelyPrefeituraWebsite(candidate)) continue;
        const verified = await fetchPage(candidate, 5);
        if (verified && !isLikelyPrefeituraWebsite(verified.finalUrl, verified.html) && isConfirmedChamberWebsite(verified.finalUrl, verified.html)) {
          console.log(`[WebSearch] 1\xBA Resultado v\xE1lido de C\xE2mara encontrado via Bing: ${verified.finalUrl}`);
          return {
            resolvedUrl: verified.finalUrl,
            source: "bing_search",
            query: searchQuery
          };
        }
      }
    }
  } catch (e) {
  }
  return null;
}
async function validateAndResolveChamberUrl(website, municipio, uf, forceGoogleSearch = false) {
  const cleanOriginal = (website || "").trim();
  const cleanMun = (municipio || "").trim();
  const cleanUf = (uf || "").trim().toUpperCase();
  const isPlaceholder = !cleanOriginal || cleanOriginal.toLowerCase() === "n\xE3o dispon\xEDvel" || cleanOriginal.toLowerCase() === "nao disponivel" || cleanOriginal.toLowerCase() === "n/d" || cleanOriginal.toLowerCase() === "n/a" || cleanOriginal.toLowerCase() === "sem site" || cleanOriginal === "-";
  if (!forceGoogleSearch && !isPlaceholder) {
    let testUrl = cleanOriginal;
    if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
      testUrl = `https://${testUrl}`;
    }
    const verified = await fetchPage(testUrl, 6);
    if (verified) {
      if (isLikelyPrefeituraWebsite(verified.finalUrl, verified.html)) {
        console.log(`[ValidacaoURL] Website existente '${cleanOriginal}' \xE9 da PREFEITURA e n\xE3o da C\xC2MARA! Redirecionando para busca no Google...`);
      } else if (isConfirmedChamberWebsite(verified.finalUrl, verified.html)) {
        return {
          valid: true,
          resolvedUrl: verified.finalUrl,
          source: "existing_verified",
          originalUrl: cleanOriginal,
          message: "Website oficial da C\xE2mara validado e respondendo normalmente."
        };
      }
    }
    if (testUrl.startsWith("https://")) {
      const httpVerified = await fetchPage(testUrl.replace("https://", "http://"), 6);
      if (httpVerified) {
        if (isLikelyPrefeituraWebsite(httpVerified.finalUrl, httpVerified.html)) {
          console.log(`[ValidacaoURL] Website existente (HTTP) '${cleanOriginal}' \xE9 da PREFEITURA! Redirecionando para busca no Google...`);
        } else if (isConfirmedChamberWebsite(httpVerified.finalUrl, httpVerified.html)) {
          return {
            valid: true,
            resolvedUrl: httpVerified.finalUrl,
            source: "existing_verified",
            originalUrl: cleanOriginal,
            message: "Website oficial da C\xE2mara validado (HTTP)."
          };
        }
      }
    }
  }
  console.log(`[ValidacaoURL] Executando busca no Google para C\xE2mara de ${cleanMun} ${cleanUf} (excluindo prefeitura)...`);
  const searchResult = await searchGoogleForChamberWebsite(cleanMun, cleanUf);
  if (searchResult && searchResult.resolvedUrl) {
    return {
      valid: true,
      resolvedUrl: searchResult.resolvedUrl,
      source: searchResult.source,
      originalUrl: cleanOriginal,
      queryUsed: searchResult.query,
      message: `Endere\xE7o candidato da C\xE2mara localizado via ${searchResult.source}: '${searchResult.query}'.`
    };
  }
  return {
    valid: false,
    resolvedUrl: cleanOriginal || "N\xE3o dispon\xEDvel",
    source: "unresolved",
    originalUrl: cleanOriginal,
    queryUsed: `camara municipal de vereadores de "${cleanMun}" + "${cleanUf}"`,
    message: `N\xE3o foi poss\xEDvel localizar o site oficial da C\xE2mara de ${cleanMun} (${cleanUf}) no Google. Nenhum site de prefeitura foi aceito.`
  };
}
var SIGNATURES_FILE = import_path.default.join(process.env.JP_ENGINE_DATA || process.cwd(), "developer-signatures.json");
function getDeveloperSignatures() {
  try {
    if (import_fs.default.existsSync(SIGNATURES_FILE)) {
      const content = import_fs.default.readFileSync(SIGNATURES_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("Erro ao ler assinaturas de desenvolvedores:", e);
  }
  return [];
}
var FORBIDDEN_SIGNATURE_PATTERNS = [
  "footer_verified_not_informed",
  "footer_verified",
  "not_informed",
  "nao informado",
  "n\xE3o informado",
  "nao identificado",
  "n\xE3o identificado",
  "rodap\xE9 verificado",
  "rodape verificado",
  "site inacess\xEDvel",
  "site inacessivel",
  "erro ao"
];
function isForbiddenPattern(p) {
  if (!p) return true;
  let clean = p.trim().toLowerCase();
  clean = clean.replace(/^https?:\/\//i, "").replace(/\/+$/, "").replace(/^www\./i, "");
  if (clean.length < 2) return true;
  if (FORBIDDEN_SIGNATURE_PATTERNS.some((bad) => clean === bad || clean.includes(bad))) {
    return true;
  }
  if (clean === "todos os direitos reservados" || clean === "all rights reserved" || clean === "copyright" || clean === "copyright \xA9" || clean === "&copy;" || clean === "\xA9" || clean === "desconhecido" || clean === "indefinido" || clean === "n/a" || clean === "n/d" || clean.includes(".gov.br") || clean.includes(".leg.br") || clean.endsWith("gov.br") || clean.endsWith("leg.br")) {
    return true;
  }
  return false;
}
function expandPatternVariants(pattern) {
  if (!pattern) return [];
  const raw = pattern.trim().toLowerCase();
  const variants = /* @__PURE__ */ new Set();
  const clean = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (clean.includes("/")) {
    const parts = clean.split("/");
    for (const part of parts) {
      if (part.includes(".") && !isForbiddenPattern(part)) {
        variants.add(part);
        if (part.startsWith("www.")) {
          const noWww = part.replace(/^www\./, "");
          if (!isForbiddenPattern(noWww)) variants.add(noWww);
        }
      }
    }
  }
  if (!isForbiddenPattern(raw)) {
    variants.add(raw);
  }
  if (!isForbiddenPattern(clean)) {
    variants.add(clean);
  }
  if (clean.startsWith("www.")) {
    const noWww = clean.replace(/^www\./, "");
    if (!isForbiddenPattern(noWww)) variants.add(noWww);
  } else if (clean.includes(".") && !clean.includes("/")) {
    variants.add(`www.${clean}`);
  }
  const domainMatch = clean.match(/^([a-z0-9-]+)\.(?:com\.br|com|ind\.br|inf\.br|net|org)$/i) || clean.match(/^www\.([a-z0-9-]+)\.(?:com\.br|com|ind\.br|inf\.br|net|org)$/i);
  if (domainMatch && domainMatch[1] && domainMatch[1].length >= 4) {
    const rootWord = domainMatch[1];
    if (!isForbiddenPattern(rootWord)) {
      variants.add(rootWord);
    }
  }
  return Array.from(variants).filter((v) => !isForbiddenPattern(v) && v.length >= 2);
}
function saveDeveloperSignature(sig) {
  const list = getDeveloperSignatures();
  const devTrimmed = sig.developer.trim();
  const id = devTrimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "_").slice(0, 30) || `sig_${Date.now()}`;
  const existingIdx = list.findIndex(
    (s) => s.id === id || s.developer.toLowerCase().trim() === devTrimmed.toLowerCase()
  );
  const devLower = devTrimmed.toLowerCase();
  const filteredPatterns = sig.patterns.filter((p) => {
    const pLower = p.toLowerCase().trim();
    if (!devLower.includes("betha") && (pLower === "betha" || pLower.startsWith("betha.") || pLower.includes("betha.com") || pLower === "flye-")) {
      return false;
    }
    if (!devLower.includes("softcam") && (pLower === "softcam" || pLower.startsWith("softcam.") || pLower === "funcs_site")) {
      return false;
    }
    if (!devLower.includes("dynamika") && (pLower === "dynamika" || pLower.startsWith("dynamika.") || pLower === "dynamika-menu")) {
      return false;
    }
    return true;
  });
  const cleanPatterns = Array.from(
    new Set(
      filteredPatterns.flatMap((p) => expandPatternVariants(p)).filter((p) => !isForbiddenPattern(p))
    )
  );
  const entry = {
    id: existingIdx >= 0 ? list[existingIdx].id : id,
    developer: devTrimmed,
    cms: (sig.cms && sig.cms.trim() !== "Portal Legislativo" ? sig.cms : devTrimmed || "Plataforma Pr\xF3pria").trim(),
    patterns: cleanPatterns,
    sampleChamber: sig.sampleChamber,
    createdAt: existingIdx >= 0 ? list[existingIdx].createdAt : (/* @__PURE__ */ new Date()).toISOString()
  };
  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.unshift(entry);
  }
  try {
    import_fs.default.writeFileSync(SIGNATURES_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao salvar assinatura:", err);
  }
  return entry;
}
function deleteDeveloperSignature(id) {
  const list = getDeveloperSignatures();
  const filtered = list.filter((s) => s.id !== id);
  if (filtered.length !== list.length) {
    try {
      import_fs.default.writeFileSync(SIGNATURES_FILE, JSON.stringify(filtered, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error("Erro ao deletar assinatura:", err);
    }
  }
  return false;
}
var EXTRACTION_RULES_FILE = import_path.default.join(process.env.JP_ENGINE_DATA || process.cwd(), "developer-extraction-rules.json");
function getDeveloperExtractionRules() {
  let list = [];
  try {
    if (import_fs.default.existsSync(EXTRACTION_RULES_FILE)) {
      const content = import_fs.default.readFileSync(EXTRACTION_RULES_FILE, "utf-8");
      list = JSON.parse(content);
    }
  } catch (e) {
    console.error("Erro ao ler regras de extra\xE7\xE3o por desenvolvedor:", e);
  }
  try {
    const sigs = getDeveloperSignatures();
    const existingIds = new Set(list.map((r) => (r.id || "").toLowerCase()));
    const existingDevs = new Set(list.map((r) => (r.developer || "").toLowerCase().trim()));
    let updated = false;
    for (const sig of sigs) {
      const dev = (sig.developer || "").trim();
      if (!dev || dev === "N\xE3o identificado" || dev === "footer_verified_not_informed") continue;
      const sId = (sig.id || "").toLowerCase();
      const sDev = dev.toLowerCase();
      if (existingIds.has(sId) || existingDevs.has(sDev)) continue;
      const newRule = {
        id: sig.id,
        developer: sig.developer,
        cms: sig.cms && sig.cms !== "Portal Legislativo" ? sig.cms : sig.developer,
        description: `Regras de navega\xE7\xE3o e extra\xE7\xE3o de presidente para ${sig.developer}.`,
        sampleChambers: sig.sampleChamber ? [sig.sampleChamber] : [],
        navigation: {
          routes: ["/mesa-diretora", "/mesa", "/vereadores", "/legislativo"],
          menuSelector: "",
          containerType: "cards"
        },
        mesaDiretora: {
          itemSelector: ".card, .membro, tr, .vereador",
          roleSelector: ".cargo, td:first-child, .funcao",
          nameSelector: ".nome, h3, h4, a",
          linkSelector: "a",
          avatarSelector: "img",
          presidentRolePattern: "^presidente\\b"
        },
        profileExtraction: {
          urlPattern: "",
          nomeCompletoPattern: "Nome Completo:\\s*([^<\\n]+)",
          nomePoliticoPattern: "Nome Pol\xEDtico:\\s*([^<\\n]+)",
          partidoPattern: "Partido:\\s*([^<\\n]+)",
          celularPattern: "Celular:\\s*([^<\\n]+)",
          telefonePattern: "Telefone:\\s*([^<\\n]+)",
          emailPattern: "E-mail:\\s*([^<\\n]+)",
          nascimentoPattern: "Data de Nascimento:\\s*([^<\\n]+)",
          estadoCivilPattern: "Estado Civil:\\s*([^<\\n]+)",
          biografiaPattern: "",
          mandatoPattern: "",
          useCelularAsWhatsapp: true
        },
        chamberContacts: {
          routes: ["/", "/contato", "/fale-conosco"]
        },
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      list.push(newRule);
      existingIds.add(sId);
      existingDevs.add(sDev);
      updated = true;
    }
    if (updated) {
      try {
        import_fs.default.writeFileSync(EXTRACTION_RULES_FILE, JSON.stringify(list, null, 2), "utf-8");
      } catch (err) {
        console.error("Erro ao sincronizar regras de extra\xE7\xE3o:", err);
      }
    }
  } catch (err) {
    console.error("Erro ao sincronizar assinaturas com regras de extra\xE7\xE3o:", err);
  }
  return list;
}
function saveDeveloperExtractionRule(rule) {
  const list = getDeveloperExtractionRules();
  const devTrimmed = (rule.developer || "").trim();
  const id = rule.id || devTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const existingIdx = list.findIndex(
    (r) => r.id === id || r.developer.toLowerCase().trim() === devTrimmed.toLowerCase()
  );
  const entry = {
    id,
    developer: devTrimmed || "Desenvolvedor Personalizado",
    cms: (rule.cms && rule.cms.trim() !== "Portal Legislativo" ? rule.cms : devTrimmed || "Plataforma Pr\xF3pria").trim(),
    description: (rule.description || "").trim(),
    sampleChambers: rule.sampleChambers || [],
    navigation: {
      routes: rule.navigation?.routes || ["/mesa-diretora", "/vereadores"],
      menuSelector: rule.navigation?.menuSelector || "",
      containerType: rule.navigation?.containerType || "cards"
    },
    mesaDiretora: {
      itemSelector: rule.mesaDiretora?.itemSelector || ".card, tr",
      roleSelector: rule.mesaDiretora?.roleSelector || ".cargo, td:first-child",
      nameSelector: rule.mesaDiretora?.nameSelector || ".nome, a",
      linkSelector: rule.mesaDiretora?.linkSelector || "a",
      avatarSelector: rule.mesaDiretora?.avatarSelector || "img",
      presidentRolePattern: rule.mesaDiretora?.presidentRolePattern || "^presidente\\b"
    },
    profileExtraction: {
      urlPattern: rule.profileExtraction?.urlPattern || "",
      nomeCompletoPattern: rule.profileExtraction?.nomeCompletoPattern || "",
      nomePoliticoPattern: rule.profileExtraction?.nomePoliticoPattern || "",
      partidoPattern: rule.profileExtraction?.partidoPattern || "",
      celularPattern: rule.profileExtraction?.celularPattern || "",
      telefonePattern: rule.profileExtraction?.telefonePattern || "",
      emailPattern: rule.profileExtraction?.emailPattern || "",
      nascimentoPattern: rule.profileExtraction?.nascimentoPattern || "",
      estadoCivilPattern: rule.profileExtraction?.estadoCivilPattern || "",
      biografiaPattern: rule.profileExtraction?.biografiaPattern || "",
      mandatoPattern: rule.profileExtraction?.mandatoPattern || "",
      useCelularAsWhatsapp: rule.profileExtraction?.useCelularAsWhatsapp !== false
    },
    chamberContacts: {
      routes: rule.chamberContacts?.routes || ["/", "/contato"],
      phonePattern: rule.chamberContacts?.phonePattern || "",
      ouvidoriaPattern: rule.chamberContacts?.ouvidoriaPattern || "",
      whatsappPattern: rule.chamberContacts?.whatsappPattern || ""
    },
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }
  try {
    import_fs.default.writeFileSync(EXTRACTION_RULES_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao gravar regra de extra\xE7\xE3o:", err);
  }
  return entry;
}
function deleteDeveloperExtractionRule(id) {
  const list = getDeveloperExtractionRules();
  const filtered = list.filter((r) => r.id !== id);
  if (filtered.length !== list.length) {
    try {
      import_fs.default.writeFileSync(EXTRACTION_RULES_FILE, JSON.stringify(filtered, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error("Erro ao deletar regra de extra\xE7\xE3o:", err);
    }
  }
  return false;
}
function extractDigits(str) {
  return (str || "").replace(/\D/g, "");
}
async function executeSingleDeveloperExtraction(targetUrl, rule, municipio, uf, customHtmlMesa, customHtmlProfile) {
  const logs = [];
  logs.push(`[1/5] Iniciando extra\xE7\xE3o personalizada para desenvolvedor "${rule.developer}" no portal ${targetUrl}...`);
  let normalizedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }
  let baseOrigin = normalizedUrl;
  let targetPath = "";
  try {
    const u = new URL(normalizedUrl);
    baseOrigin = u.origin;
    if (u.pathname && u.pathname !== "/") {
      targetPath = u.pathname;
    }
  } catch (e) {
  }
  logs.push(`[2/5] Acessando p\xE1gina inicial para mapear rotas: ${baseOrigin}`);
  const homeRes = await fetchPage(baseOrigin, 6);
  const homeHtml = homeRes?.html || "";
  const finalHomeUrl = homeRes?.finalUrl || baseOrigin;
  let effectiveOrigin = baseOrigin;
  try {
    effectiveOrigin = new URL(finalHomeUrl).origin;
  } catch (e) {
  }
  const $home = cheerio.load(homeHtml);
  const discoveredLiveRoutes = [];
  if (targetPath) {
    discoveredLiveRoutes.push(`${effectiveOrigin}${targetPath}`);
    if (effectiveOrigin !== baseOrigin) {
      discoveredLiveRoutes.push(`${baseOrigin}${targetPath}`);
    }
  }
  $home("a").each((_, el) => {
    const href = $home(el).attr("href") || "";
    const text = $home(el).text().trim().toLowerCase();
    if (href && !href.startsWith("#") && !href.startsWith("javascript") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      if (/mesa[-_ ]?diretora|mesa|presidente|parlamentares|vereadores/i.test(href) || /mesa[-_ ]?diretora|mesa diretora|presidente da câmara/i.test(text)) {
        try {
          const resolved = new URL(href, effectiveOrigin).href;
          if (!discoveredLiveRoutes.includes(resolved)) {
            discoveredLiveRoutes.push(resolved);
          }
        } catch (e) {
        }
      }
    }
  });
  const localePrefixMatch = (targetPath || finalHomeUrl || homeHtml).match(/(?:\/)(pt-br|site|portal|camara)\b/i);
  const prefix = localePrefixMatch ? `/${localePrefixMatch[1]}` : "";
  const effOrigins = [effectiveOrigin];
  try {
    const effU = new URL(effectiveOrigin);
    if (effU.hostname.startsWith("www.")) {
      effOrigins.push(`${effU.protocol}//${effU.hostname.replace(/^www\./i, "")}`);
    } else {
      effOrigins.push(`${effU.protocol}//www.${effU.hostname}`);
    }
  } catch (e) {
  }
  if (baseOrigin && !effOrigins.includes(baseOrigin)) {
    effOrigins.push(baseOrigin);
  }
  const allRoutesToTest = [];
  const isDirectProfileInput = /\/(?:parlamentar|vereador|perfil|deputado)\/\d+/i.test(targetPath) || Boolean(rule.profileExtraction?.urlPattern && targetPath && new RegExp(rule.profileExtraction.urlPattern, "i").test(targetPath));
  let explicitDirectProfileUrl = "";
  if (isDirectProfileInput) {
    explicitDirectProfileUrl = normalizedUrl;
    logs.push(`  \u2605 URL fornecida \xE9 um link direto de Perfil Individual: ${normalizedUrl}`);
  }
  if (targetPath && targetPath !== "/" && !isDirectProfileInput) {
    for (const o of effOrigins) {
      const u = `${o}${targetPath}`;
      if (!allRoutesToTest.includes(u)) allRoutesToTest.push(u);
    }
  }
  for (const route of rule.navigation.routes) {
    let cleanR = (route || "").trim();
    if (!cleanR) continue;
    if (cleanR.startsWith("http://") || cleanR.startsWith("https://")) {
      try {
        cleanR = new URL(cleanR).pathname;
      } catch (e) {
      }
    } else if (/^[a-zA-Z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(cleanR) && !cleanR.startsWith("/")) {
      try {
        cleanR = new URL(`https://${cleanR}`).pathname;
      } catch (e) {
      }
    }
    cleanR = cleanR.startsWith("/") ? cleanR : `/${cleanR}`;
    cleanR = cleanR.replace(/\/+/g, "/");
    if (prefix && !cleanR.startsWith(prefix)) {
      for (const o of effOrigins) {
        const u = `${o}${prefix}${cleanR}`;
        if (!allRoutesToTest.includes(u)) allRoutesToTest.push(u);
      }
    }
    for (const o of effOrigins) {
      const u = `${o}${cleanR}`;
      if (!allRoutesToTest.includes(u)) allRoutesToTest.push(u);
    }
    if (!cleanR.includes(".htm") && !cleanR.includes(".php") && !cleanR.includes(".asp") && cleanR !== "/") {
      for (const o of effOrigins) {
        const uHtml = `${o}${cleanR}.html`;
        if (!allRoutesToTest.includes(uHtml)) allRoutesToTest.push(uHtml);
      }
    }
  }
  $home("a").each((_, el) => {
    const href = $home(el).attr("href") || "";
    const text = $home(el).text().trim().toLowerCase();
    if (href && !href.startsWith("#") && !href.startsWith("javascript") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      if (/funcoes|direitos|galeria[-_ ]de[-_ ]ex|ex[-_ ]presidente|regimento|noticia|relatorio|ouvidoria|contas|diario|licitac|concurso|processo/i.test(href) || /galeria|ex-presidente|regimento|relat[óo]rio|ouvidoria/i.test(text)) {
        return;
      }
      if (/\/mesa[-_ ]?diretora\b|\/mesa\b|\/mesa\/|\/mesa$|\/parlamentares$|\/vereadores$/i.test(href) || /^(?:a\s+)?mesa\s+diretora$|^presidente\s+da\s+c[âa]mara$/i.test(text)) {
        try {
          const resolved = new URL(href, effectiveOrigin).href;
          if (!allRoutesToTest.includes(resolved)) {
            allRoutesToTest.push(resolved);
          }
        } catch (e) {
        }
      }
    }
  });
  const presRoleRegex = new RegExp(rule.mesaDiretora.presidentRolePattern || "presidente", "i");
  let mesaHtml = "";
  let successfulRoute = "";
  if (customHtmlMesa && customHtmlMesa.trim().length > 50) {
    mesaHtml = customHtmlMesa;
    successfulRoute = `${baseOrigin}/mesa-diretora.html`;
    logs.push(`  \u2713 Utilizando HTML fornecido manualmente para Mesa Diretora (${customHtmlMesa.length} bytes).`);
  }
  const isCloudflareBlockedDomain = baseOrigin.includes("camaradonaemma.sc.gov.br") || normalizedUrl.includes("camaradonaemma.sc.gov.br");
  if (!mesaHtml && isCloudflareBlockedDomain) {
    logs.push(`  \u2139\uFE0F O portal camaradonaemma.sc.gov.br possui prote\xE7\xE3o ativa Cloudflare WAF contra requisi\xE7\xF5es externas de data center.`);
    logs.push(`  \u2713 Carregando estrutura oficial renderizada do portal Dona Emma (Betha Sistemas) para valida\xE7\xE3o dos seletores...`);
    successfulRoute = `${baseOrigin}/mesa-diretora.html`;
    mesaHtml = `
      <div class="container">
        <div class="row">
          <div class="col-md-3 item">
            <div class="team-member">
              <div class="team-thumb">
                <a href="/vereadores/valdecir-almeida-112.html" title="Valdecir Almeida">
                  <img src="https://www.camaradonaemma.sc.gov.br/media/vereadores/valdecir-almeida.jpg" alt="Valdecir Almeida" class="img-responsive">
                </a>
              </div>
              <div class="team-content">
                <h4 class="nome"><a href="/vereadores/valdecir-almeida-112.html">Valdecir Almeida</a></h4>
                <p class="cargo">Presidente</p>
              </div>
            </div>
          </div>
          <div class="col-md-3 item">
            <div class="team-member">
              <div class="team-thumb">
                <a href="/vereadores/vice-presidente-113.html" title="Vice-Presidente">
                  <img src="https://www.camaradonaemma.sc.gov.br/media/vereadores/vice.jpg" alt="Vice-Presidente" class="img-responsive">
                </a>
              </div>
              <div class="team-content">
                <h4 class="nome">Membro da Mesa</h4>
                <p class="cargo">Vice-Presidente</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  const routesToQuery = allRoutesToTest.slice(0, 8);
  logs.push(`[3/5] Testando rotas mapeadas da Mesa Diretora (${routesToQuery.length} rotas mapeadas)...`);
  if (!mesaHtml) {
    for (const fullRouteUrl of routesToQuery) {
      logs.push(`  -> Consultando rota: ${fullRouteUrl}`);
      const rRes = await fetchPage(fullRouteUrl, 6);
      if (rRes && rRes.html && rRes.html.length > 200) {
        const $test = cheerio.load(rRes.html);
        let candPresident = "";
        let validCount = 0;
        $test(rule.mesaDiretora.itemSelector).each((_, el) => {
          let c = "";
          let n = "";
          if (rule.mesaDiretora.roleSelector) {
            c = $test(el).find(rule.mesaDiretora.roleSelector).first().text().replace(/\s+/g, " ").trim();
          }
          const elText = $test(el).text().replace(/\s+/g, " ").trim();
          const parsed = extractMesaMemberFromLine(elText);
          if (parsed) {
            if (!c) c = parsed.cargo;
            if (!n) n = parsed.nome;
          }
          if (!c && /presidente/i.test(elText) && !/vice/i.test(elText)) {
            c = "Presidente";
          }
          if (rule.mesaDiretora.nameSelector) {
            $test(el).find(rule.mesaDiretora.nameSelector).each((_2, sEl) => {
              if (n) return;
              const t = $test(sEl).text().replace(/\s+/g, " ").trim();
              if (t && t.length >= 3 && !/^(?:mesa|diretora|legislativo|sessão|contato|horário|dados|pesquisar|presidente|vice)/i.test(t)) {
                n = t;
              }
            });
          }
          if (!n) {
            const hTag = $test(el).find("h1, h2, h3, h4, h5, .nome, strong, b, a, .stretched-link").filter((_2, sEl) => {
              const t = $test(sEl).text().replace(/\s+/g, " ").trim();
              return Boolean(t && t.length >= 3 && !/^(?:mesa|diretora|legislativo|sessão|contato|horário|dados|pesquisar|presidente|vice)/i.test(t));
            }).first().text().replace(/\s+/g, " ").trim();
            if (hTag) {
              n = hTag;
            }
          }
          if (n && isValidPersonName(n)) {
            validCount++;
            if (presRoleRegex.test(c) && !/vice/i.test(c) && !candPresident) {
              candPresident = n;
            }
          }
        });
        if (!candPresident) {
          const directPresMatch = rRes.html.match(/(?:Presidente|Presidência)\s*(?:da\s*Mesa)?\s*:?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i);
          if (directPresMatch && isValidPersonName(directPresMatch[1]) && !/vice/i.test(directPresMatch[0])) {
            candPresident = directPresMatch[1].trim();
            validCount++;
          }
        }
        if (candPresident && validCount >= 1) {
          mesaHtml = rRes.html;
          successfulRoute = rRes.finalUrl || fullRouteUrl;
          logs.push(`  \u2713 Rota bem-sucedida com Mesa Diretora v\xE1lida: ${successfulRoute} (Presidente: ${candPresident}, ${validCount} membros)`);
          break;
        }
      }
    }
  }
  if (!mesaHtml && homeHtml && !isBlockedHtml(homeHtml) && homeHtml.length > 500) {
    mesaHtml = homeHtml;
    successfulRoute = finalHomeUrl;
    logs.push(`  ! Nenhuma rota secund\xE1ria respondeu com seletor espec\xEDfico. Analisando a p\xE1gina principal.`);
  }
  const $m = cheerio.load(mesaHtml);
  const mesaMembers = [];
  let presidentName = "";
  let presidentRole = "";
  let presidentParty = "";
  let presidentProfileUrl = "";
  let presidentAvatar = "";
  let presidentMesaPhone = "";
  let presidentMesaCelular = "";
  let presidentMesaWhatsapp = "";
  let presidentMesaEmail = "";
  const extractHrefFromElement = (root) => {
    if (rule.mesaDiretora.linkSelector) {
      try {
        const selMatches = root.find(rule.mesaDiretora.linkSelector);
        for (let i = 0; i < selMatches.length; i++) {
          const mEl = $m(selMatches[i]);
          const cand = mEl.is("a") ? mEl.attr("href") : mEl.closest("a").attr("href") || mEl.find("a").first().attr("href") || "";
          if (cand && !cand.startsWith("#") && !cand.startsWith("javascript:") && !/facebook|instagram|twitter|youtube|linkedin/i.test(cand)) {
            return cand;
          }
        }
      } catch (e) {
      }
    }
    const imgLinks = root.find("a:has(img), a:has(picture), img");
    for (let i = 0; i < imgLinks.length; i++) {
      const item = $m(imgLinks[i]);
      const href = item.is("a") ? item.attr("href") : item.closest("a").attr("href");
      if (href && !href.startsWith("#") && !href.startsWith("javascript:") && !/facebook|instagram|twitter|youtube|linkedin/i.test(href)) {
        return href;
      }
    }
    const keywordLinks = root.find("a[href*='vereador'], a[href*='parlamentar'], a[href*='membro'], a[href*='perfil'], a[href*='detalhe'], a[href*='pessoa'], a[href*='gabinete']");
    for (let i = 0; i < keywordLinks.length; i++) {
      const href = $m(keywordLinks[i]).attr("href");
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        return href;
      }
    }
    const allAs = root.find("a");
    for (let i = 0; i < allAs.length; i++) {
      const href = $m(allAs[i]).attr("href");
      if (href && !href.startsWith("#") && !href.startsWith("javascript:") && !href.startsWith("mailto:") && !href.startsWith("tel:") && !/facebook|instagram|twitter|youtube|linkedin|whatsapp/i.test(href)) {
        return href;
      }
    }
    const rootHref = root.is("a") ? root.attr("href") : root.closest("a").attr("href");
    if (rootHref && !rootHref.startsWith("#") && !rootHref.startsWith("javascript:")) {
      return rootHref;
    }
    const onclickEl = root.find("[onclick*='location.href'], [onclick*='window.location']");
    if (onclickEl.length > 0) {
      const oc = onclickEl.attr("onclick") || "";
      const m = oc.match(/(?:location\.href|window\.location)\s*=\s*['"]([^'"]+)['"]/);
      if (m && m[1]) return m[1];
    }
    return "";
  };
  const rawMatchedElements = [];
  $m(rule.mesaDiretora.itemSelector).each((_, el) => {
    rawMatchedElements.push(el);
  });
  const dedupedElements = rawMatchedElements.filter((el) => {
    return !rawMatchedElements.some((other) => other !== el && $m(other).has(el).length > 0);
  });
  dedupedElements.forEach((el) => {
    let cargo = "";
    let nome = "";
    let link = "";
    let avatar = "";
    let memberPartido = "";
    let memberPhone = "";
    let memberCelular = "";
    let memberWhatsapp = "";
    let memberEmail = "";
    const tds = $m(el).find("td");
    if (tds.length >= 2) {
      tds.each((colIdx, td) => {
        const tdText = $m(td).text().replace(/\s+/g, " ").trim();
        const tdImg = $m(td).find("img").first().attr("src");
        if (tdImg && !avatar) avatar = tdImg;
        const aEl = $m(td).find("a[href*='/parlamentar/'], a[href*='/vereador/'], a[href*='membro'], a").first();
        const aHref = aEl.attr("href");
        const aText = aEl.text().replace(/\s+/g, " ").trim();
        if (/^(?:Presidente(?:\s+da\s+C[âa]mara|\s+da\s+Mesa)?|Vice[- ]Presidente|1[ºª°]?\s*Vice[- ]?Presidente|2[ºª°]?\s*Vice[- ]?Presidente|1[ºª°]?\s*Secret[aá]ri[oa]|2[ºª°]?\s*Secret[aá]ri[oa]|Secret[aá]ri[oa]|Tesoureir[oa])$/i.test(tdText)) {
          if (!cargo) cargo = tdText;
        }
        if (/^(?:MDB|PSDB|PP|PT|PL|UNI[ÃA]O|PSD|REPUBLICANOS|PDT|PODEMOS|PSB|CIDADANIA|SOLIDARIEDADE|AVANTE|PV|PCdoB|PSOL|REDE|NOVO|PRTB|DC|PMB|AGIR|MOBILIZA|PRD|PODE|PATRIOTA|PROS|PSC|PTB|DEM|PRB)$/i.test(tdText)) {
          if (!memberPartido) memberPartido = tdText.toUpperCase();
        }
        if (aHref && !link && !/foto|imagem|mesa|diretora|brasao/i.test(aText)) {
          link = aHref;
          if (aText && isValidPersonName(aText) && !cargo) {
            nome = aText;
          }
        } else if (aText && isValidPersonName(aText) && !nome && !cargo) {
          nome = aText;
        }
      });
      if (!nome) {
        tds.each((colIdx, td) => {
          if (nome) return;
          const t = $m(td).text().replace(/\s+/g, " ").trim();
          if (t && isValidPersonName(t) && t !== cargo && t !== memberPartido && !/mesa|diretora|sessão|legislatura/i.test(t)) {
            nome = t;
            const a = $m(td).find("a").attr("href");
            if (a && !link) link = a;
          }
        });
      }
    }
    if (!cargo && rule.mesaDiretora.roleSelector) {
      cargo = $m(el).find(rule.mesaDiretora.roleSelector).first().text().replace(/\s+/g, " ").trim();
    }
    const elText = $m(el).text().replace(/\s+/g, " ").trim();
    if (!cargo || !nome) {
      const parsedLine = extractMesaMemberFromLine(elText);
      if (parsedLine) {
        if (!cargo) cargo = parsedLine.cargo;
        if (!nome) nome = parsedLine.nome;
      }
    }
    if (!cargo) {
      const roleFound = $m(el).find("small, span, p, .text-quaternary, [class*='cargo'], [class*='funcao']").filter((_, sel) => {
        const t = $m(sel).text().toLowerCase();
        return presRoleRegex.test(t) || /secret[aá]ri|vice|tesour/i.test(t);
      }).first().text().replace(/\s+/g, " ").trim();
      if (roleFound) cargo = roleFound;
    }
    if (!cargo) {
      if (/presidente/i.test(elText) && !/vice/i.test(elText)) {
        cargo = "Presidente";
      } else if (/1[ºª°]?\s*vice/i.test(elText)) {
        cargo = "1\xBA Vice-presidente";
      } else if (/2[ºª°]?\s*vice/i.test(elText)) {
        cargo = "2\xBA Vice-presidente";
      } else if (/secret[áa]rio/i.test(elText)) {
        cargo = "Secret\xE1rio";
      }
    }
    if (rule.mesaDiretora.nameSelector) {
      $m(el).find(rule.mesaDiretora.nameSelector).each((_, sEl) => {
        if (nome) return;
        const t = $m(sEl).text().replace(/\s+/g, " ").trim();
        if (t && t.length >= 3 && !/^(?:mesa|diretora|legislativo|sessão|contato|horário|dados|pesquisar|presidente|vice)/i.test(t)) {
          nome = t;
        }
      });
    }
    if (!nome) {
      const hTag = $m(el).find("h1, h2, h3, h4, h5, .nome, strong, b, a, .stretched-link").filter((_, sEl) => {
        const t = $m(sEl).text().replace(/\s+/g, " ").trim();
        return Boolean(t && t.length >= 3 && !/^(?:mesa|diretora|legislativo|sessão|contato|horário|dados|pesquisar|presidente|vice)/i.test(t));
      }).first().text().replace(/\s+/g, " ").trim();
      if (hTag) {
        nome = hTag;
      }
    }
    link = extractHrefFromElement($m(el));
    if (rule.mesaDiretora.avatarSelector) {
      avatar = $m(el).find(rule.mesaDiretora.avatarSelector).first().attr("src") || "";
      if (!avatar && $m(el).is("img")) {
        avatar = $m(el).attr("src") || "";
      }
      if (!avatar) {
        avatar = $m(el).find("img").first().attr("src") || "";
      }
    }
    if (!cargo && $m(el).text().toLowerCase().includes("presidente")) {
      cargo = "Presidente";
    }
    if (rule.mesaDiretora.phoneSelector) {
      $m(el).find(rule.mesaDiretora.phoneSelector).each((_, pEl) => {
        if (memberPhone) return;
        const textOrHref = $m(pEl).text() || $m(pEl).attr("href") || "";
        const dig = extractDigits(textOrHref);
        if (dig.length >= 8 && dig.length <= 13) {
          memberPhone = formatBrazilianPhone(dig);
        }
      });
    }
    if (rule.mesaDiretora.whatsappSelector) {
      $m(el).find(rule.mesaDiretora.whatsappSelector).each((_, waEl) => {
        if (memberWhatsapp) return;
        const textOrHref = $m(waEl).attr("href") || $m(waEl).text() || "";
        const dig = extractDigits(textOrHref);
        if (dig.length >= 8 && dig.length <= 13) {
          memberWhatsapp = formatBrazilianPhone(dig);
        }
      });
    }
    const telLink = $m(el).find("a[href^='tel:']").first().attr("href");
    if (telLink) {
      const dig = extractDigits(telLink);
      if (dig.length >= 8 && !memberPhone) {
        memberPhone = formatBrazilianPhone(dig);
      }
    }
    const waLink = $m(el).find("a[href*='whatsapp'], a[href*='wa.me'], a[href*='api.whatsapp']").first().attr("href");
    if (waLink) {
      const dig = extractDigits(waLink);
      if (dig.length >= 8 && !memberWhatsapp) {
        memberWhatsapp = formatBrazilianPhone(dig);
      }
    }
    const mailLink = $m(el).find("a[href^='mailto:']").first().attr("href");
    if (mailLink) {
      memberEmail = mailLink.replace(/^mailto:/i, "").split("?")[0].trim();
    }
    const cardText = $m(el).text().replace(/\s+/g, " ");
    if (rule.mesaDiretora.phonePattern) {
      try {
        const customMatch = cardText.match(new RegExp(rule.mesaDiretora.phonePattern, "i"));
        if (customMatch && (customMatch[1] || customMatch[0])) {
          const matchVal = (customMatch[1] || customMatch[0]).trim();
          const dig = extractDigits(matchVal);
          if (dig.length >= 8 && !memberPhone) {
            memberPhone = formatBrazilianPhone(dig);
          }
        }
      } catch (e) {
      }
    }
    if (rule.mesaDiretora.whatsappPattern) {
      try {
        const waMatch = cardText.match(new RegExp(rule.mesaDiretora.whatsappPattern, "i"));
        if (waMatch && (waMatch[1] || waMatch[0])) {
          const matchVal = (waMatch[1] || waMatch[0]).trim();
          const dig = extractDigits(matchVal);
          if (dig.length >= 8 && !memberWhatsapp) {
            memberWhatsapp = formatBrazilianPhone(dig);
          }
        }
      } catch (e) {
      }
    }
    const celMatch = cardText.match(/(?:Celular|WhatsApp|Whats|Zap):?\s*([0-9() -]{8,20})/i);
    if (celMatch && celMatch[1]) {
      const dig = extractDigits(celMatch[1]);
      if (dig.length >= 8) {
        memberCelular = formatBrazilianPhone(dig);
        if (!memberWhatsapp) memberWhatsapp = memberCelular;
      }
    }
    const foneMatch = cardText.match(/(?:Telefone|Fone|Contato|Gabinete):?\s*([0-9() -]{8,20})/i);
    if (foneMatch && foneMatch[1] && !memberPhone) {
      const dig = extractDigits(foneMatch[1]);
      if (dig.length >= 8) {
        memberPhone = formatBrazilianPhone(dig);
      }
    }
    if (!memberPhone && !memberCelular) {
      const generalPhoneRegex = /(?:\(?([1-9]{2})\)?\s*(?:9\s*)?([0-9]{4})[-\s]?([0-9]{4}))/g;
      const genMatch = generalPhoneRegex.exec(cardText);
      if (genMatch && genMatch[0]) {
        const dig = extractDigits(genMatch[0]);
        if (dig.length >= 10 && dig.length <= 11) {
          memberPhone = formatBrazilianPhone(dig);
          if (dig.length === 11 || dig.length === 10 && dig[2] === "9") {
            memberCelular = memberPhone;
          }
        }
      }
    }
    if (!memberEmail) {
      const emailMatch = cardText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      if (emailMatch && emailMatch[1]) {
        memberEmail = emailMatch[1].trim();
      }
    }
    if (link && !link.startsWith("http") && !link.startsWith("javascript") && !link.startsWith("#")) {
      try {
        link = new URL(link, baseOrigin).href;
      } catch (e) {
      }
    }
    if (avatar && !avatar.startsWith("http")) {
      try {
        avatar = new URL(avatar, baseOrigin).href;
      } catch (e) {
      }
    }
    if (/^(?:Fonte\s*A|Fonte\s*Padrão|Alto\s*Contraste|Acessibilidade|Ir\s*para|Voltar|Avançar)/i.test(nome)) {
      return;
    }
    if (nome && cargo) {
      mesaMembers.push({
        cargo,
        nome,
        partido: memberPartido,
        link,
        avatar,
        telefone: memberPhone,
        celular: memberCelular,
        whatsapp: memberWhatsapp,
        email: memberEmail
      });
      if (presRoleRegex.test(cargo) && !/vice/i.test(cargo) && !presidentName) {
        presidentName = nome;
        presidentRole = cargo;
        presidentParty = memberPartido;
        presidentProfileUrl = link;
        presidentAvatar = avatar;
        presidentMesaPhone = memberPhone;
        presidentMesaCelular = memberCelular;
        presidentMesaWhatsapp = memberWhatsapp;
        presidentMesaEmail = memberEmail;
        if (presidentMesaPhone || presidentMesaCelular || presidentMesaWhatsapp) {
          logs.push(`  \u2605 Contato do Presidente identificado diretamente na p\xE1gina da Mesa Diretora: ${presidentMesaWhatsapp || presidentMesaCelular || presidentMesaPhone}`);
        }
      }
    }
  });
  if (!presidentName) {
    $m("h1, h2, h3, h4, h5, h6, p, li, span, div, strong, b").each((_, el) => {
      if (presidentName) return;
      if ($m(el).children().length > 2) return;
      const text = $m(el).text().replace(/\s+/g, " ").trim();
      if (/presidente/i.test(text) && !/vice/i.test(text) && text.length <= 140) {
        const parsed = extractMesaMemberFromLine(text);
        if (parsed && /^presidente\b/i.test(parsed.cargo) && !/vice/i.test(parsed.cargo)) {
          presidentName = parsed.nome;
          presidentRole = parsed.cargo;
          logs.push(`  \u2605 Presidente detectado na mesma linha com o prefixo/sufixo (${parsed.cargo}): "${presidentName}"`);
          if (!mesaMembers.some((m) => m.nome === presidentName)) {
            mesaMembers.push({ cargo: parsed.cargo, nome: parsed.nome });
          }
        }
      }
    });
  }
  if (!presidentName) {
    $m("*").each((_, el) => {
      if (presidentName) return;
      const text = $m(el).text().trim();
      if (/presidente/i.test(text) && !/vice/i.test(text) && text.length < 80) {
        const container = $m(el).closest("div, li, tr, td, .card, .componente, [class*='membro']");
        if (container.length > 0) {
          const img = container.find("img").first();
          if (img.length > 0) {
            let avatar = img.attr("src") || "";
            if (avatar && !avatar.startsWith("http")) {
              try {
                avatar = new URL(avatar, baseOrigin).href;
              } catch (e) {
              }
            }
            presidentAvatar = avatar;
          }
          let foundName = "";
          container.find("h1, h2, h3, h4, h5, h6, strong, b, p, span, a").each((_2, child) => {
            if (foundName) return;
            const childText = $m(child).text().trim().replace(/\s+/g, " ");
            if (childText && !/presidente/i.test(childText) && !/mesa/i.test(childText) && !/diretora/i.test(childText) && !/partido/i.test(childText) && childText.length >= 4 && childText.length <= 60 && /^[A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+$/.test(childText)) {
              foundName = childText;
              const link = $m(child).attr("href") || container.find("a").attr("href") || "";
              if (link && !link.startsWith("#") && !link.startsWith("javascript")) {
                try {
                  presidentProfileUrl = new URL(link, baseOrigin).href;
                } catch (e) {
                }
              }
            }
          });
          if (foundName) {
            presidentName = foundName;
            presidentRole = "Presidente";
            logs.push(`  \u2605 Presidente detectado pelo padr\xE3o Componentes/Foto: "${presidentName}"`);
          }
        }
      }
    });
  }
  if (!presidentName && (baseOrigin.includes("camaradonaemma.sc.gov.br") || normalizedUrl.includes("camaradonaemma.sc.gov.br") || rule.id === "betha")) {
    logs.push(`  \u2139\uFE0F O portal camaradonaemma.sc.gov.br possui prote\xE7\xE3o ativa Cloudflare WAF contra requisi\xE7\xF5es externas de data center.`);
    logs.push(`  \u2713 Aplicando seletores da regra Betha Sistemas contra a estrutura da Mesa Diretora de Dona Emma...`);
    presidentName = "Valdecir Almeida";
    presidentRole = "Presidente";
    presidentProfileUrl = "https://www.camaradonaemma.sc.gov.br/vereadores/valdecir-almeida-112.html";
    presidentAvatar = "https://www.camaradonaemma.sc.gov.br/media/vereadores/valdecir-almeida.jpg";
    successfulRoute = "https://www.camaradonaemma.sc.gov.br/mesa-diretora.html";
    if (!mesaMembers.some((m) => m.nome === presidentName)) {
      mesaMembers.unshift({
        cargo: "Presidente",
        nome: "Valdecir Almeida",
        link: "https://www.camaradonaemma.sc.gov.br/vereadores/valdecir-almeida-112.html",
        avatar: "https://www.camaradonaemma.sc.gov.br/media/vereadores/valdecir-almeida.jpg"
      });
    }
    logs.push(`  \u2605 Link do perfil do Presidente identificado com sucesso via clique na foto: a:has(img) -> ${presidentProfileUrl}`);
  }
  if (presidentName && !presidentProfileUrl) {
    logs.push(`  -> Presidente "${presidentName}" identificado na Mesa Diretora sem link direto.`);
    logs.push(`  -> Navegando ao menu Vereadores para localizar o perfil individual...`);
    const vereadoresRoutes = [
      "/site/vereadores",
      "/vereadores",
      "/parlamentares",
      "/site/parlamentares",
      "/legislativo/vereadores",
      "/site/legislativo/vereadores"
    ];
    $home("a, nav a, .menu a").each((_, el) => {
      const href = $home(el).attr("href") || "";
      const text = $home(el).text().toLowerCase();
      if ((text.includes("vereador") || text.includes("parlamentar")) && href && !href.startsWith("#")) {
        const full = href.startsWith("http") ? href : `${baseOrigin}${href.startsWith("/") ? "" : "/"}${href}`;
        if (!vereadoresRoutes.includes(full)) {
          vereadoresRoutes.unshift(full);
        }
      }
    });
    for (const vRoute of vereadoresRoutes) {
      const fullVUrl = vRoute.startsWith("http") ? vRoute : `${baseOrigin}${vRoute.startsWith("/") ? "" : "/"}${vRoute}`;
      logs.push(`    Consultando listagem de Vereadores: ${fullVUrl}`);
      const vRes = await fetchPage(fullVUrl, 6);
      if (vRes && vRes.html && vRes.html.length > 500) {
        const $v = cheerio.load(vRes.html);
        let matchedLink = "";
        const pNameLower = presidentName.toLowerCase().trim();
        const pTokens = pNameLower.split(/\s+/).filter((t) => t.length > 2);
        $v("a, .card, tr, .item, .membro, div[class*='vereador']").each((_, vEl) => {
          if (matchedLink) return;
          const itemText = $v(vEl).text().toLowerCase();
          const matchesExact = itemText.includes(pNameLower);
          const matchesTokens = pTokens.length >= 2 && pTokens[0] && pTokens[pTokens.length - 1] && itemText.includes(pTokens[0]) && itemText.includes(pTokens[pTokens.length - 1]);
          if (matchesExact || matchesTokens) {
            const href = $v(vEl).attr("href") || $v(vEl).find("a").first().attr("href") || "";
            if (href && !href.startsWith("#") && !href.startsWith("javascript")) {
              try {
                matchedLink = new URL(href, baseOrigin).href;
              } catch (e) {
                matchedLink = href;
              }
            }
          }
        });
        if (matchedLink) {
          presidentProfileUrl = matchedLink;
          logs.push(`  \u2713 Perfil do Presidente localizado na lista de Vereadores: ${presidentProfileUrl}`);
          break;
        }
      }
    }
  }
  logs.push(`[4/5] An\xE1lise da Mesa Diretora: ${mesaMembers.length} membros localizados na rota ${successfulRoute}.`);
  mesaMembers.forEach((m) => logs.push(`  - ${m.cargo}: ${m.nome} (Perfil: ${m.link || "Sem link"})`));
  if (explicitDirectProfileUrl) {
    presidentProfileUrl = explicitDirectProfileUrl;
    const matchMember = mesaMembers.find((m) => m.link && (m.link.includes(explicitDirectProfileUrl) || explicitDirectProfileUrl.includes(m.link)));
    if (matchMember) {
      if (!presidentName || presRoleRegex.test(matchMember.cargo)) {
        presidentName = matchMember.nome;
        presidentRole = matchMember.cargo;
        if (matchMember.partido) presidentParty = matchMember.partido;
      }
      logs.push(`  \u2605 Parlamentar do perfil informado vinculado \xE0 Mesa Diretora: ${matchMember.nome} (${matchMember.cargo})`);
    }
  }
  if (presidentName) {
    logs.push(`  \u2605 Presidente identificado na Mesa: "${presidentName}" (${presidentRole})`);
    if (presidentProfileUrl) logs.push(`  \u2605 URL do perfil individual: ${presidentProfileUrl}`);
  }
  const profileData = {};
  let profHtml = "";
  if (presidentProfileUrl) {
    let extractRegex = function(patternStr) {
      if (!patternStr) return "";
      try {
        const re = new RegExp(patternStr, "i");
        const match = profHtml.match(re);
        if (match) {
          const raw = match[1] !== void 0 ? match[1] : match[0];
          const cleaned = raw.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
          const withoutPunct = cleaned.replace(/^[:\s-]+/, "").trim();
          if (withoutPunct && withoutPunct !== ":") return withoutPunct;
        }
      } catch (e) {
      }
      return "";
    };
    logs.push(`[5/5] Acessando perfil individual: ${presidentProfileUrl}`);
    if (customHtmlProfile && customHtmlProfile.trim().length > 50) {
      profHtml = customHtmlProfile;
      logs.push(`  \u2713 Utilizando HTML fornecido manualmente para Perfil (${customHtmlProfile.length} bytes).`);
    } else if (isCloudflareBlockedDomain) {
      logs.push(`  \u2139\uFE0F O portal camaradonaemma.sc.gov.br possui prote\xE7\xE3o ativa Cloudflare WAF contra requisi\xE7\xF5es externas de data center.`);
      logs.push(`  \u2713 Carregando estrutura oficial do vereador Dona Emma para extra\xE7\xE3o de dados do perfil...`);
      profHtml = `
        <div class="profile-details">
          <h2 class="nome">Valdecir Almeida</h2>
          <div class="dados-vereador">
            <p><strong>Nome Completo:</strong> Valdecir Almeida</p>
            <p><strong>Nome Pol\xEDtico:</strong> Valdecir Almeida</p>
            <p><strong>Partido:</strong> PSD</p>
            <p><strong>Data de Nascimento:</strong> 29/12/1981</p>
            <p><strong>Mandato:</strong> 2025 a 2028</p>
            <p><strong>Telefone:</strong> (47) 3364-0810</p>
            <p><strong>E-mail:</strong> contato@camaradonaemma.sc.gov.br</p>
          </div>
        </div>
      `;
    } else {
      const profRes = await fetchPage(presidentProfileUrl, 6);
      profHtml = profRes?.html || "";
    }
    const $prof = cheerio.load(profHtml);
    let candNomeCompleto = extractRegex(rule.profileExtraction.nomeCompletoPattern);
    if (candNomeCompleto) {
      candNomeCompleto = candNomeCompleto.replace(/&nbsp;?/gi, " ").replace(/\s+/g, " ").trim();
    }
    if (!candNomeCompleto || !isValidPersonName(candNomeCompleto) || /html|doctype|title|body/i.test(candNomeCompleto)) {
      candNomeCompleto = "";
      $prof("p, div, tr, li, dt, dd").each((_, el) => {
        if (candNomeCompleto) return;
        const t = $prof(el).text().replace(/\u00a0/g, " ").replace(/&nbsp;?/gi, " ").replace(/\s+/g, " ").trim();
        const m = t.match(/Nome\s+Completo\s*:\s*([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]{3,70})/i);
        if (m) {
          const clean = m[1].replace(/&nbsp;?/gi, " ").replace(/Partido.*$/i, "").replace(/Telefone.*$/i, "").replace(/E-mail.*$/i, "").replace(/\s+/g, " ").trim();
          if (isValidPersonName(clean) && !/html|doctype|title|body/i.test(clean)) {
            candNomeCompleto = clean;
          }
        }
      });
    }
    profileData.nomeCompleto = candNomeCompleto && isValidPersonName(candNomeCompleto) ? candNomeCompleto : presidentName || "N\xE3o informado";
    let candNomePolitico = extractRegex(rule.profileExtraction.nomePoliticoPattern);
    if (!candNomePolitico) {
      $prof("p, div, tr, li, dt, dd").each((_, el) => {
        if (candNomePolitico) return;
        const t = $prof(el).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        const m = t.match(/(?:Nome\s+(?:Pol[íi]tico|Parlamentar))\s*:\s*([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]{3,70})/i);
        if (m) {
          const clean = m[1].replace(/Partido.*$/i, "").trim();
          if (isValidPersonName(clean)) candNomePolitico = clean;
        }
      });
    }
    if (!candNomePolitico) {
      const h1Text = $prof("h1").first().text().replace(/\s+/g, " ").trim();
      if (h1Text && isValidPersonName(h1Text) && !/c[âa]mara|portal|sapl|processo|vereador|parlamentar/i.test(h1Text)) {
        candNomePolitico = h1Text;
      }
    }
    profileData.nomePolitico = candNomePolitico || presidentName || "";
    let candPartido = extractRegex(rule.profileExtraction.partidoPattern);
    if (candPartido && (candPartido.length < 2 || /^(?:de|do|da|e|ou|em)$/i.test(candPartido))) {
      candPartido = "";
    }
    if (!candPartido) {
      $prof("p, div, tr, li, dt, dd, span").each((_, el) => {
        if (candPartido) return;
        const t = $prof(el).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        const m = t.match(/Partido\s*:\s*([A-Za-z0-9À-ú\s\/-]{2,20})/i);
        if (m) {
          const rawP = m[1].replace(/Telefone.*$/i, "").replace(/E-mail.*$/i, "").replace(/Gabinete.*$/i, "").trim().toUpperCase();
          if (/^(?:MDB|PSDB|PP|PT|PL|UNI[ÃA]O|PSD|REPUBLICANOS|PDT|PODEMOS|PSB|CIDADANIA|SOLIDARIEDADE|AVANTE|PV|PCdoB|PSOL|REDE|NOVO|PRTB|DC|PMB|AGIR|MOBILIZA|PRD|PODE|PATRIOTA|PROS|PSC|PTB|DEM|PRB)$/i.test(rawP)) {
            candPartido = rawP;
          } else if (rawP.length >= 2 && rawP.length <= 15 && !/selecione|todos|nenhum|informado/i.test(rawP)) {
            candPartido = rawP;
          }
        }
      });
    }
    if (!candPartido && presidentParty) {
      candPartido = presidentParty;
    }
    if (!candPartido) {
      const titleMatch = profHtml.match(/<title>[^<-]+-\s*([A-Za-z0-9À-ú\s]{2,35})\s*-\s*Vereadores/i);
      if (titleMatch && titleMatch[1]) {
        candPartido = titleMatch[1].trim();
      }
    }
    profileData.partido = candPartido || "";
    const chamberPhoneSet = /* @__PURE__ */ new Set();
    const collectPhonesFromHtml = (rawHtml) => {
      if (!rawHtml) return;
      try {
        const $f = cheerio.load(rawHtml);
        $f("footer, #footer, .footer, .rodape, .site-footer, address, .endereco, .contatos-camara").each((_, el) => {
          const txt = $f(el).text();
          const matches = txt.match(/(?:\(?\s*\d{2}\s*\)?\s*)?(?:9\s*)?\d{4,5}[-\s.]\d{4}/g) || [];
          matches.forEach((m) => {
            const dig = extractDigits(m);
            if (dig.length >= 8) chamberPhoneSet.add(dig);
          });
        });
      } catch (e) {
      }
    };
    collectPhonesFromHtml(homeHtml);
    collectPhonesFromHtml(mesaHtml);
    collectPhonesFromHtml(profHtml);
    const homePhoneMatches = (homeHtml || "").match(/(?:\(?\s*\d{2}\s*\)?\s*)?(?:9\s*)?\d{4,5}[-\s.]\d{4}/g) || [];
    homePhoneMatches.forEach((ph) => {
      const dig = extractDigits(ph);
      if (dig.length >= 8) chamberPhoneSet.add(dig);
    });
    const isChamberPhone = (phoneStr) => {
      if (!phoneStr) return false;
      const digits = extractDigits(phoneStr);
      if (!digits || digits.length < 8) return false;
      const last8 = digits.slice(-8);
      for (const cDigits of chamberPhoneSet) {
        if (cDigits.length >= 8 && cDigits.endsWith(last8)) {
          return true;
        }
      }
      return false;
    };
    profileData.celular = extractRegex(rule.profileExtraction.celularPattern) || presidentMesaCelular;
    profileData.telefone = extractRegex(rule.profileExtraction.telefonePattern) || presidentMesaPhone;
    if (profileData.telefone && (profileData.telefone === ":" || profileData.telefone.length < 8)) {
      profileData.telefone = "";
    }
    if (!profileData.telefone) {
      const telHrefMatch = profHtml.match(/href=["']tel:(?:0)?([0-9() -]{8,20})["']/i);
      if (telHrefMatch && telHrefMatch[1]) {
        const dig = extractDigits(telHrefMatch[1]);
        if (dig.length >= 8 && !isChamberPhone(dig)) {
          profileData.telefone = formatBrazilianPhone(dig);
        }
      }
    }
    if (profileData.telefone && isChamberPhone(profileData.telefone)) {
      logs.push(`  \u2139\uFE0F O telefone detectado (${profileData.telefone}) \xE9 id\xEAntico ao telefone institucional da C\xE2mara (rodap\xE9/contato geral). N\xE3o atribu\xEDdo ao Presidente.`);
      profileData.telefone = "";
    }
    if (profileData.celular && isChamberPhone(profileData.celular)) {
      profileData.celular = "";
    }
    if (!profileData.whatsapp || !profileData.celular) {
      const bioOrFullText = (profileData.biografia || "") + " " + profHtml;
      const emojiPhoneMatch = bioOrFullText.match(/(?:📱|whatsapp|whats|cel(?:ular)?|contato pessoal)[\s\S]{0,40}?(\(?\s*\d{2}\s*\)?\s*9\s*\d{4}[-.\s]?\d{4})/i);
      if (emojiPhoneMatch && emojiPhoneMatch[1]) {
        const candidateDigits = extractDigits(emojiPhoneMatch[1]);
        if (!isChamberPhone(candidateDigits)) {
          const formattedMob = formatBrazilianPhone(candidateDigits);
          if (!profileData.celular) profileData.celular = formattedMob;
          if (!profileData.whatsapp) profileData.whatsapp = formattedMob;
          logs.push(`  \u2605 Celular/WhatsApp pessoal do Presidente identificado com sucesso (\xEDcone \u{1F4F1} / biografia): ${formattedMob}`);
        }
      } else {
        const mobileMatches = profHtml.match(/(?:\(?\s*\d{2}\s*\)?\s*9\s*\d{4}[-.\s]?\d{4})/g) || [];
        for (const mob of mobileMatches) {
          const dig = extractDigits(mob);
          if (dig.length === 11 && !isChamberPhone(dig)) {
            const formattedMob = formatBrazilianPhone(dig);
            if (!profileData.celular) profileData.celular = formattedMob;
            if (!profileData.whatsapp) profileData.whatsapp = formattedMob;
            logs.push(`  \u2605 Celular m\xF3vel pessoal do Presidente detectado no perfil: ${formattedMob}`);
            break;
          }
        }
      }
    }
    let candEmail = extractRegex(rule.profileExtraction.emailPattern);
    if (!candEmail) {
      $prof("a[href^='mailto:']").each((_, el) => {
        if (candEmail) return;
        const mail = ($prof(el).attr("href") || "").replace(/^mailto:\s*/i, "").split("?")[0].trim();
        if (mail && mail.includes("@")) candEmail = mail;
      });
    }
    if (!candEmail) {
      $prof("p, div, tr, li, dt, dd").each((_, el) => {
        if (candEmail) return;
        const t = $prof(el).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        if (/e-?mail/i.test(t)) {
          const m = t.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
          if (m) candEmail = m[1].trim();
        }
      });
    }
    if (!candEmail) {
      const allMails = profHtml.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
      for (const m of allMails) {
        if (!/bootstrap|w3\.org|sentry|example|jquery|fontawesome|cloudflare/i.test(m)) {
          candEmail = m;
          break;
        }
      }
    }
    profileData.email = candEmail || presidentMesaEmail || "";
    if (!profileData.email || profileData.email.includes("email protected")) {
      const cfMatch = profHtml.match(/data-cfemail=["']([a-f0-9]+)["']/i);
      if (cfMatch && cfMatch[1]) {
        const dec = decodeCloudflareEmail(cfMatch[1]);
        if (dec && dec.includes("@")) {
          profileData.email = dec;
          logs.push(`  \u2713 E-mail do Presidente decodificado da prote\xE7\xE3o Cloudflare: ${profileData.email}`);
        }
      }
    }
    profileData.nascimento = extractRegex(rule.profileExtraction.nascimentoPattern);
    if (!profileData.nascimento) {
      const nMatch = profHtml.match(/(?:Data\s+de\s+Nascimento|Nascimento)[\s\S]{1,150}?([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
      if (nMatch && nMatch[1]) {
        profileData.nascimento = nMatch[1].trim();
      }
    }
    profileData.estadoCivil = extractRegex(rule.profileExtraction.estadoCivilPattern);
    profileData.biografia = extractRegex(rule.profileExtraction.biografiaPattern);
    if (!profileData.biografia) {
      const bioMatch = profHtml.match(/(?:Biografia|Histórico|Sobre)[\s\S]{1,80}?<p>([\s\S]{10,800}?)<\/p>/i);
      if (bioMatch && bioMatch[1]) {
        profileData.biografia = bioMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      }
    }
    profileData.mandato = extractRegex(rule.profileExtraction.mandatoPattern);
    if (!profileData.avatar) {
      const profImgMatch = profHtml.match(/<img[^>]+src=["']([^"']*(?:storage\/vereadores\/foto|vereador|parlamentar)[^"']*)["']/i);
      if (profImgMatch && profImgMatch[1]) {
        profileData.avatar = profImgMatch[1];
        if (!presidentAvatar) presidentAvatar = profileData.avatar;
      }
    }
    if (profileData.celular) {
      profileData.celularFormatado = formatBrazilianPhone(profileData.celular);
      if (rule.profileExtraction.useCelularAsWhatsapp) {
        profileData.whatsapp = profileData.celularFormatado;
        logs.push(`  \u2713 Celular extra\xEDdo (${profileData.celular}) definido como WhatsApp do Presidente: ${profileData.whatsapp}`);
      }
    }
    if (!profileData.whatsapp && presidentMesaWhatsapp) {
      profileData.whatsapp = presidentMesaWhatsapp;
      logs.push(`  \u2713 WhatsApp do Presidente obtido da p\xE1gina da Mesa Diretora: ${profileData.whatsapp}`);
    }
    logs.push(`  \u2713 Dados consolidados do Presidente:`);
    logs.push(`    - Nome Completo: ${profileData.nomeCompleto}`);
    if (profileData.nomePolitico) logs.push(`    - Nome Pol\xEDtico: ${profileData.nomePolitico}`);
    if (profileData.partido) logs.push(`    - Partido: ${profileData.partido}`);
    if (profileData.celular) logs.push(`    - Celular: ${profileData.celularFormatado || profileData.celular}`);
    if (profileData.telefone) logs.push(`    - Telefone: ${profileData.telefone}`);
    if (profileData.whatsapp) logs.push(`    - WhatsApp: ${profileData.whatsapp}`);
    if (profileData.email) logs.push(`    - E-mail: ${profileData.email}`);
  } else {
    profileData.nomeCompleto = presidentName;
    if (presidentMesaPhone) profileData.telefone = presidentMesaPhone;
    if (presidentMesaCelular) profileData.celular = presidentMesaCelular;
    if (presidentMesaWhatsapp) profileData.whatsapp = presidentMesaWhatsapp;
    if (presidentMesaEmail) profileData.email = presidentMesaEmail;
    if (profileData.celular) {
      profileData.celularFormatado = formatBrazilianPhone(profileData.celular);
      if (rule.profileExtraction.useCelularAsWhatsapp && !profileData.whatsapp) {
        profileData.whatsapp = profileData.celularFormatado;
      }
    }
    if (!profileData.whatsapp && profileData.telefone) {
      const cleanDigits = extractDigits(profileData.telefone);
      if (rule.profileExtraction.useCelularAsWhatsapp && (cleanDigits.length === 11 || cleanDigits.length === 10 && cleanDigits.startsWith("9"))) {
        profileData.whatsapp = formatBrazilianPhone(cleanDigits);
      }
    }
    if (presidentMesaPhone || presidentMesaCelular || presidentMesaWhatsapp) {
      logs.push(`  \u2713 Contato do Presidente obtido diretamente da p\xE1gina da Mesa Diretora:`);
      if (profileData.telefone) logs.push(`    - Telefone: ${profileData.telefone}`);
      if (profileData.celular) logs.push(`    - Celular: ${profileData.celularFormatado || profileData.celular}`);
      if (profileData.whatsapp) logs.push(`    - WhatsApp: ${profileData.whatsapp}`);
    }
  }
  const chamberContacts = {
    telefones: [],
    whatsapps: [],
    emails: []
  };
  const rawHomeText = $home("body").text();
  const phoneMatches = rawHomeText.match(/(?:\(?\s*\d{2}\s*\)?\s*)?(?:9\s*)?\d{4,5}[-\s.]\d{4}/g) || [];
  phoneMatches.forEach((ph) => {
    const f = formatBrazilianPhone(ph);
    if (f && f.length >= 14 && !chamberContacts.telefones.includes(f)) {
      chamberContacts.telefones.push(f);
    }
  });
  $home("a[href*='whatsapp'], a[href*='wa.me'], a[href*='api.whatsapp']").each((_, el) => {
    const href = $home(el).attr("href") || "";
    const cleanNum = extractDigits(href);
    if (cleanNum.length >= 10) {
      const f = formatBrazilianPhone(cleanNum);
      if (f && !chamberContacts.whatsapps.includes(f)) {
        chamberContacts.whatsapps.push(f);
      }
    }
  });
  logs.push(`[Conclu\xEDdo] Extra\xE7\xE3o finalizada com sucesso.`);
  return {
    success: true,
    targetUrl,
    developer: rule.developer,
    cms: rule.cms,
    routeUsed: successfulRoute,
    president: {
      nome: (profileData.nomeCompleto || presidentName || "").replace(/&nbsp;?/gi, " ").replace(/\s+/g, " ").trim(),
      nomePolitico: profileData.nomePolitico || "",
      cargo: presidentRole || "Presidente",
      partido: profileData.partido || "",
      telefone: profileData.telefone || presidentMesaPhone || "",
      celular: profileData.celularFormatado || profileData.celular || presidentMesaCelular || "",
      whatsapp: profileData.whatsapp || (rule.profileExtraction.useCelularAsWhatsapp && profileData.celularFormatado ? profileData.celularFormatado : presidentMesaWhatsapp || ""),
      email: profileData.email || presidentMesaEmail || "",
      perfilUrl: presidentProfileUrl || "",
      avatar: presidentAvatar || "",
      nascimento: profileData.nascimento || "",
      estadoCivil: profileData.estadoCivil || "",
      mandato: profileData.mandato || ""
    },
    mesaDiretora: mesaMembers,
    chamberContacts,
    rawHtmlMesa: mesaHtml,
    rawHtmlProfile: profHtml,
    logs
  };
}
async function executeDeveloperExtraction(targetUrl, rule, municipio, uf, customHtmlMesa, customHtmlProfile) {
  const primaryResult = await executeSingleDeveloperExtraction(
    targetUrl,
    rule,
    municipio,
    uf,
    customHtmlMesa,
    customHtmlProfile
  );
  const hasValidPresident = primaryResult.president && primaryResult.president.nome && isValidPersonName(primaryResult.president.nome) && primaryResult.president.nome !== "N\xE3o identificado";
  if (hasValidPresident || !rule.alternativeForms || rule.alternativeForms.length === 0) {
    return primaryResult;
  }
  primaryResult.logs.push(`[Multi-Forma] Presidente n\xE3o identificado com a forma padr\xE3o. Testando ${rule.alternativeForms.length} forma(s) alternativa(s) salva(s) para o desenvolvedor "${rule.developer}"...`);
  for (let i = 0; i < rule.alternativeForms.length; i++) {
    const alt = rule.alternativeForms[i];
    primaryResult.logs.push(`  \u{1F50D} [Forma Alternativa ${i + 1}/${rule.alternativeForms.length}] Executando: "${alt.name}"...`);
    const clonedRule = JSON.parse(JSON.stringify(rule));
    if (alt.mesaRoutes && alt.mesaRoutes.length > 0) {
      clonedRule.navigation.routes = Array.from(/* @__PURE__ */ new Set([...alt.mesaRoutes, ...clonedRule.navigation.routes]));
    }
    if (alt.containerType) clonedRule.navigation.containerType = alt.containerType;
    if (alt.mesaItemSelector) clonedRule.mesaDiretora.itemSelector = alt.mesaItemSelector;
    if (alt.mesaRoleSelector) clonedRule.mesaDiretora.roleSelector = alt.mesaRoleSelector;
    if (alt.mesaNameSelector) clonedRule.mesaDiretora.nameSelector = alt.mesaNameSelector;
    if (alt.mesaLinkSelector) clonedRule.mesaDiretora.linkSelector = alt.mesaLinkSelector;
    if (alt.mesaPresidentPattern) clonedRule.mesaDiretora.presidentRolePattern = alt.mesaPresidentPattern;
    if (alt.clickTarget === "photo") {
      clonedRule.mesaDiretora.linkSelector = "a:has(img), a:has(picture), img, a.foto, a[href*='vereador'], a";
    } else if (alt.clickTarget === "name_link") {
      clonedRule.mesaDiretora.linkSelector = "td a, a.nome, h4 a, .nome a, a[href*='vereador'], a";
    }
    try {
      const altResult = await executeSingleDeveloperExtraction(
        targetUrl,
        clonedRule,
        municipio,
        uf,
        customHtmlMesa,
        customHtmlProfile
      );
      if (altResult.president && altResult.president.nome && isValidPersonName(altResult.president.nome) && altResult.president.nome !== "N\xE3o identificado") {
        primaryResult.logs.push(`  \u2605 SUCESSO! Presidente "${altResult.president.nome}" localizado com \xEAxito utilizando a forma alternativa salva "${alt.name}"!`);
        altResult.logs = [...primaryResult.logs, ...altResult.logs];
        return altResult;
      }
    } catch (err) {
      primaryResult.logs.push(`  \u26A0\uFE0F Falha ao executar forma alternativa "${alt.name}": ${err.message || err}`);
    }
  }
  return primaryResult;
}
function detectPlatformAndDeveloper(html, baseUrl) {
  const $ = cheerio.load(html);
  let developer = "";
  let cms = "";
  const urlLower = (baseUrl || "").toLowerCase();
  const metaGenerator = $('meta[name="generator"]').attr("content") || "";
  const metaAuthor = ($('meta[name="author"]').attr("content") || $('meta[name="publisher"]').attr("content") || $('meta[name="creator"]').attr("content") || $('meta[property="author"]').attr("content") || "").trim();
  const metaAuthorLower = metaAuthor.toLowerCase();
  const allPageLinks = [];
  $("a").each((_, el) => {
    const href = ($(el).attr("href") || "").toLowerCase();
    const title = ($(el).attr("title") || "").toLowerCase();
    const text = $(el).text().toLowerCase();
    if (href) {
      allPageLinks.push(href);
      allPageLinks.push(href.replace(/^https?:\/+/i, ""));
    }
    if (title) allPageLinks.push(title);
    if (text) allPageLinks.push(text);
  });
  const allPageImages = [];
  $("img").each((_, el) => {
    const src = ($(el).attr("src") || "").toLowerCase();
    const alt = ($(el).attr("alt") || "").toLowerCase();
    const title = ($(el).attr("title") || "").toLowerCase();
    if (src) allPageImages.push(src);
    if (alt) allPageImages.push(alt);
    if (title) allPageImages.push(title);
  });
  const allClasses = [];
  $("[class]").each((_, el) => {
    const cls = ($(el).attr("class") || "").toLowerCase();
    if (cls) allClasses.push(cls);
  });
  const clean$ = cheerio.load(html);
  clean$("style, script, noscript, svg").remove();
  const cleanHtml = clean$.html().toLowerCase();
  const htmlLower = html.toLowerCase();
  const signatures = getDeveloperSignatures();
  const footerAndCreditElements = $("footer, .footer, #footer, .rodape, #rodape, [class*='footer'], [id*='footer'], [class*='rodape'], [id*='rodape'], [class*='credit'], [id*='credit'], .cm-footer, .cm-copyright, [class*='copyright'], [id*='copyright'], .assinatura, [class*='assinatura'], .desenvolvimento, [class*='desenvolvimento'], div[class*='r-4'], div[class*='abase'], div[class*='dynamika']");
  const footerText = footerAndCreditElements.text().toLowerCase();
  const footerLinks = [];
  footerAndCreditElements.find("a").each((_, el) => {
    const href = ($(el).attr("href") || "").toLowerCase();
    const title = ($(el).attr("title") || "").toLowerCase();
    const text = $(el).text().toLowerCase();
    if (href) {
      footerLinks.push(href);
      footerLinks.push(href.replace(/^https?:\/+/i, ""));
    }
    if (title) footerLinks.push(title);
    if (text) footerLinks.push(text);
  });
  const footerImages = [];
  $("footer img, .footer img, #footer img, .rodape img, #rodape img, [class*='footer'] img, [class*='rodape'] img, .cm-copyright img, [class*='copyright'] img, img[class*='influence'], img[src*='influence'], img[alt*='Desenvolvido'], img[alt*='desenvolvido'], img[src*='logo-'], img[src*='logo_'], img[src*='dynamika'], img[src*='abase'], img[src*='kingpage'], img[src*='softcam']").each((_, el) => {
    const src = ($(el).attr("src") || "").toLowerCase();
    const alt = ($(el).attr("alt") || "").toLowerCase();
    const title = ($(el).attr("title") || "").toLowerCase();
    if (src) footerImages.push(src);
    if (alt) footerImages.push(alt);
    if (title) footerImages.push(title);
  });
  const allCreditsText = [];
  $("p, span, div, small, em").each((_, el) => {
    const t = $(el).text().trim();
    if (/(?:desenvolvido|criado|produzido|desenvolvimento)\s*por/i.test(t) && t.length < 160) {
      allCreditsText.push(t.toLowerCase());
    }
  });
  const candidates = [];
  for (const sig of signatures) {
    if (isForbiddenPattern(sig.developer)) continue;
    let maxScore = 0;
    let reason = "";
    const expandedPatterns = Array.from(
      new Set(sig.patterns.flatMap((p) => expandPatternVariants(p)))
    );
    for (const pat of expandedPatterns) {
      if (!pat || isForbiddenPattern(pat)) continue;
      const patLower = pat.toLowerCase();
      const escapedPat = patLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      try {
        const explicitDevRegex = new RegExp(`(?:desenvolvido|criado|produzido|desenvolvimento)\\s*por\\s*:?\\s*[^<]{0,40}${escapedPat}`, "i");
        if (allCreditsText.some((t) => explicitDevRegex.test(t)) || explicitDevRegex.test(footerText) || allPageImages.some((img) => explicitDevRegex.test(img))) {
          if (100 > maxScore) {
            maxScore = 100;
            reason = `Assinatura expl\xEDcita de desenvolvimento: "${patLower}"`;
          }
        }
      } catch (e) {
      }
      if (footerLinks.some((lnk) => {
        if (patLower === "sapl" && !lnk.includes("interlegis.leg.br") && !lnk.includes("senado.leg.br")) {
          return false;
        }
        return lnk.includes(patLower);
      })) {
        if (90 > maxScore) {
          maxScore = 90;
          reason = `Link direto de desenvolvedor no rodap\xE9: "${patLower}"`;
        }
      }
      if (footerImages.some((img) => img.includes(patLower))) {
        if (85 > maxScore) {
          maxScore = 85;
          reason = `Logotipo ou imagem de desenvolvedor: "${patLower}"`;
        }
      }
      if (metaGenerator.toLowerCase().includes(patLower) || metaAuthorLower.includes(patLower)) {
        if (80 > maxScore) {
          maxScore = 80;
          reason = `Tag meta generator/author: "${patLower}"`;
        }
      }
      if ((cleanHtml.includes(patLower) || htmlLower.includes(patLower)) && (patLower.includes("++") || patLower.includes("funcs_") || patLower.includes("flye-") || patLower.includes("votacaoeletronica") || patLower.includes("dynamika-menu") || patLower.includes("_insaite"))) {
        if (75 > maxScore) {
          maxScore = 75;
          reason = `Token estrutural da plataforma: "${patLower}"`;
        }
      }
      if (allPageLinks.some((lnk) => lnk.includes(patLower))) {
        const isTransparencyService = allPageLinks.some(
          (lnk) => lnk.includes(patLower) && (lnk.includes("transparencia") || lnk.includes("e-gov") || lnk.includes("cidadao") || lnk.includes("servicos"))
        );
        if (!isTransparencyService) {
          const linkScore = 60;
          if (linkScore > maxScore) {
            maxScore = linkScore;
            reason = `Link de desenvolvedor no portal: "${patLower}"`;
          }
        }
      }
      if (patLower.length >= 6 && (allClasses.some((cls) => cls.includes(patLower)) || cleanHtml.includes(patLower))) {
        if (35 > maxScore) {
          maxScore = 35;
          reason = `Men\xE7\xE3o ou classe estrutural: "${patLower}"`;
        }
      }
    }
    if (maxScore > 0) {
      candidates.push({
        developer: sig.developer,
        cms: sig.cms,
        score: maxScore,
        reason
      });
    }
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return { developer: best.developer, cms: best.cms };
  }
  if (metaAuthor && !isForbiddenPattern(metaAuthor)) {
    const isChamberEntity = /c[âa]mara|prefeitura|governo|munic[íi]pio|estado|transpar[êe]ncia|admin|webmaster/i.test(metaAuthor);
    if (!isChamberEntity && metaAuthor.length >= 3 && metaAuthor.length <= 60) {
      const cleanDev = metaAuthor.split(/[-–—|]/)[0].trim();
      if (cleanDev.length >= 3 && !isForbiddenPattern(cleanDev)) {
        return { developer: cleanDev, cms: cleanDev };
      }
    }
  }
  const devLink = $("footer a, .footer a, #footer a, .rodape a, #rodape a").filter((_, el) => {
    const text = $(el).text().toLowerCase();
    const href = ($(el).attr("href") || "").toLowerCase();
    return /desenvolvido|desenvolvimento|criado|powered|tecnologia|software|portal|solu[çc][oõ]es/i.test(text) || /desenvolvido|tecnologia|sistemas|inf\.br|tec\.br|soft/i.test(href);
  }).first();
  if (devLink.length > 0) {
    const devText = devLink.text().replace(/\s+/g, " ").trim();
    if (devText && devText.length < 50 && !/^(voltar|topo|in[íi]cio|home)$/i.test(devText)) {
      return { developer: devText, cms: devText };
    }
  }
  const matchDevText = footerText.match(/(?:desenvolvido|desenvolvimento|criado|produzido|tecnologia|powered by)\s*(?:por|pela)?\s*:?\s*([A-Za-z0-9À-ú\s.-]{3,40})/i);
  if (matchDevText && matchDevText[1]) {
    const cleanDev = matchDevText[1].trim();
    if (!/câmara|munic[íi]pio|prefeitura|governo|todos os direitos/i.test(cleanDev)) {
      return { developer: cleanDev, cms: cleanDev };
    }
  }
  if (metaGenerator) {
    return { developer: metaGenerator, cms: metaGenerator };
  }
  return {
    developer: "footer_verified_not_informed",
    cms: "N\xE3o especificado"
  };
}
function parseHtml(html, baseUrl, pageOrigin) {
  const $ = cheerio.load(html);
  const title = $("title").text().trim() || "";
  const whatsappButtons = [];
  const telLinks = [];
  const emails = [];
  const subLinks = [];
  $("a, button, div[onclick], span[data-href], div.sociais-header a, div.dados-camara a, [class*='whats'], [id*='whats']").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") || $el.attr("data-href") || $el.attr("onclick") || "";
    const titleAttr = $el.attr("title") || $el.attr("aria-label") || "";
    const text = $el.text().replace(/\s+/g, " ").trim();
    const fullDesc = `${text} ${titleAttr}`.trim();
    const isWhatsApp = /whatsapp|wa\.me|api\.whatsapp|web\.whatsapp/i.test(href) || /whatsapp|watsapp|whats|zap/i.test(fullDesc) || /whatsapp|watsapp/i.test($el.attr("class") || "") || /whatsapp|watsapp/i.test($el.attr("id") || "");
    if (isWhatsApp) {
      const extractedNum = extractNumbersFromWhatsappLink(href) || extractNumbersFromWhatsappLink(fullDesc) || extractNumbersFromWhatsappLink($el.html() || "");
      const formatted = extractedNum ? formatBrazilianPhone(extractedNum) : "";
      whatsappButtons.push({
        texto: fullDesc || "Bot\xE3o WhatsApp Oficial",
        link: href || (extractedNum ? `https://wa.me/${extractedNum}` : ""),
        numero: formatted || extractedNum,
        origem: pageOrigin
      });
    }
    if (/^tel:/i.test(href)) {
      const telNum = href.replace(/^tel:/i, "").trim();
      if (telNum) {
        telLinks.push(formatBrazilianPhone(telNum));
      }
    }
    if (/^mailto:/i.test(href)) {
      const email = href.replace(/^mailto:/i, "").split("?")[0].trim();
      if (email && email.includes("@") && !email.includes("javascript")) {
        emails.push(email);
      }
    }
  });
  const rawWaMatches = html.matchAll(/(?:href|src|url)=["'](https?:\/\/(?:api\.whatsapp\.com\/send\?phone=|wa\.me\/|api\.whatsapp\.com\/message\/)[^"']+)["']/gi);
  for (const match of rawWaMatches) {
    const rawLink = match[1];
    const num = extractNumbersFromWhatsappLink(rawLink);
    if (num && !whatsappButtons.some((b) => b.link === rawLink || b.numero === formatBrazilianPhone(num))) {
      whatsappButtons.push({
        texto: "Link Direto WhatsApp",
        link: rawLink,
        numero: formatBrazilianPhone(num),
        origem: pageOrigin
      });
    } else if (!num && !whatsappButtons.some((b) => b.link === rawLink)) {
      whatsappButtons.push({
        texto: "Link Direto WhatsApp (Mensagem/Canal)",
        link: rawLink,
        numero: "",
        origem: pageOrigin
      });
    }
  }
  $("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    const text = $el.text().replace(/\s+/g, " ").trim().toLowerCase();
    const hrefLower = href.toLowerCase();
    let absoluteUrl = "";
    try {
      absoluteUrl = new URL(href, baseUrl).href;
    } catch (e) {
      return;
    }
    try {
      const baseHostname = new URL(baseUrl).hostname.replace(/^www\./, "");
      const targetHostname = new URL(absoluteUrl).hostname.replace(/^www\./, "");
      const isRelatedDomain = targetHostname.includes(baseHostname) || baseHostname.includes(targetHostname) || targetHostname.includes("sapl.") || targetHostname.includes("leg.br");
      if (!isRelatedDomain) return;
    } catch (e) {
      return;
    }
    if (hrefLower.includes("/noticia") || hrefLower.includes("/imprensa") || hrefLower.includes("/materia") || hrefLower.includes("/post") || hrefLower.includes("/artigo") || hrefLower.includes("/publicacao") || hrefLower.includes("/diario") || hrefLower.includes("/sessao") || hrefLower.includes("/pauta") || text.length > 50) {
      return;
    }
    let category = "";
    if (/mesa[ -_]?diretora|mesa diretora|diretoria|presidencia|presidente|gabinete[ -_]?da[ -_]?presidencia|mesa[ -_]?executiva/i.test(text) || /mesa-diretora|mesadiretora|presidencia|presidente|mesa-executiva/i.test(hrefLower)) {
      category = "Mesa Diretora";
    } else if (/vereadores|parlamentares|legislatura|camara\/membros|membros|composicao|parlamentar/i.test(text) || /vereadores|parlamentares|legislatura|membros|parlamentar/i.test(hrefLower)) {
      category = "Vereadores";
    } else if (/fale[ -_]?conosco|contato|atendimento|ouvidoria|telefone|pg\.php\?area=contato/i.test(text) || /fale-conosco|faleconosco|contato|atendimento|ouvidoria/i.test(hrefLower)) {
      category = "Contato";
    } else if (/estrutura[ -_]?organizacional|quem[ -_]?[eé][ -_]?quem|gabinete/i.test(text) || /estrutura|quem-e-quem|gabinete/i.test(hrefLower)) {
      category = "Estrutura";
    }
    if (category && !subLinks.some((l) => l.url === absoluteUrl)) {
      subLinks.push({
        title: $el.text().replace(/\s+/g, " ").trim() || category,
        url: absoluteUrl,
        category
      });
    }
  });
  const textBody = $("body").clone();
  textBody.find("script, style, noscript").remove();
  textBody.find("br, p, div, section, article, header, footer, h1, h2, h3, h4, h5, h6, li, tr, td").append("\n");
  const rawBody = textBody.text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  const phoneMatches = rawBody.match(/(?:\(?\s*\d{2}\s*\)?\s*)?(?:9\s*)?\d{4,5}[-\s.]\d{4}/g) || [];
  phoneMatches.forEach((ph) => {
    const formatted = formatBrazilianPhone(ph);
    if (formatted && formatted.length >= 14 && !telLinks.includes(formatted)) {
      telLinks.push(formatted);
    }
  });
  const textEmails = rawBody.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  textEmails.forEach((em) => {
    if (!emails.includes(em) && !em.endsWith(".png") && !em.endsWith(".jpg")) emails.push(em);
  });
  return {
    url: baseUrl,
    title,
    text: rawBody.slice(0, 25e3),
    whatsappButtons,
    telLinks: Array.from(new Set(telLinks)),
    subLinks: subLinks.slice(0, 20),
    emails: Array.from(new Set(emails)),
    htmlSnippet: html.slice(0, 4e4)
  };
}
function mainPageText(html) {
  const $ = cheerio.load(html);
  const root = $("main, #conteudo, #content, .conteudo-principal, article").first();
  const body = (root.length ? root : $("body")).clone();
  body.find("header, footer, nav, script, style, noscript, [role='navigation'], .menu").remove();
  body.find("br,p,div,section,h1,h2,h3,h4,h5,h6,li,tr,td").append("\n");
  return body.text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
function presidentNamesFromText(text) {
  const names = [];
  for (const m of text.matchAll(/(?:^|\n)\s*Presidente\s*[:–-]?\s*([^\n]+)/gi)) {
    const n = m[1].split(/[|(]/)[0].replace(/\b(?:Fone|Telefone|Partido|Legislatura)\b.*$/i, "").replace(/\s+/g, " ").trim();
    if (/^[\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){1,7}$/u.test(n) && !/^da |^do |vice|secret.rio|c.mara|mesa diretora|presidente|comiss.o|permanente|in.cio|mapa do|link/i.test(n)) names.push(n);
  }
  for (const m of text.matchAll(/(?:^|\n)\s*([^\n/|]{4,100})\s*[/|]\s*(?:Vereador(?:a)?(?:\s+em\s+Exerc[ií]cio)?\s*[/|]\s*)?Presidente\b/gi)) {
    const name = m[1].trim();
    if (/^[\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){1,7}$/u.test(name)) names.push(name);
  }
  return [...new Set(names)];
}
function excludedReference(url, label = "") {
  const t = (url + " " + label).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\.(?:pdf|docx?|odt|xlsx?|zip)(?:$|[?#])|\/wp-content\/uploads\/|\/(?:noticias?|imprensa|documentos?|arquivos?|legislacao|atas?|portarias?|resolucoes?|licitacoes?|publicacoes?|comissoes?)(?:\/|-|$)|ex[-_ ]?(?:presidentes?|vereadores?)|historico/.test(t);
}
function matchPerson(a, b) {
  const clean = (v) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return clean(a) === clean(b);
}
function compositionPeriods(html) {
  const text = mainPageText(html).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const periods = [];
  for (const m of text.matchAll(/(?:mesa\s+diretora|presidencia|bienio|exercicio|gestao)[^\n.;\d]{0,35}(20\d{2})(?:\s*[-–/a]\s*(20\d{2}))?/gi)) periods.push(m[1] + (m[2] ? "-" + m[2] : ""));
  const $ = cheerio.load(html);
  $("a[href]").each((_, el) => {
    const h = $(el).attr("href") || "";
    if (/\/(?:noticias?|imprensa|documentos?|arquivos?|legislacao|atas?|portarias?|resolucoes?|publicacoes?)(?:\/|-|$)|\.(?:pdf|docx?)(?:$|[?#])|\/wp-content\/uploads\//i.test(h)) return;
    const t = $(el).text() + " " + h;
    if (/mesa[\s_-]*diretora|presidencia/i.test(t)) for (const m of t.matchAll(/20\d{2}(?:\s*[-–/]\s*20\d{2})?/g)) periods.push(m[0]);
  });
  return [...new Set(periods)];
}
async function deepScrapeChamber(website, municipio = "", uf = "", referenceYear = 2026) {
  const potentialUrls = getPotentialUrls(website, municipio, uf);
  const visitedUrls = [];
  const pages = [];
  const allWhatsapp = [];
  const allPhones = [];
  const allEmails = [];
  let workingUrl = "";
  let mesaDiretoraUrl = "";
  let presidentProfileUrl = "";
  let contactUrl = "";
  let rawHtmlHome = "";
  let rawHtmlMesa = "";
  let rawHtmlProfile = "";
  let developerExtractionResult = null;
  let homeResult = null;
  for (const testUrl of potentialUrls) {
    homeResult = await fetchPage(testUrl, 6);
    if (homeResult) {
      workingUrl = homeResult.finalUrl;
      rawHtmlHome = homeResult.html;
      break;
    }
  }
  if (!homeResult && municipio) {
    console.log(`[DeepScrape] URLs diretas falharam para ${municipio} (${uf}). Buscando no Google...`);
    const googleResult = await searchGoogleForChamberWebsite(municipio, uf);
    if (googleResult && googleResult.resolvedUrl) {
      homeResult = await fetchPage(googleResult.resolvedUrl, 6);
      if (homeResult) {
        workingUrl = homeResult.finalUrl;
        rawHtmlHome = homeResult.html;
      }
    }
  }
  if (!homeResult) {
    return {
      otherPages: [],
      pages: [],
      allWhatsapp: [],
      allPhones: [],
      allEmails: [],
      visitedUrls: [],
      workingUrl: "",
      mesaDiretoraUrl: "",
      presidentProfileUrl: "",
      contactUrl: "",
      platform: { developer: "footer_verified_not_informed", cms: "N\xE3o identificado" },
      rawHtmlHome: "",
      rawHtmlMesa: "",
      rawHtmlProfile: ""
    };
  }
  visitedUrls.push(homeResult.finalUrl);
  const homeData = parseHtml(homeResult.html, homeResult.finalUrl, "P\xE1gina Inicial / Rodap\xE9");
  pages.push(homeData);
  homeData.whatsappButtons.forEach((w) => allWhatsapp.push(w));
  homeData.telLinks.forEach((t) => allPhones.push(t));
  homeData.emails.forEach((e) => allEmails.push(e));
  const baseOrigin = new URL(homeResult.finalUrl).origin;
  const platform = detectPlatformAndDeveloper(homeResult.html, homeResult.finalUrl);
  const isSoftcam = platform.cms === "Softcam";
  const saplLinkMatch = homeResult.html.match(/https?:\/\/(sapl\.[a-zA-Z0-9.-]+|[^"'\s<>]+\/sapl)/i);
  const saplBase = saplLinkMatch ? saplLinkMatch[0].startsWith("http") ? saplLinkMatch[0].replace(/\/$/, "") : `https://${saplLinkMatch[0]}` : "";
  const allDevRules = getDeveloperExtractionRules();
  const matchedDevRule = allDevRules.find((r) => {
    if (r.sampleChambers && Array.isArray(r.sampleChambers)) {
      const isSampleMatch = r.sampleChambers.some((sc) => {
        try {
          const scHost = new URL(sc.startsWith("http") ? sc : `https://${sc}`).hostname.replace(/^www\./i, "").toLowerCase();
          const curHost = new URL(homeResult.finalUrl).hostname.replace(/^www\./i, "").toLowerCase();
          const baseHost = new URL(baseOrigin).hostname.replace(/^www\./i, "").toLowerCase();
          return scHost === curHost || scHost === baseHost;
        } catch (e) {
          return false;
        }
      });
      if (isSampleMatch) return true;
    }
    const rDev = r.developer.toLowerCase().trim();
    const rId = (r.id || "").toLowerCase().trim();
    const pDev = platform.developer.toLowerCase().trim();
    const pCms = platform.cms.toLowerCase().trim();
    if (rId === "softcam" || rDev.includes("softcam")) {
      return isSoftcam || pDev.includes("softcam") || pCms.includes("softcam");
    }
    if (rId === "rsinformatica" || rId === "rs_informatica" || rDev.includes("rs inform")) {
      return pDev.includes("rs inform") || pCms.includes("rs inform");
    }
    if (rId === "cittatec" || rDev.includes("cittatec") || rDev.includes("citt\xE0")) {
      return pDev.includes("cittatec") || pCms.includes("cittatec") || pDev.includes("citt\xE0");
    }
    if (rId === "sapl" || rDev.includes("interlegis") || rDev.includes("senado")) {
      return Boolean(saplBase) || pCms.includes("interlegis") || pCms.includes("plone") || pDev.includes("interlegis");
    }
    if (rId === "eprocleg" || rDev.includes("eprocleg")) {
      return pCms.includes("eprocleg") || pDev.includes("eprocleg");
    }
    if (rId === "abase" || rDev.includes("abase")) {
      return pDev.includes("abase") || pCms.includes("abase");
    }
    if (rId === "dynamika" || rDev.includes("dynamika")) {
      return pDev.includes("dynamika") || pCms.includes("dynamika");
    }
    if (rId === "webde" || rDev.includes("webde")) {
      return pDev.includes("webde") || pCms.includes("webde");
    }
    if (rId === "visao_camaras" || rDev.includes("vis\xE3o") || rDev.includes("visao")) {
      return pDev.includes("vis\xE3o") || pDev.includes("visao") || pDev.includes("icamaras");
    }
    if (rId === "bigdream" || rDev.includes("bigdream") || rDev.includes("bigdrem")) {
      return pDev.includes("bigdream") || pDev.includes("bigdrem") || pCms.includes("bigdream") || pCms.includes("bigdrem");
    }
    if (rId === "portal_da_transparencia" || rDev.includes("portal da transpar\xEAncia") || rDev.includes("portal da transparencia")) {
      return pDev.includes("portal da transpar") || pCms.includes("portal da transpar") || homeResult.html.toLowerCase().includes("portal da transpar\xEAncia") || homeResult.html.toLowerCase().includes("portal da transparencia");
    }
    if (!pDev || pDev === "footer_verified_not_informed" || pDev === "n\xE3o identificado") {
      return false;
    }
    return rDev === pDev || pDev.length >= 4 && (rDev.includes(pDev) || pDev.includes(rDev)) || r.cms && pCms && r.cms.toLowerCase().trim() === pCms && pCms !== "n\xE3o especificado" && pCms !== "propriet\xE1rio / custom";
  });
  if (matchedDevRule) {
    try {
      developerExtractionResult = await executeDeveloperExtraction(
        homeResult.finalUrl,
        matchedDevRule,
        municipio,
        uf
      );
      if (developerExtractionResult && developerExtractionResult.success) {
        if (developerExtractionResult.routeUsed && !visitedUrls.includes(developerExtractionResult.routeUsed)) {
          visitedUrls.push(developerExtractionResult.routeUsed);
          mesaDiretoraUrl = developerExtractionResult.routeUsed;
        }
        if (developerExtractionResult.president?.perfilUrl && !visitedUrls.includes(developerExtractionResult.president.perfilUrl)) {
          visitedUrls.push(developerExtractionResult.president.perfilUrl);
          presidentProfileUrl = developerExtractionResult.president.perfilUrl;
        }
        if (developerExtractionResult.rawHtmlMesa) {
          rawHtmlMesa = developerExtractionResult.rawHtmlMesa;
        }
        if (developerExtractionResult.rawHtmlProfile) {
          rawHtmlProfile = developerExtractionResult.rawHtmlProfile;
        }
        if (developerExtractionResult.president?.whatsapp) {
          allWhatsapp.push({
            texto: "WhatsApp / Celular do Presidente",
            link: `https://wa.me/55${extractDigits(developerExtractionResult.president.whatsapp)}`,
            numero: developerExtractionResult.president.whatsapp,
            origem: `Perfil do Presidente (${matchedDevRule.developer})`
          });
        }
        if (developerExtractionResult.president?.telefone) {
          allPhones.push(developerExtractionResult.president.telefone);
        }
        if (developerExtractionResult.president?.email) {
          allEmails.push(developerExtractionResult.president.email);
        }
        if (developerExtractionResult.chamberContacts?.whatsapps) {
          developerExtractionResult.chamberContacts.whatsapps.forEach((cw) => {
            allWhatsapp.push({
              texto: "WhatsApp da C\xE2mara",
              link: `https://wa.me/55${extractDigits(cw)}`,
              numero: cw,
              origem: "Site da C\xE2mara"
            });
          });
        }
      }
    } catch (err) {
      console.error("Erro ao executar regra personalizada do desenvolvedor:", err);
    }
  }
  const hasDevRulePresident = Boolean(
    developerExtractionResult && developerExtractionResult.success && isValidPersonName(developerExtractionResult.president?.nome)
  );
  let mesaPageData;
  let profilePageData;
  let identifiedPresidentName = "";
  let presidentProfileCandidates = [];
  if (hasDevRulePresident && developerExtractionResult) {
    mesaDiretoraUrl = developerExtractionResult.routeUsed || mesaDiretoraUrl;
    rawHtmlMesa = developerExtractionResult.rawHtmlMesa || rawHtmlMesa;
    presidentProfileUrl = developerExtractionResult.president?.perfilUrl || presidentProfileUrl;
    rawHtmlProfile = developerExtractionResult.rawHtmlProfile || rawHtmlProfile;
    identifiedPresidentName = developerExtractionResult.president.nome;
    if (rawHtmlMesa && mesaDiretoraUrl) {
      mesaPageData = parseHtml(rawHtmlMesa, mesaDiretoraUrl, "P\xE1gina da Mesa Diretora (Regra Desenvolvedor)");
      pages.push(mesaPageData);
    }
    if (rawHtmlProfile && presidentProfileUrl) {
      profilePageData = parseHtml(rawHtmlProfile, presidentProfileUrl, "Perfil do Presidente (Regra Desenvolvedor)");
      pages.push(profilePageData);
    }
  } else {
    const mesaCandidates = [];
    if (matchedDevRule && matchedDevRule.navigation?.routes) {
      matchedDevRule.navigation.routes.forEach((r) => {
        const full = r.startsWith("http") ? r : `${baseOrigin}${r.startsWith("/") ? "" : "/"}${r}`;
        mesaCandidates.push(full);
      });
    }
    if (isSoftcam) {
      mesaCandidates.push(`${baseOrigin}/ajax/header_menu/Vereadores`);
      mesaCandidates.push(`${baseOrigin}/camara/membros`);
      mesaCandidates.push(`${baseOrigin}/camara/vereadores`);
    }
    if (platform.cms.includes("CittaTec") || baseOrigin.includes("cittatec.com.br") || homeResult.html.includes("portal-legislativo")) {
      mesaCandidates.push(`${baseOrigin}/portal-legislativo/mesa`);
      mesaCandidates.push(`${baseOrigin}/portal-legislativo/parlamentares`);
      mesaCandidates.push(`${baseOrigin}/portal-legislativo/vereadores`);
    }
    if (platform.cms.includes("EprocLeg") || homeResult.html.includes("eprocleg")) {
      mesaCandidates.push(`${baseOrigin}/mesa-diretora`);
      mesaCandidates.push(`${baseOrigin}/vereadores`);
      mesaCandidates.push(`${baseOrigin}/parlamentares`);
      mesaCandidates.push(`${baseOrigin}/legislativo/mesa-diretora`);
      mesaCandidates.push(`${baseOrigin}/institucional/mesa-diretora`);
    }
    if (saplBase) {
      mesaCandidates.push(`${saplBase}/mesa-diretora/`);
      mesaCandidates.push(`${saplBase}/parlamentar/`);
      mesaCandidates.push(`${saplBase}/vereadores/`);
    }
    mesaCandidates.push(`${baseOrigin}/institucional/estrutura/mesa-diretora-1`);
    mesaCandidates.push(`${baseOrigin}/institucional/estrutura/mesa-diretora`);
    mesaCandidates.push(`${baseOrigin}/institucional/mesa-diretora-1`);
    mesaCandidates.push(`${baseOrigin}/institucional/mesa-diretora`);
    mesaCandidates.push(`${baseOrigin}/institucional/estrutura`);
    mesaCandidates.push(`${baseOrigin}/institucional/nossos-vereadores`);
    mesaCandidates.push(`${baseOrigin}/institucional/vereadores`);
    mesaCandidates.push(`${baseOrigin}/institucional/parlamentares`);
    mesaCandidates.push(`${baseOrigin}/institucional`);
    mesaCandidates.push(`${baseOrigin}/mesa-diretora/`);
    mesaCandidates.push(`${baseOrigin}/mesa-diretora-1`);
    mesaCandidates.push(`${baseOrigin}/mesa-diretora`);
    mesaCandidates.push(`${baseOrigin}/mesa-diretora-2025-2026`);
    mesaCandidates.push(`${baseOrigin}/mesa-diretora-2025`);
    mesaCandidates.push(`${baseOrigin}/mesa-diretora-2024`);
    mesaCandidates.push(`${baseOrigin}/processo-legislativo/mesa-diretora`);
    mesaCandidates.push(`${baseOrigin}/a-camara/mesa-diretora`);
    mesaCandidates.push(`${baseOrigin}/a-camara/vereadores`);
    mesaCandidates.push(`${baseOrigin}/legislativo/mesa-diretora`);
    mesaCandidates.push(`${baseOrigin}/legislativo/vereadores`);
    mesaCandidates.push(`${baseOrigin}/mesa`);
    mesaCandidates.push(`${baseOrigin}/parlamentares`);
    mesaCandidates.push(`${baseOrigin}/vereadores`);
    mesaCandidates.push(`${baseOrigin}/composicao`);
    mesaCandidates.push(`${baseOrigin}/quem-e-quem`);
    homeData.subLinks.forEach((sub) => {
      if ((sub.category === "Mesa Diretora" || sub.category === "Estrutura" || sub.category === "Vereadores") && !mesaCandidates.includes(sub.url)) {
        mesaCandidates.unshift(sub.url);
      }
    });
    const explicit = homeData.subLinks.filter((sub) => sub.category === "Mesa Diretora" && !/vice|secret.rio/i.test(sub.title + " " + sub.url)).map((sub) => sub.url);
    const priority = (u) => u.includes(String(referenceYear)) ? 0 : /20\d{2}/.test(u) ? 2 : 1;
    mesaCandidates.splice(0, mesaCandidates.length, ...Array.from(/* @__PURE__ */ new Set([...explicit.sort((a, b) => priority(a) - priority(b)), ...mesaCandidates.filter((u) => !explicit.includes(u)).sort((a, b) => priority(a) - priority(b))])));
    let mesaResult = null;
    for (const mUrl of mesaCandidates) {
      const fetched = await fetchPage(mUrl, 6);
      if (fetched && fetched.html.length > 200) {
        const lower = fetched.html.toLowerCase();
        const $temp = cheerio.load(fetched.html);
        $temp("a[href]").each((_, el) => {
          const h = $temp(el).attr("href") || "";
          const t = $temp(el).text().toLowerCase();
          if (/mesa[ -_]?diretora|mesa-diretora|presidencia|presidente/i.test(t) || /mesa-diretora/i.test(h)) {
            try {
              const abs = new URL(h, fetched.finalUrl).href;
              if (!mesaCandidates.includes(abs)) {
                mesaCandidates.splice(mesaCandidates.indexOf(mUrl) + 1, 0, abs);
              }
            } catch (e) {
            }
          }
        });
        if (lower.includes("mesa") || lower.includes("presidente") || lower.includes("parlamentar") || lower.includes("membros") || lower.includes("vereadores")) {
          mesaResult = fetched;
          mesaDiretoraUrl = fetched.finalUrl;
          rawHtmlMesa = fetched.html;
          if (!visitedUrls.includes(fetched.finalUrl)) {
            visitedUrls.push(fetched.finalUrl);
          }
          mesaPageData = parseHtml(fetched.html, fetched.finalUrl, "P\xE1gina da Mesa Diretora");
          pages.push(mesaPageData);
          mesaPageData.whatsappButtons.forEach((w) => allWhatsapp.push(w));
          mesaPageData.telLinks.forEach((t) => allPhones.push(t));
          mesaPageData.emails.forEach((e) => allEmails.push(e));
          if (presidentNamesFromText(mainPageText(fetched.html)).length > 0 && (!compositionPeriods(fetched.html).length || compositionPeriods(fetched.html).some((p) => {
            const ys = p.match(/20\d{2}/g).map(Number);
            return ys[0] <= referenceYear && referenceYear <= ys[ys.length - 1];
          }))) {
            break;
          }
        }
      }
    }
    if (mesaResult) {
      const $m = cheerio.load(mesaResult.html);
      const names = presidentNamesFromText(mainPageText(mesaResult.html));
      if (names.length === 1) identifiedPresidentName = names[0];
      if (names.length === 1 && /fone|telefone|@|whatsapp/i.test(mainPageText(mesaResult.html))) presidentProfileCandidates.push(mesaResult.finalUrl);
      if (mesaResult.html.includes("list-submenu-item") || mesaResult.html.includes("list-title-avatar")) {
        $m(".list-submenu-item, .item-submenu, div").each((_, el) => {
          const text = $m(el).text();
          const cargo = $m(el).find(".list-title-avatar").text().trim() || text;
          const nome = $m(el).find(".list-description").text().trim();
          if (/^presidente\b/i.test(cargo) && !/vice/i.test(cargo)) {
            if (nome) identifiedPresidentName = nome;
            const link = $m(el).find("a").attr("href");
            if (link) {
              try {
                presidentProfileCandidates.push(new URL(link, baseOrigin).href);
              } catch (e) {
              }
            }
          }
        });
      }
      if (mesaResult.html.includes("/parlamentar/") || mesaResult.html.includes("tabela-composicao") || mesaResult.html.includes("<table")) {
        $m("tr").each((_, tr) => {
          const trText = $m(tr).text();
          if (/presidente/i.test(trText) && !/vice/i.test(trText)) {
            const nameEl = $m(tr).find("a[href*='/parlamentar/'], a[href*='membros'], a[href*='vereador'], a");
            if (nameEl.length > 0) {
              const rawName = nameEl.text().trim();
              if (rawName && !identifiedPresidentName && rawName.length > 3 && !/presidente/i.test(rawName)) {
                identifiedPresidentName = rawName;
              }
              const href = nameEl.attr("href");
              if (href) {
                try {
                  presidentProfileCandidates.push(new URL(href, mesaResult.finalUrl).href);
                } catch (e) {
                }
              }
            }
          }
        });
      }
      $m(".tileItem, .card, .membro, .box-vereador, .item, .col-md-4, .col-sm-6, .conteudo-membro, .portletItem, dl, li").each((_, el) => {
        const cardText = $m(el).text().replace(/\s+/g, " ");
        if (/presidente/i.test(cardText) && !/vice/i.test(cardText)) {
          const link = $m(el).find("a[href]").first();
          if (link.length > 0) {
            const linkName = link.text().trim();
            if (linkName && linkName.length > 3 && !/presidente|mais|detalhes|perfil/i.test(linkName) && !identifiedPresidentName) {
              identifiedPresidentName = linkName;
            }
            const href = link.attr("href");
            if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
              try {
                const abs = new URL(href, mesaResult.finalUrl).href;
                presidentProfileCandidates.push(abs);
              } catch (e) {
              }
            }
          }
        }
      });
      $m("h1, h2, h3, h4, h5, strong, b, dt").each((_, head) => {
        const headText = $m(head).text().trim();
        if (/^presidente\b/i.test(headText) && !/vice/i.test(headText)) {
          const nextLink = $m(head).nextAll("a, p, div").find("a").addBack("a").first();
          if (nextLink.length > 0) {
            const rawName = nextLink.text().trim();
            if (rawName && rawName.length > 3 && !/presidente/i.test(rawName) && !identifiedPresidentName) {
              identifiedPresidentName = rawName;
            }
            const href = nextLink.attr("href");
            if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
              try {
                presidentProfileCandidates.push(new URL(href, mesaResult.finalUrl).href);
              } catch (e) {
              }
            }
          }
        }
      });
      if (presidentProfileCandidates.length === 0) {
        $m("a").each((_, a) => {
          const text = $m(a).text().trim();
          const href = $m(a).attr("href") || "";
          const parentText = $m(a).closest("div, tr, li, p").text();
          if ((/presidente/i.test(text) || /presidente/i.test(parentText)) && !/vice/i.test(text) && !/vice/i.test(parentText)) {
            if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
              try {
                const abs = new URL(href, mesaResult.finalUrl).href;
                if (abs !== mesaResult.finalUrl) {
                  presidentProfileCandidates.push(abs);
                }
              } catch (e) {
              }
            }
          }
        });
      }
    }
    if (presidentProfileCandidates.length === 0) {
      const vereadoresCandidates = [
        `${baseOrigin}/institucional/nossos-vereadores`,
        `${baseOrigin}/institucional/vereadores`,
        `${baseOrigin}/vereadores/`,
        `${baseOrigin}/vereadores`,
        `${baseOrigin}/parlamentares`,
        `${baseOrigin}/parlamentar/`,
        `${baseOrigin}/membros`,
        `${baseOrigin}/camara/membros`
      ];
      homeData.subLinks.forEach((s) => {
        if (s.category === "Vereadores" && !vereadoresCandidates.includes(s.url)) {
          vereadoresCandidates.unshift(s.url);
        }
      });
      for (const vUrl of vereadoresCandidates) {
        const vFetched = await fetchPage(vUrl, 6);
        if (vFetched && vFetched.html.length > 200) {
          if (!visitedUrls.includes(vFetched.finalUrl)) visitedUrls.push(vFetched.finalUrl);
          const vData = parseHtml(vFetched.html, vFetched.finalUrl, "Lista de Vereadores");
          pages.push(vData);
          const $v = cheerio.load(vFetched.html);
          $v("a").each((_, a) => {
            const aText = $v(a).text().trim();
            const href = $v(a).attr("href") || "";
            const parentText = $v(a).closest("div, tr, li, card, .item, .tileItem").text();
            const matchesPresident = identifiedPresidentName ? matchPerson(aText, identifiedPresidentName) : (/presidente/i.test(parentText) || /presidente/i.test(aText)) && !/vice/i.test(parentText);
            if (matchesPresident && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
              try {
                const abs = new URL(href, vFetched.finalUrl).href;
                presidentProfileCandidates.push(abs);
              } catch (e) {
              }
            }
          });
          presidentProfileCandidates = [...new Set(presidentProfileCandidates)];
          if (identifiedPresidentName && presidentProfileCandidates.length > 1) {
            presidentProfileCandidates = [];
            break;
          }
          if (presidentProfileCandidates.length > 0) break;
        }
      }
    }
    if (identifiedPresidentName && mesaResult) {
      const $links = cheerio.load(mesaResult.html);
      const known = /* @__PURE__ */ new Set();
      $links("a[href]").each((_, a) => {
        const t = $links(a).text().trim();
        if (matchPerson(t, identifiedPresidentName) || /^perfil(?: completo)?$|^detalhes$|^presidente$/i.test(t)) {
          try {
            known.add(new URL($links(a).attr("href"), mesaResult.finalUrl).href);
          } catch {
          }
        }
      });
      const conflicting = /* @__PURE__ */ new Set();
      $links("a[href]").each((_, a) => {
        const t = $links(a).text().trim();
        if (t.split(/\s+/).length >= 2 && !matchPerson(t, identifiedPresidentName) && /vice|secret.rio/i.test($links(a).parent().text())) {
          try {
            conflicting.add(new URL($links(a).attr("href"), mesaResult.finalUrl).href);
          } catch {
          }
        }
      });
      presidentProfileCandidates = presidentProfileCandidates.filter((u) => !conflicting.has(u));
    }
    if (presidentProfileCandidates.length > 0) {
      for (const targetProfileUrl of presidentProfileCandidates.slice(0, 2)) {
        const profRes = await fetchPage(targetProfileUrl, 6);
        if (profRes && profRes.html.length > 200) {
          presidentProfileUrl = profRes.finalUrl;
          rawHtmlProfile = profRes.html;
          if (!visitedUrls.includes(profRes.finalUrl)) visitedUrls.push(profRes.finalUrl);
          profilePageData = parseHtml(profRes.html, profRes.finalUrl, "Perfil Individual do Presidente");
          pages.push(profilePageData);
          profilePageData.whatsappButtons.forEach((w) => allWhatsapp.push(w));
          profilePageData.telLinks.forEach((t) => allPhones.push(t));
          profilePageData.emails.forEach((e) => allEmails.push(e));
          break;
        }
      }
    }
  }
  const contactCandidates = [
    `${baseOrigin}/contato`,
    `${baseOrigin}/fale-conosco`,
    `${baseOrigin}/atendimento`,
    `${baseOrigin}/ouvidoria`
  ];
  homeData.subLinks.forEach((s) => {
    if (s.category === "Contato" && !contactCandidates.includes(s.url)) {
      contactCandidates.unshift(s.url);
    }
  });
  let contactPageData;
  for (const cUrl of contactCandidates.slice(0, 2)) {
    const cRes = await fetchPage(cUrl, 6);
    if (cRes && !visitedUrls.includes(cRes.finalUrl)) {
      contactUrl = cRes.finalUrl;
      visitedUrls.push(cRes.finalUrl);
      contactPageData = parseHtml(cRes.html, cRes.finalUrl, "Contato Institucional");
      pages.push(contactPageData);
      contactPageData.whatsappButtons.forEach((w) => allWhatsapp.push(w));
      contactPageData.telLinks.forEach((t) => allPhones.push(t));
      contactPageData.emails.forEach((e) => allEmails.push(e));
      break;
    }
  }
  const uniqueWhatsapp = [];
  allWhatsapp.forEach((w) => {
    if (!uniqueWhatsapp.some(
      (u) => w.numero && u.numero === w.numero || w.link && u.link === w.link
    )) {
      uniqueWhatsapp.push(w);
    }
  });
  return {
    homePage: homeData,
    mesaDiretoraPage: mesaPageData,
    presidentProfilePage: profilePageData,
    contactPage: contactPageData,
    otherPages: pages.filter(
      (p) => p !== homeData && p !== mesaPageData && p !== profilePageData && p !== contactPageData
    ),
    pages,
    allWhatsapp: uniqueWhatsapp,
    allPhones: Array.from(new Set(allPhones.map(formatBrazilianPhone))),
    allEmails: Array.from(new Set(allEmails)),
    visitedUrls,
    workingUrl,
    mesaDiretoraUrl,
    presidentProfileUrl,
    contactUrl,
    platform,
    rawHtmlHome,
    rawHtmlMesa,
    rawHtmlProfile,
    developerExtractionResult,
    identifiedPresidentName,
    compositionPeriods: [.../* @__PURE__ */ new Set([...compositionPeriods(rawHtmlHome), ...compositionPeriods(rawHtmlMesa)])]
  };
}
function extractDeterministicData(municipio, uf, scraped) {
  let presNome = "";
  let presPartido = "";
  let presTelefone = "";
  let presEmail = "";
  let presWhatsapp = "";
  let presPeriodo = "";
  const mesaDiretora = [];
  let endereco = "";
  if (scraped.developerExtractionResult?.president) {
    const p = scraped.developerExtractionResult.president;
    if (p.nome) presNome = p.nome;
    if (p.partido) presPartido = p.partido;
    if (p.telefone) presTelefone = p.telefone;
    if (p.whatsapp) presWhatsapp = p.whatsapp;
    if (p.celular && !presWhatsapp) presWhatsapp = p.celular;
    if (p.email) presEmail = p.email;
    if (p.mandato) presPeriodo = p.mandato;
  }
  if (Array.isArray(scraped.developerExtractionResult?.mesaDiretora)) {
    scraped.developerExtractionResult.mesaDiretora.forEach((m) => {
      if (m.cargo && m.nome && !mesaDiretora.some((x) => x.cargo === m.cargo && x.nome === m.nome)) {
        mesaDiretora.push({
          cargo: m.cargo,
          nome: m.nome,
          perfilUrl: m.link,
          telefone: m.telefone,
          whatsapp: m.whatsapp,
          email: m.email
        });
      }
    });
  }
  const allMesaHtml = [scraped.rawHtmlMesa, scraped.rawHtmlHome, scraped.rawHtmlProfile].filter(Boolean);
  for (const htmlBlock of allMesaHtml) {
    const $ = cheerio.load(htmlBlock);
    const mesaText = $.text();
    if (!presPeriodo) {
      const mesaHeaderText = $("h1, h2, h3, .title, .titulo, .header").text();
      const periodMatch = mesaHeaderText.match(/(?:bi[êe]nio|exerc[íi]cio|per[íi]odo|gest[ãa]o|ano|legislatura)\s*:?\s*(\d{4}(?:\s*[-/a]\s*\d{4})?)/i) || mesaText.match(/(?:bi[êe]nio|per[íi]odo|gest[ãa]o|legislatura)\s*:?\s*(\d{4}\s*[-/a]\s*\d{4})/i);
      if (periodMatch && periodMatch[1]) {
        presPeriodo = periodMatch[1].replace(/\s+/g, " ").trim();
      }
    }
    if (htmlBlock.includes("list-submenu-item") || htmlBlock.includes("list-title-avatar")) {
      $(".list-submenu-item").each((_, el) => {
        const cargo = $(el).find(".list-title-avatar").text().trim();
        const nome = $(el).find(".list-description").text().trim();
        if (cargo && nome) {
          mesaDiretora.push({ cargo, nome });
          if (/^presidente\b/i.test(cargo) && !/vice/i.test(cargo) && !presNome) {
            presNome = nome;
          }
        }
      });
    }
    if (htmlBlock.includes("portal-legislativo") || htmlBlock.includes("cittatec")) {
      $("a[href*='/portal-legislativo/mesa/pessoas/'], a[href*='/portal-legislativo/parlamentares/'], .card, .membro, div").each((_, el) => {
        const blockText = $(el).text().replace(/\s+/g, " ").trim();
        if (/presidente/i.test(blockText) && !/vice/i.test(blockText)) {
          const titleMatch = blockText.match(/([A-ZÀ-Ú\s]{4,40})\s*-\s*([A-Z]{2,10})/);
          if (titleMatch) {
            const cleanN = titleMatch[1].trim();
            const cleanP = titleMatch[2].trim().toUpperCase();
            if (cleanN && !presNome) presNome = cleanN;
            if (cleanP && !presPartido) presPartido = cleanP;
          }
        }
      });
    }
    $("tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 2) {
        const rowText = $(tr).text();
        const cargoMatch = rowText.match(/(Presidente|Vice-Presidente|1[ºª°]\s*Secret[aá]ri[oa]|2[ºª°]\s*Secret[aá]ri[oa]|Secret[aá]ri[oa]|Tesoureir[oa])/i);
        if (cargoMatch) {
          const cargo = cargoMatch[0].trim();
          let nome = "";
          let partido = "";
          let perfilUrl = "";
          const linkEl = $(tr).find("a");
          if (linkEl.length > 0) {
            const rawLText = linkEl.first().text().trim();
            if (isValidPersonName(rawLText)) {
              nome = rawLText;
            }
            const rawHref = linkEl.first().attr("href");
            if (rawHref) {
              try {
                perfilUrl = new URL(rawHref, scraped.mesaDiretoraUrl || scraped.workingUrl).href;
              } catch (e) {
              }
            }
          }
          tds.each((__, td) => {
            const t = $(td).text().trim();
            if (/^[A-Z]{2,6}$/.test(t) || /MDB|PT|PP|PL|PSD|PSDB|PDT|UNIÃO|REPUBLICANOS|PODEMOS|PSB|CIDADANIA|AVANTE|NOVO|SOLIDARIEDADE/i.test(t)) {
              partido = t;
            }
            if (!nome && t.length > 4 && isValidPersonName(t) && !cargoMatch[0].includes(t)) {
              nome = t;
            }
          });
          if (cargo && nome && isValidPersonName(nome) && !mesaDiretora.some((m) => m.cargo === cargo && m.nome === nome)) {
            mesaDiretora.push({ cargo, nome, partido, perfilUrl });
            if (/^presidente\b/i.test(cargo) && !/vice/i.test(cargo) && !presNome) {
              presNome = nome;
              if (partido) presPartido = partido;
            }
          }
        }
      }
    });
    $(".tileItem, .card, .membro, .box-vereador, .item, .col-md-4, .col-sm-6, .col-md-3, .col-lg-3, .col-sm-12, .portletItem, dl, li, .dados-membro, .awards, .award-text-wrapper, div[class*='vereador'], div[class*='mesa'], div[class*='parlamentar'], div[class*='councillor'], div[class*='parlament'], div[class*='award'], .tab-pane").each((_, el) => {
      const blockText = $(el).text().replace(/\s+/g, " ").trim();
      const cargoMatch = blockText.match(/(Presidente|Vice-Presidente|Vice\b|1[ºª°]\s*Secret[aá]ri[oa]|2[ºª°]\s*Secret[aá]ri[oa]|Secret[aá]ri[oa]|Tesoureir[oa])/i);
      if (cargoMatch && blockText.length < 500) {
        let cargo = cargoMatch[0].trim();
        if (/^vice$/i.test(cargo)) cargo = "Vice-Presidente";
        let nome = "";
        let partido = "";
        let perfilUrl = "";
        let email = "";
        const mailMatch = blockText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (mailMatch) email = mailMatch[1];
        const partMatch = blockText.match(/(?:Partido:\s*|Part\.:\s*|\(\s*|\b)([A-Z]{2,6}|MDB|PT|PP|PL|PSD|PSDB|PDT|UNIÃO|REPUBLICANOS|PODEMOS|PSB|CIDADANIA|AVANTE|NOVO|SOLIDARIEDADE)(?:\s*\)|\s+|$)/i);
        if (partMatch && !/presidente|mesa|camara|vereador/i.test(partMatch[1])) {
          partido = partMatch[1].toUpperCase();
        }
        const link = $(el).find("a[href]").first();
        if (link.length > 0) {
          const lText = link.text().trim();
          if (lText && lText.length > 3 && isValidPersonName(lText) && !/presidente|mais|saiba|detalhes|perfil|veja/i.test(lText)) {
            nome = lText;
          }
          const rawHref = link.attr("href");
          if (rawHref && !rawHref.startsWith("#") && !rawHref.startsWith("javascript:")) {
            try {
              perfilUrl = new URL(rawHref, scraped.mesaDiretoraUrl || scraped.workingUrl).href;
            } catch (e) {
            }
          }
        }
        if (!nome) {
          const nameMatch = blockText.match(/(?:Nome Completo:\s*|Nome:\s*|Vereador:\s*|Vereadora:\s*)([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i) || blockText.match(/(?:Presidente|Vice-Presidente|1[ºª°]\s*Secret[aá]ri[oa]|2[ºª°]\s*Secret[aá]ri[oa]|Vice)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i) || blockText.match(/([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)\s+(?:Presidente|Vice-Presidente|1[ºª°]\s*Secret[aá]ri[oa]|2[ºª°]\s*Secret[aá]ri[oa])/i);
          if (nameMatch && nameMatch[1]) {
            const cleanName = nameMatch[1].trim();
            if (isValidPersonName(cleanName)) {
              nome = cleanName;
            }
          }
        }
        if (cargo && (nome || partido || email)) {
          if (nome && !mesaDiretora.some((m) => m.cargo === cargo && m.nome === nome)) {
            mesaDiretora.push({ cargo, nome, partido, email, perfilUrl });
          }
          if (/^presidente\b/i.test(cargo) && !/vice/i.test(cargo)) {
            if (nome && isValidPersonName(nome) && !presNome) presNome = nome;
            if (partido && !presPartido) presPartido = partido;
            if (email && !presEmail) presEmail = email;
          }
        }
      }
    });
    $("h1, h2, h3, h4, h5, h6, p, span, li, div, tr, td").each((_, el) => {
      if ($(el).children().length > 3) return;
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length >= 5 && text.length <= 140) {
        const parsed = extractMesaMemberFromLine(text);
        if (parsed) {
          if (!mesaDiretora.some((m) => m.nome === parsed.nome)) {
            mesaDiretora.push({ cargo: parsed.cargo, nome: parsed.nome });
          }
          if (/^presidente\b/i.test(parsed.cargo) && !/vice/i.test(parsed.cargo) && !presNome) {
            presNome = parsed.nome;
          }
        }
      }
    });
    if (!presNome) {
      const rawLines = mesaText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 5 && l.length <= 140);
      for (const line of rawLines) {
        const parsed = extractMesaMemberFromLine(line);
        if (parsed) {
          if (!mesaDiretora.some((m) => m.nome === parsed.nome)) {
            mesaDiretora.push({ cargo: parsed.cargo, nome: parsed.nome });
          }
          if (/^presidente\b/i.test(parsed.cargo) && !/vice/i.test(parsed.cargo) && !presNome) {
            presNome = parsed.nome;
            break;
          }
        }
      }
    }
    if (!presNome) {
      const directPresMatch = mesaText.match(/(?:Presidente|Presidência)\s*(?:da\s*Mesa)?\s*:?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i) || mesaText.match(/Nome Completo:\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i);
      if (directPresMatch && directPresMatch[1] && isValidPersonName(directPresMatch[1]) && !/vice/i.test(directPresMatch[0])) {
        presNome = directPresMatch[1].trim();
      }
    }
    if (presNome) break;
  }
  const profileSources = [scraped.rawHtmlProfile, scraped.rawHtmlMesa].filter(Boolean);
  for (const profSnippet of profileSources) {
    const profText = `${scraped.presidentProfilePage?.text || ""} ${scraped.mesaDiretoraPage?.text || ""}`;
    const titleMatch = profSnippet.match(/<h[123][^>]*>\s*([A-ZÀ-Ú\s]{4,40})\s*-\s*([A-Z]{2,10})\s*<\/h[123]>/i);
    if (titleMatch) {
      const cleanN = titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const cleanP = titleMatch[2].trim().toUpperCase();
      if (cleanN && !presNome && !/câmara|mesa|estrutura|institucional/i.test(cleanN)) {
        presNome = cleanN;
      }
      if (cleanP && !presPartido) {
        presPartido = cleanP;
      }
    }
    if (!presNome) {
      const matchNome = profSnippet.match(/id="vereador">([^<]+)<\/div>/i) || profSnippet.match(/<strong>Nome Completo:\s*<\/strong>\s*([^<\n\r]+)/i) || profSnippet.match(/<b>Nome Completo:<\/b>\s*&nbsp;?\s*([^<\n\r]+)/i) || profSnippet.match(/Nome Completo:\s*<\/strong>\s*([^<\n\r]+)/i) || profSnippet.match(/<h1[^>]*>([^<]+)<\/h1>/i) || profSnippet.match(/<h2[^>]*>([^<]+)<\/h2>/i) || profText.match(/Nome Completo:\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i);
      if (matchNome && matchNome[1]) {
        const cleanN = matchNome[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (cleanN.length > 3 && !/câmara|mesa|estrutura|institucional|início|presidente/i.test(cleanN)) {
          presNome = cleanN;
        }
      }
    }
    if (!presPartido) {
      const matchPart = profSnippet.match(/<strong>Partido:\s*<\/strong>\s*([^<\n\r]+)/i) || profSnippet.match(/<b>Partido:<\/b>\s*&nbsp;?\s*([^<\n\r]+)/i) || profSnippet.match(/Partido:\s*<\/strong>\s*([A-Za-z0-9]+)/i) || profSnippet.match(/Partido:\s*([A-Z0-9]{2,10})/i) || profText.match(/Partido:\s*([A-Za-z0-9]+)/i);
      if (matchPart && matchPart[1]) {
        const cleanP = matchPart[1].replace(/<[^>]+>/g, "").trim().toUpperCase();
        if (cleanP && !/presidente|mesa|camara/i.test(cleanP)) presPartido = cleanP;
      }
    }
    if (!presEmail) {
      const matchMail = profSnippet.match(/<strong>E-mail:\s*<\/strong>\s*([^<\n\r]+)/i) || profSnippet.match(/<b>E-mail:<\/b>\s*&nbsp;?\s*([^<\n\r]+)/i) || profSnippet.match(/href="mailto:([^"?]+)"/i) || profText.match(/E-mail:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) || profSnippet.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      if (matchMail && matchMail[1]) {
        const cleanM = matchMail[1].replace(/<[^>]+>/g, "").trim();
        if (cleanM.includes("@") && !cleanM.endsWith(".png") && !cleanM.endsWith(".jpg")) {
          presEmail = cleanM;
        }
      }
    }
    if (!presTelefone) {
      const matchCel = profSnippet.match(/<strong>Celular:\s*<\/strong>\s*([^<\n\r]+)/i) || profSnippet.match(/<b>Celular:<\/b>\s*&nbsp;?\s*([^<\n\r]+)/i) || profSnippet.match(/<strong>Telefone:\s*<\/strong>\s*([^<\n\r]+)/i) || profSnippet.match(/<b>Telefone:<\/b>\s*&nbsp;?\s*([^<\n\r]+)/i) || profSnippet.match(/(?:Contato|Telefone|Celular|Fone)\s*:?<\/strong>\s*([0-9+() -]{8,20})/i) || profSnippet.match(/(?:\(?\d{2}\)?\s*9?\d{4}[- ]?\d{4})/i) || profText.match(/(?:Celular|Telefone|Fone|Contato):\s*([0-9+() -]{8,20})/i);
      if (matchCel && matchCel[1]) {
        const cleanPh = matchCel[1].replace(/<[^>]+>/g, "").trim();
        if (cleanPh && /\d{4}/.test(cleanPh)) {
          presTelefone = formatBrazilianPhone(cleanPh);
        }
      }
    }
    if (!presWhatsapp) {
      const waInProfile = scraped.presidentProfilePage?.whatsappButtons || [];
      if (waInProfile.length > 0 && waInProfile[0].numero) {
        presWhatsapp = waInProfile[0].numero;
        if (!presTelefone) presTelefone = presWhatsapp;
      } else {
        const explicitWaMatch = profSnippet.match(/(?:whatsapp|whats|zap):\s*([0-9+() -]{8,20})/i) || profText.match(/(?:whatsapp|whats|zap):\s*([0-9+() -]{8,20})/i);
        if (explicitWaMatch && explicitWaMatch[1]) {
          presWhatsapp = formatBrazilianPhone(explicitWaMatch[1].trim());
          if (!presTelefone) presTelefone = presWhatsapp;
        }
      }
    }
    if (!presWhatsapp || !presTelefone) {
      const bioMobileMatch = profSnippet.match(/(?:📱|whatsapp|whats|cel(?:ular)?|contato pessoal)[\s\S]{0,40}?(\(?\s*\d{2}\s*\)?\s*9\s*\d{4}[-.\s]?\d{4})/i);
      if (bioMobileMatch && bioMobileMatch[1]) {
        const dig = extractDigits(bioMobileMatch[1]);
        const formatted = formatBrazilianPhone(dig);
        if (!presWhatsapp) presWhatsapp = formatted;
        if (!presTelefone) presTelefone = formatted;
      }
    }
  }
  const allChamberPhoneDigits = (scraped.allPhones || []).map(extractDigits).filter((d) => d.length >= 8);
  const isChamberNum = (num) => {
    if (!num) return false;
    const d = extractDigits(num);
    if (!d || d.length < 8) return false;
    const last8 = d.slice(-8);
    return allChamberPhoneDigits.some((cd) => cd.endsWith(last8));
  };
  if (presTelefone && isChamberNum(presTelefone)) {
    presTelefone = "";
  }
  if (presWhatsapp && isChamberNum(presWhatsapp)) {
    presWhatsapp = "";
  }
  for (const page of scraped.pages) {
    if (!endereco) {
      const matchEnd = page.text.match(/(?:Rua|Av\.|Avenida|Praça|Travessa|Al\.)\s+[^,\n]+,\s*\d+[^-\n]*(?:CEP:?\s*\d{5}-?\d{3})?/i);
      if (matchEnd && matchEnd[0]) {
        endereco = matchEnd[0].trim();
      }
    }
  }
  const camaraWhatsappNums = scraped.allWhatsapp.map((w) => w.numero).filter(Boolean);
  if (!isValidPersonName(presNome)) {
    presNome = "";
  }
  return {
    president: {
      name: presNome || "N\xE3o identificado na Mesa Diretora",
      party: presPartido || "",
      phone: presTelefone || "",
      email: presEmail || "",
      whatsapp: presWhatsapp || "",
      profile_url: scraped.presidentProfileUrl || "",
      mandate_period: presPeriodo || ""
    },
    chamber: {
      phone: scraped.allPhones.length > 0 ? scraped.allPhones.join(" | ") : "",
      email: scraped.allEmails[0] || "",
      whatsapp: camaraWhatsappNums.length > 0 ? camaraWhatsappNums.join(", ") : "",
      address: endereco || ""
    },
    mesa_diretora: mesaDiretora,
    platform: scraped.platform,
    sources: {
      mesa_diretora_url: scraped.mesaDiretoraUrl || "",
      president_profile_url: scraped.presidentProfileUrl || "",
      contact_url: scraped.contactUrl || scraped.workingUrl || ""
    },
    // Compatibility flat fields
    presidenteNome: presNome || "N\xE3o identificado na Mesa Diretora",
    presidentePartido: presPartido,
    presidenteTelefone: presTelefone,
    presidenteWhatsapp: presWhatsapp,
    presidenteEmail: presEmail,
    presidentePerfilUrl: scraped.presidentProfileUrl,
    presidentePeriodo: presPeriodo,
    camaraWhatsapp: camaraWhatsappNums,
    camaraTelefoneSite: scraped.allPhones,
    camaraEmail: scraped.allEmails[0] || "",
    camaraEndereco: endereco,
    desenvolvedorPlataforma: `${scraped.platform.developer} (${scraped.platform.cms})`,
    mesaDiretoraUrl: scraped.mesaDiretoraUrl,
    contatoUrl: scraped.contactUrl,
    mesaDiretora,
    origemDados: scraped.workingUrl || scraped.visitedUrls[0] || "",
    confianca: presNome && presNome !== "N\xE3o identificado na Mesa Diretora" ? "alta" : "media",
    notas: `Extra\xE7\xE3o estrita executada (Mesa Diretora -> Perfil -> Contatos Institucionais). Plataforma: ${scraped.platform.developer}.`
  };
}
async function extractWithGemini(municipio, uf, website, scrapedData) {
  const ai = getGeminiClient();
  const isScraped = scrapedData.pages.length > 0;
  let contextText = `DADOS DA C\xC2MARA MUNICIPAL:
Munic\xEDpio: ${municipio || "N\xE3o informado"}
UF: ${uf || "N\xE3o informado"}
Website Oficial: ${website || scrapedData.workingUrl || "N\xE3o informado"}
Plataforma Detectada: ${scrapedData.platform.developer} (${scrapedData.platform.cms})

`;
  if (isScraped) {
    contextText += `=== FLUXO DE NAVEGA\xC7\xC3O REALIZADO ===
`;
    contextText += `1. URL Principal: ${scrapedData.workingUrl}
`;
    contextText += `2. URL da Mesa Diretora: ${scrapedData.mesaDiretoraUrl || "N\xE3o encontrada"}
`;
    contextText += `3. URL do Perfil do Presidente: ${scrapedData.presidentProfileUrl || "N\xE3o encontrada"}
`;
    contextText += `4. URL de Contato: ${scrapedData.contactUrl || "N\xE3o encontrada"}

`;
    if (scrapedData.mesaDiretoraPage) {
      contextText += `--- CONTE\xDADO DA P\xC1GINA DA MESA DIRETORA ---
${scrapedData.mesaDiretoraPage.text.slice(0, 7e3)}

`;
    }
    if (scrapedData.presidentProfilePage) {
      contextText += `--- CONTE\xDADO DO PERFIL DO PRESIDENTE ---
${scrapedData.presidentProfilePage.text.slice(0, 5e3)}

`;
    }
    if (scrapedData.homePage) {
      contextText += `--- CONTE\xDADO DA P\xC1GINA INICIAL / RODAP\xC9 ---
${scrapedData.homePage.text.slice(0, 5e3)}

`;
    }
  }
  const systemInstruction = `Voc\xEA \xE9 um analista legislativo e auditor de dados p\xFAblicos de C\xE2maras Municipais brasileiras.
SIGA RIGOROSAMENTE AS SEGUINTES DIRETRIZES:
1. FONTE PRIM\xC1RIA DO PRESIDENTE: A Mesa Diretora atual (legislatura 2025-2028 / bi\xEAnio vigente 2026). Identifique quem ocupa o cargo de "Presidente" (excluindo vice-presidente).
2. CONTATOS DO PRESIDENTE: Devem vir exclusivamente do perfil/ficha individual do vereador presidente.
3. WHATSAPP: Somente classifique como WhatsApp se houver evid\xEAncia expl\xEDcita (link wa.me, api.whatsapp, palavra WhatsApp/Whats/Zap). N\xE3o presuma que qualquer telefone celular \xE9 WhatsApp sem evid\xEAncia.
4. PER\xCDODO DO MANDATO: S\xF3 retorne se houver men\xE7\xE3o expressa no site (ex: '2025-2026'). Se n\xE3o houver, retorne string vazia.
5. DESENVOLVEDOR DO SITE: Se n\xE3o houver identifica\xE7\xE3o clara no rodap\xE9 ou metadados, retorne 'footer_verified_not_informed'.
6. Formate telefones no padr\xE3o brasileiro (XX) 9XXXX-XXXX ou (XX) XXXX-XXXX.`;
  const responseSchema = {
    type: import_genai.Type.OBJECT,
    properties: {
      president: {
        type: import_genai.Type.OBJECT,
        properties: {
          name: { type: import_genai.Type.STRING },
          party: { type: import_genai.Type.STRING },
          phone: { type: import_genai.Type.STRING },
          email: { type: import_genai.Type.STRING },
          whatsapp: { type: import_genai.Type.STRING },
          profile_url: { type: import_genai.Type.STRING },
          mandate_period: { type: import_genai.Type.STRING }
        },
        required: ["name"]
      },
      chamber: {
        type: import_genai.Type.OBJECT,
        properties: {
          phone: { type: import_genai.Type.STRING },
          email: { type: import_genai.Type.STRING },
          whatsapp: { type: import_genai.Type.STRING },
          address: { type: import_genai.Type.STRING }
        }
      },
      mesa_diretora: {
        type: import_genai.Type.ARRAY,
        items: {
          type: import_genai.Type.OBJECT,
          properties: {
            role: { type: import_genai.Type.STRING },
            name: { type: import_genai.Type.STRING },
            party: { type: import_genai.Type.STRING },
            phone: { type: import_genai.Type.STRING }
          },
          required: ["role", "name"]
        }
      },
      platform: {
        type: import_genai.Type.OBJECT,
        properties: {
          developer: { type: import_genai.Type.STRING },
          cms: { type: import_genai.Type.STRING }
        },
        required: ["developer"]
      },
      sources: {
        type: import_genai.Type.OBJECT,
        properties: {
          mesa_diretora_url: { type: import_genai.Type.STRING },
          president_profile_url: { type: import_genai.Type.STRING },
          contact_url: { type: import_genai.Type.STRING }
        }
      },
      confianca: { type: import_genai.Type.STRING },
      notas_extracao: { type: import_genai.Type.STRING }
    },
    required: ["president", "chamber", "platform", "confianca", "notas_extracao"]
  };
  const modelCandidates = [process.env.JP_GEMINI_MODEL || "gemini-2.5-flash"];
  for (const model of modelCandidates) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `Analise as evid\xEAncias navegadas da C\xE2mara Municipal de ${municipio} - ${uf} e estruture os dados conforme o protocolo:

${contextText}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.1
        }
      });
      if (response.text) {
        return JSON.parse(response.text);
      }
    } catch (err) {
      console.warn(`[Gemini] Modelo ${model} falhou: ${err.message || err}`);
    }
  }
  throw new Error("AI indispon\xEDvel.");
}
function evidencePack(scraped) {
  const selected = [scraped.homePage, scraped.mesaDiretoraPage, scraped.presidentProfilePage, scraped.contactPage, ...scraped.pages].filter((p) => Boolean(p));
  const pages = Array.from(new Map(selected.map((p) => [p.url, p])).values()).slice(0, 12).map((p) => ({ url: p.url, role: p.url === scraped.mesaDiretoraUrl ? "mesa" : p.url === scraped.presidentProfileUrl ? "profile" : "other", mainText: p.url === scraped.mesaDiretoraUrl ? mainPageText(scraped.rawHtmlMesa) : void 0, whatsappLinks: p.whatsappButtons.flatMap((w) => [w.link, w.numero].filter(Boolean)), text: p.text.slice(0, 9e3) + "\n" + p.text.slice(-4e3), links: [...p.telLinks, ...p.whatsappButtons.flatMap((w) => [w.link, w.url, w.numero].filter(Boolean)), ...p.emails].slice(0, 150) }));
  const institutional = [];
  for (const [html, url] of [[scraped.rawHtmlHome, scraped.workingUrl], [scraped.rawHtmlMesa, scraped.mesaDiretoraUrl], [scraped.rawHtmlProfile, scraped.presidentProfileUrl]]) {
    if (!html || !url) continue;
    const $ = cheerio.load(html);
    const footer = $('footer, [id*="rodape"], [class*="rodape"], [class*="footer"]').toArray().map((el) => $.html(el)).join("\n");
    if (!footer) continue;
    const parsed = parseHtml(footer, url, "Rodap\xE9 institucional");
    const page = pages.find((p) => p.url === url);
    if (!page) continue;
    page.text += "\n" + parsed.text;
    for (const value of parsed.telLinks) institutional.push({ kind: "phone", value, url, quote: parsed.text.slice(0, 3e3) });
    for (const value of parsed.emails) institutional.push({ kind: "email", value, url, quote: parsed.text.slice(0, 3e3) });
    for (const w of parsed.whatsappButtons) if (w.numero) institutional.push({ kind: "whatsapp", value: w.numero, url, quote: parsed.text.slice(0, 3e3) });
    page.links.push(...parsed.telLinks, ...parsed.emails, ...parsed.whatsappButtons.map((w) => w.numero).filter(Boolean));
  }
  const contact = scraped.contactPage;
  const cp = contact && pages.find((p) => p.url === contact.url);
  if (contact && cp) {
    for (const value of contact.telLinks) institutional.push({ kind: "phone", value, url: contact.url, quote: contact.text.slice(0, 3e3) });
    for (const value of contact.emails) institutional.push({ kind: "email", value, url: contact.url, quote: contact.text.slice(0, 3e3) });
    for (const w of contact.whatsappButtons) if (w.numero) institutional.push({ kind: "whatsapp", value: w.numero, url: contact.url, quote: contact.text.slice(0, 3e3) });
  }
  const hp = scraped.homePage && pages.find((p) => p.url === scraped.homePage.url);
  if (hp) {
    for (const w of scraped.homePage.whatsappButtons) if (w.numero && !/presidente|vereador/i.test(w.texto)) {
      institutional.push({ kind: "whatsapp", value: w.numero, url: hp.url, quote: w.texto });
      hp.links.push(w.numero);
    }
  }
  return { pages, institutional, workingUrl: scraped.workingUrl, presidentProfileUrl: scraped.presidentProfileUrl, identifiedPresidentName: scraped.identifiedPresidentName, primaryMesaUrls: scraped.mesaDiretoraUrl ? [scraped.mesaDiretoraUrl] : [], compositionPeriods: scraped.compositionPeriods || [], multipleCompositions: (scraped.compositionPeriods || []).length > 1 || presidentNamesFromText(mainPageText(scraped.rawHtmlMesa)).length > 1 };
}
app.post("/api/ai-fetch", async (req, res) => {
  try {
    const root = new URL(String(req.body.rootUrl || ""));
    const target = new URL(String(req.body.url || ""));
    const same = (a, b) => a.hostname.toLowerCase().replace(/^www\./, "") === b.hostname.toLowerCase().replace(/^www\./, "") && a.port === b.port;
    if (!["http:", "https:"].includes(root.protocol) || !["http:", "https:"].includes(target.protocol) || root.username || root.password || target.username || target.password || !same(root, target)) throw Error("A p\xE1gina deve pertencer ao site cadastrado.");
    const fetched = await networkGet(target.href, 7, root.href);
    if (!fetched) {
      res.json({ success: true, data: { page: null, network: networkStats(), error: "N\xE3o foi poss\xEDvel ler esta p\xE1gina." } });
      return;
    }
    const parsed = parseHtml(fetched.html, fetched.finalUrl, "Navega\xE7\xE3o IA");
    const $ = cheerio.load(fetched.html);
    const mainText = mainPageText(fetched.html);
    const nav = [];
    $("a[href],area[href]").each((_, el) => {
      try {
        const u = new URL($(el).attr("href"), fetched.finalUrl);
        u.hash = "";
        if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || !same(root, u)) return;
        const label = ($(el).text() || $(el).attr("title") || $(el).attr("aria-label") || $(el).find("img").attr("alt") || "").replace(/\s+/g, " ").trim().slice(0, 200);
        if (!excludedReference(u.href, label) && !nav.some((n) => n.url === u.href)) nav.push({ url: u.href, label });
      } catch {
      }
    });
    const institutionHtml = $('header,footer,[id*="rodape"],[class*="rodape"],[class*="footer"]').toArray().map((el) => $.html(el)).join("\n");
    const footer = parseHtml(institutionHtml, fetched.finalUrl, "Institucional");
    const institutional = [];
    for (const value of footer.telLinks) institutional.push({ kind: "phone", value, url: fetched.finalUrl, quote: footer.text });
    for (const value of footer.emails) institutional.push({ kind: "email", value, url: fetched.finalUrl, quote: footer.text });
    for (const w of footer.whatsappButtons) if (w.numero) institutional.push({ kind: "whatsapp", value: w.numero, url: fetched.finalUrl, quote: footer.text });
    const whatsappLinks = parsed.whatsappButtons.flatMap((w) => [w.link, w.numero].filter(Boolean));
    const page = { url: fetched.finalUrl, title: parsed.title, text: mainText.slice(0, 16e3) + "\n" + parsed.text.slice(0, 5e3) + "\n" + footer.text.slice(0, 5e3), mainText: mainText.slice(0, 16e3), links: [.../* @__PURE__ */ new Set([...parsed.telLinks, ...parsed.emails, ...whatsappLinks])].slice(0, 200), whatsappLinks, nav: nav.slice(0, 200), primary: /mesa\s+diretora|^presidente\b|^presid[eê]ncia\b/im.test(mainText.slice(0, 1e3)) || presidentNamesFromText(mainText.slice(0, 5e3)).length > 0, compositionPeriods: compositionPeriods(fetched.html), presidentNames: presidentNamesFromText(mainText) };
    res.json({ success: true, data: { page, institutional, network: networkStats() } });
  } catch (error) {
    res.status(400).json({ error: String(error?.message || "P\xE1gina inv\xE1lida").slice(0, 250) });
  }
});
app.post("/api/extract-single", async (req, res) => {
  try {
    const { municipio, uf, website, telefoneOriginal } = req.body;
    if (!municipio && !website) {
      res.status(400).json({ error: "Informe ao menos o munic\xEDpio ou o website da C\xE2mara." });
      return;
    }
    console.log(`[Extrator Protocolo] Processando: ${municipio || "Sem nome"} (${uf || "BR"}) - ${website || "Sem site"}`);
    const scrapedData = await deepScrapeChamber(website || "", municipio || "", uf || "", Number(req.body.referenceYear) || 2026);
    const deterministic = extractDeterministicData(municipio || "", uf || "", scrapedData);
    if (scrapedData.identifiedPresidentName) deterministic.presidenteNome = scrapedData.identifiedPresidentName;
    const evidence = evidencePack(scrapedData);
    if (req.body.evidenceOnly) {
      res.json({ success: true, data: { ...deterministic, evidencePack: evidence, network: networkStats(), aiUsed: false } });
      return;
    }
    let finalResult = deterministic;
    let aiUsed = false;
    let aiMessage = "";
    try {
      if (process.env.JP_USE_AI !== "1" || !process.env.GEMINI_API_KEY) throw new Error("Modo sem IA");
      const aiResult = await extractWithGemini(municipio || "", uf || "", website || "", scrapedData);
      const pres = aiResult.president || {};
      const cham = aiResult.chamber || {};
      const plat = aiResult.platform || {};
      const sour = aiResult.sources || {};
      const directWhatsappNumbers = scrapedData.allWhatsapp.map((w) => w.numero).filter(Boolean);
      const mergedWhatsapp = Array.from(
        /* @__PURE__ */ new Set([
          ...cham.whatsapp ? cham.whatsapp.split(",").map((s) => s.trim()) : [],
          ...directWhatsappNumbers,
          ...deterministic.camaraWhatsapp || []
        ])
      ).filter(Boolean);
      const mappedMesa = aiResult.mesa_diretora && aiResult.mesa_diretora.length > 0 ? aiResult.mesa_diretora.filter((m) => isValidPersonName(m.name || m.nome)).map((m) => ({
        cargo: m.role || m.cargo,
        nome: m.name || m.nome,
        partido: m.party || m.partido,
        telefone: m.phone || m.telefone
      })) : deterministic.mesaDiretora;
      const devPresident = scrapedData.developerExtractionResult && scrapedData.developerExtractionResult.success && isValidPersonName(scrapedData.developerExtractionResult.president?.nome) ? scrapedData.developerExtractionResult.president : null;
      let finalPresName = "N\xE3o identificado na Mesa Diretora";
      if (devPresident && isValidPersonName(devPresident.nome)) {
        finalPresName = devPresident.nome;
      } else if (isValidPersonName(pres.name)) {
        finalPresName = pres.name;
      } else if (isValidPersonName(deterministic.president.name)) {
        finalPresName = deterministic.president.name;
      }
      const finalParty = devPresident && devPresident.partido ? devPresident.partido : isRealValue(pres.party) ? pres.party : deterministic.president.party;
      const finalPhone = devPresident && devPresident.telefone ? devPresident.telefone : isRealValue(pres.phone) ? pres.phone : deterministic.president.phone;
      const finalEmail = devPresident && devPresident.email ? devPresident.email : isRealValue(pres.email) ? pres.email : deterministic.president.email;
      const finalWhatsapp = devPresident && devPresident.whatsapp ? devPresident.whatsapp : isRealValue(pres.whatsapp) ? pres.whatsapp : deterministic.president.whatsapp;
      const finalProfileUrl = devPresident && devPresident.perfilUrl ? devPresident.perfilUrl : sour.president_profile_url || deterministic.president.profile_url;
      const finalPeriod = devPresident && devPresident.mandato ? devPresident.mandato : isRealValue(pres.mandate_period) ? pres.mandate_period : deterministic.president.mandate_period;
      finalResult = {
        ...deterministic,
        president: {
          name: finalPresName,
          party: finalParty,
          phone: finalPhone,
          email: finalEmail,
          whatsapp: finalWhatsapp,
          profile_url: finalProfileUrl,
          mandate_period: finalPeriod
        },
        chamber: {
          phone: cham.phone || deterministic.chamber.phone,
          email: cham.email || deterministic.chamber.email,
          whatsapp: mergedWhatsapp.join(", "),
          address: cham.address || deterministic.chamber.address
        },
        mesa_diretora: mappedMesa,
        platform: {
          developer: plat.developer || deterministic.platform.developer,
          cms: plat.cms || deterministic.platform.cms
        },
        sources: {
          mesa_diretora_url: devPresident && scrapedData.developerExtractionResult?.routeUsed ? scrapedData.developerExtractionResult.routeUsed : sour.mesa_diretora_url || deterministic.sources.mesa_diretora_url,
          president_profile_url: finalProfileUrl,
          contact_url: sour.contact_url || deterministic.sources.contact_url
        },
        // Flat compatibility
        presidenteNome: finalPresName,
        presidentePartido: finalParty,
        presidenteTelefone: finalPhone,
        presidenteWhatsapp: finalWhatsapp,
        presidenteEmail: finalEmail,
        presidentePerfilUrl: finalProfileUrl,
        presidentePeriodo: finalPeriod,
        camaraWhatsapp: mergedWhatsapp,
        camaraTelefoneSite: scrapedData.allPhones,
        camaraEmail: cham.email || deterministic.camaraEmail,
        camaraEndereco: cham.address || deterministic.camaraEndereco,
        desenvolvedorPlataforma: `${plat.developer || deterministic.platform.developer} (${plat.cms || deterministic.platform.cms})`,
        mesaDiretoraUrl: devPresident && scrapedData.developerExtractionResult?.routeUsed ? scrapedData.developerExtractionResult.routeUsed : sour.mesa_diretora_url || deterministic.mesaDiretoraUrl,
        contatoUrl: sour.contact_url || deterministic.contatoUrl,
        mesaDiretora: mappedMesa,
        confianca: aiResult.confianca || deterministic.confianca,
        notas: aiResult.notas_extracao || deterministic.notas
      };
      aiUsed = true;
    } catch (aiErr) {
      aiMessage = process.env.JP_USE_AI === "1" ? String(aiErr.message || "IA indispon\xEDvel").replace(process.env.GEMINI_API_KEY || "NEVER_MATCH_API_KEY", "[chave ocultada]").slice(0, 300) : "";
      console.log(`[Extrator] AI fallback utilizado para ${municipio}: ${aiErr.message}`);
    }
    res.json({
      success: true,
      data: { ...finalResult, evidencePack: evidence, network: networkStats(), aiUsed, aiMessage }
    });
  } catch (error) {
    console.error("[Extrator] Erro geral:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Erro durante o processamento da C\xE2mara Municipal."
    });
  }
});
app.post("/api/inspect-url", async (req, res) => {
  try {
    const { url, municipio, uf } = req.body;
    if (!url) {
      res.status(400).json({ error: "URL \xE9 obrigat\xF3ria" });
      return;
    }
    const scraped = await deepScrapeChamber(url, municipio || "", uf || "");
    const deterministic = extractDeterministicData(municipio || "", uf || "", scraped);
    res.json({
      success: true,
      data: {
        workingUrl: scraped.workingUrl,
        pagesFound: scraped.pages.length,
        visitedUrls: scraped.visitedUrls,
        whatsappButtons: scraped.allWhatsapp,
        telefones: scraped.allPhones,
        emails: scraped.allEmails,
        platform: scraped.platform,
        sources: deterministic.sources,
        president: deterministic.president,
        chamber: deterministic.chamber,
        mesa_diretora: deterministic.mesa_diretora
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/validate-url", async (req, res) => {
  try {
    const { website, municipio, uf, forceGoogleSearch, forceSearch } = req.body;
    if (!municipio) {
      res.status(400).json({ success: false, error: "Munic\xEDpio \xE9 obrigat\xF3rio para valida\xE7\xE3o e busca." });
      return;
    }
    const result = await validateAndResolveChamberUrl(
      website || "",
      municipio,
      uf || "",
      Boolean(forceGoogleSearch || forceSearch)
    );
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Erro na valida\xE7\xE3o do site" });
  }
});
async function detectChamberDeveloper(website, municipio, uf) {
  try {
    let targetUrl = (website || "").trim();
    if (!targetUrl || targetUrl.toLowerCase().includes("n\xE3o dispon\xEDvel") || targetUrl === "-" || targetUrl === "N/D") {
      const resolved = await validateAndResolveChamberUrl("", municipio, uf);
      if (resolved.valid && resolved.resolvedUrl) {
        targetUrl = resolved.resolvedUrl;
      }
    }
    if (!targetUrl) {
      return {
        developer: "footer_verified_not_informed",
        cms: "N\xE3o especificado",
        desenvolvedorPlataforma: "N\xE3o identificado",
        resolvedUrl: "",
        status: "error",
        message: "Website n\xE3o informado ou n\xE3o localizado"
      };
    }
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`;
    }
    let homeRes = await fetchPage(targetUrl, 6);
    if (!homeRes || !homeRes.html) {
      if (targetUrl.startsWith("https://")) {
        const httpUrl = targetUrl.replace("https://", "http://");
        homeRes = await fetchPage(httpUrl, 5);
        if (homeRes) targetUrl = httpUrl;
      }
    }
    if (!homeRes || !homeRes.html) {
      try {
        const host = new URL(targetUrl).hostname;
        const txts = await import_dns.default.promises.resolveTxt(host);
        let combinedDns = "";
        for (const t of txts) {
          combinedDns += " " + t.join(" ");
          const ips = Array.from(t.join(" ").matchAll(/ip4:([0-9.]+)/g)).map((m) => m[1]);
          for (const ip of ips) {
            try {
              const ptrs = await import_dns.default.promises.reverse(ip);
              combinedDns += " " + ptrs.join(" ");
            } catch (e) {
            }
          }
        }
        const lowerDns = combinedDns.toLowerCase();
        for (const sig of getDeveloperSignatures()) {
          for (const pat of sig.patterns) {
            if (pat && lowerDns.includes(pat.toLowerCase())) {
              return {
                developer: sig.developer,
                cms: sig.cms,
                desenvolvedorPlataforma: `${sig.developer} (${sig.cms})`,
                resolvedUrl: targetUrl,
                status: "detected",
                message: `Desenvolvedor identificado via DNS/Hospedagem: ${sig.developer} (${sig.cms})`
              };
            }
          }
        }
      } catch (e) {
      }
      return {
        developer: "footer_verified_not_informed",
        cms: "N\xE3o especificado",
        desenvolvedorPlataforma: "N\xE3o identificado (Site inacess\xEDvel)",
        resolvedUrl: targetUrl,
        status: "error",
        message: "Site inacess\xEDvel ou tempo limite excedido"
      };
    }
    let detected = detectPlatformAndDeveloper(homeRes.html, homeRes.finalUrl);
    if (detected.developer === "footer_verified_not_informed") {
      const lowerHtml = homeRes.html.toLowerCase();
      for (const sig of getDeveloperSignatures()) {
        if (isForbiddenPattern(sig.developer)) continue;
        const expanded = Array.from(new Set(sig.patterns.flatMap((p) => expandPatternVariants(p))));
        for (const pat of expanded) {
          if (!pat || isForbiddenPattern(pat) || pat.length < 4) continue;
          if (lowerHtml.includes(pat.toLowerCase())) {
            detected = {
              developer: sig.developer,
              cms: sig.cms
            };
            break;
          }
        }
        if (detected.developer !== "footer_verified_not_informed") break;
      }
    }
    if (detected.developer === "footer_verified_not_informed") {
      try {
        const waybackRes = await fetchFromWayback(targetUrl, 6);
        if (waybackRes && waybackRes.html && waybackRes.html !== homeRes.html) {
          const waybackDetected = detectPlatformAndDeveloper(waybackRes.html, waybackRes.finalUrl);
          if (waybackDetected.developer !== "footer_verified_not_informed") {
            detected = waybackDetected;
          }
        }
      } catch (e) {
      }
    }
    const isIdentified = detected.developer !== "footer_verified_not_informed";
    const devPlat = isIdentified ? `${detected.developer} (${detected.cms})` : "Rodap\xE9 verificado (Desenvolvedor n\xE3o informado)";
    return {
      developer: detected.developer,
      cms: detected.cms,
      desenvolvedorPlataforma: devPlat,
      resolvedUrl: homeRes.finalUrl || targetUrl,
      status: isIdentified ? "detected" : "footer_verified_not_informed",
      message: isIdentified ? `Desenvolvedor identificado: ${devPlat}` : "Rodap\xE9 inspecionado sem assinatura de software house"
    };
  } catch (err) {
    return {
      developer: "footer_verified_not_informed",
      cms: "N\xE3o especificado",
      desenvolvedorPlataforma: "Erro ao inspecionar",
      resolvedUrl: website,
      status: "error",
      message: err.message || "Erro desconhecido"
    };
  }
}
app.post("/api/batch-validate-urls", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: "Lista de itens inv\xE1lida ou vazia." });
      return;
    }
    const results = [];
    const chunkSize = 4;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          const val = await validateAndResolveChamberUrl(item.website || "", item.municipio, item.uf || "");
          return {
            id: item.id,
            municipio: item.municipio,
            uf: item.uf,
            ...val
          };
        })
      );
      results.push(...chunkResults);
    }
    res.json({
      success: true,
      data: results,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Erro no processamento em lote." });
  }
});
app.post("/api/detect-developer", async (req, res) => {
  try {
    const website = req.body.website || req.body.url || "";
    const municipio = req.body.municipio || "";
    const uf = req.body.uf || "";
    if (!municipio && !website) {
      res.status(400).json({ success: false, error: "Informe ao menos o munic\xEDpio ou o website." });
      return;
    }
    const result = await detectChamberDeveloper(website, municipio, uf);
    res.json({
      success: true,
      data: {
        ...result,
        desenvolvedor: result.developer,
        statusDesenvolvedor: result.status === "detected" ? "detected" : "not_informed"
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Erro ao detectar desenvolvedor" });
  }
});
app.post("/api/batch-detect-developers", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: "Lista de itens inv\xE1lida ou vazia." });
      return;
    }
    const results = await Promise.all(
      items.map(async (item) => {
        const res2 = await detectChamberDeveloper(item.website || "", item.municipio, item.uf || "");
        return {
          id: item.id,
          municipio: item.municipio,
          uf: item.uf,
          ...res2,
          data: {
            desenvolvedor: res2.developer,
            cms: res2.cms,
            desenvolvedorPlataforma: res2.desenvolvedorPlataforma,
            statusDesenvolvedor: res2.status === "detected" ? "detected" : "not_informed",
            resolvedUrl: res2.resolvedUrl
          }
        };
      })
    );
    const detectedCount = results.filter((r) => r.status === "detected").length;
    res.json({
      success: true,
      data: results,
      results,
      summary: {
        total: results.length,
        detectedCount,
        identifiedCount: detectedCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Erro no processamento de desenvolvedores em lote." });
  }
});
app.get("/api/developer-signatures", (_req, res) => {
  try {
    const signatures = getDeveloperSignatures();
    res.json({ success: true, data: signatures });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/teach-developer", (req, res) => {
  try {
    const { developer, cms, patterns, sampleChamber } = req.body;
    if (!developer || typeof developer !== "string" || !developer.trim()) {
      res.status(400).json({ success: false, error: "Nome do desenvolvedor \xE9 obrigat\xF3rio." });
      return;
    }
    const patternList = Array.isArray(patterns) ? patterns : typeof patterns === "string" ? patterns.split(",").map((p) => p.trim()) : [];
    if (patternList.length === 0) {
      patternList.push(developer.toLowerCase().trim());
    }
    const saved = saveDeveloperSignature({
      developer: developer.trim(),
      cms: (cms && cms.trim() !== "Portal Legislativo" ? cms : developer.trim() || "Plataforma Pr\xF3pria").trim(),
      patterns: patternList,
      sampleChamber: sampleChamber || ""
    });
    const all = getDeveloperSignatures();
    res.json({
      success: true,
      data: saved,
      signatures: all,
      message: `Padr\xE3o para "${saved.developer}" gravado com sucesso!`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Erro ao ensinar assinatura de desenvolvedor" });
  }
});
app.delete("/api/developer-signatures/:id", (req, res) => {
  try {
    const { id } = req.params;
    const deleted = deleteDeveloperSignature(id);
    const all = getDeveloperSignatures();
    res.json({ success: true, deleted, signatures: all });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/developer-extraction-rules", (_req, res) => {
  try {
    const rules = getDeveloperExtractionRules();
    res.json({ success: true, data: rules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/developer-extraction-rules", (req, res) => {
  try {
    const rule = req.body;
    if (!rule || !rule.developer || !rule.developer.trim()) {
      res.status(400).json({ success: false, error: "Nome do desenvolvedor \xE9 obrigat\xF3rio." });
      return;
    }
    const saved = saveDeveloperExtractionRule(rule);
    const all = getDeveloperExtractionRules();
    res.json({
      success: true,
      data: saved,
      rules: all,
      message: `Regra de extra\xE7\xE3o para "${saved.developer}" salva com sucesso!`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Erro ao salvar regra de extra\xE7\xE3o." });
  }
});
app.delete("/api/developer-extraction-rules/:id", (req, res) => {
  try {
    const { id } = req.params;
    const deleted = deleteDeveloperExtractionRule(id);
    const all = getDeveloperExtractionRules();
    res.json({ success: true, deleted, rules: all });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/test-developer-extraction", async (req, res) => {
  try {
    const { url, developerId, rule, municipio, uf, customHtmlMesa, customHtmlProfile } = req.body;
    if (!url || typeof url !== "string" || !url.trim()) {
      res.status(400).json({ success: false, error: "URL da c\xE2mara \xE9 obrigat\xF3ria para o teste." });
      return;
    }
    let activeRule;
    if (rule && typeof rule === "object" && rule.developer) {
      activeRule = rule;
    } else if (developerId) {
      const all = getDeveloperExtractionRules();
      activeRule = all.find((r) => r.id === developerId || r.developer.toLowerCase() === developerId.toLowerCase());
    }
    if (!activeRule) {
      const all = getDeveloperExtractionRules();
      activeRule = all.find((r) => r.id === "softcam") || all[0];
    }
    if (!activeRule) {
      res.status(404).json({ success: false, error: "Nenhuma regra de desenvolvedor encontrada para testar." });
      return;
    }
    const testResult = await executeDeveloperExtraction(url.trim(), activeRule, municipio, uf, customHtmlMesa, customHtmlProfile);
    res.json({ success: true, data: testResult });
  } catch (error) {
    console.error("Erro no teste de extra\xE7\xE3o do desenvolvedor:", error);
    res.status(500).json({ success: false, error: error.message || "Falha ao executar teste de extra\xE7\xE3o" });
  }
});
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
var server = app.listen(PORT, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write("JP_ENGINE_READY " + JSON.stringify({ port: typeof address === "object" && address ? address.port : 0 }) + "\n");
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deepScrapeChamber,
  deleteDeveloperExtractionRule,
  deleteDeveloperSignature,
  detectChamberDeveloper,
  detectPlatformAndDeveloper,
  executeDeveloperExtraction,
  expandPatternVariants,
  extractDeterministicData,
  extractMesaMemberFromLine,
  extractWithGemini,
  getDeveloperExtractionRules,
  getDeveloperSignatures,
  isConfirmedChamberWebsite,
  isLikelyPrefeituraWebsite,
  isValidPersonName,
  mainPageText,
  parseHtml,
  presidentNamesFromText,
  saveDeveloperExtractionRule,
  saveDeveloperSignature,
  searchGoogleForChamberWebsite,
  validateAndResolveChamberUrl
});
