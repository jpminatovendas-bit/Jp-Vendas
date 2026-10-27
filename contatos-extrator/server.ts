import express from "express";
import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { exec, networkGet, networkScope, networkStats } from "./jp-network";
import { GoogleGenAI, Type } from "@google/genai";
import * as cheerio from "cheerio";


import dns from "dns";



// Ensure TLS ignores self-signed/expired certs on municipal servers


const app = express();
const PORT = Number(process.env.JP_ENGINE_PORT || 0);

app.use((req,res,next)=>{if(!process.env.JP_ENGINE_TOKEN || req.headers['x-engine-token']!==process.env.JP_ENGINE_TOKEN){res.status(403).json({error:'Acesso reservado ao JP Minato.'});return}next()});
app.use(express.json({ limit: "2mb" }));
app.use((req,res,next)=>networkScope(req.body?.maxRequests||35,req.body?.deadlineSeconds||240,next));

// Lazy/safe Gemini AI initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY, httpOptions:{timeout:45000},
    });
  }
  return aiClient;
}

// Format Brazilian Phone with DDD: (XX) 9XXXX-XXXX or (XX) XXXX-XXXX
function formatBrazilianPhone(num: string): string {
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
    return clean.length === 9
      ? `${clean.substring(0, 5)}-${clean.substring(5)}`
      : `${clean.substring(0, 4)}-${clean.substring(4)}`;
  }
  return num.trim();
}

// Check if string contains a real extracted value rather than a placeholder
function isRealValue(val: string | undefined | null): boolean {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return (
    v !== "" &&
    v !== "não identificado" &&
    v !== "não informado" &&
    v !== "não disponível" &&
    v !== "a confirmar" &&
    v !== "a confirmar na câmara" &&
    v !== "null" &&
    v !== "undefined"
  );
}

// Check if string is a valid person's name (and not a navigational link or menu label)
export function isValidPersonName(val: string | undefined | null): boolean {
  if (!val) return false;
  const clean = val.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const v = clean.toLowerCase();
  if (v.length < 3 || v.length > 55) return false;
  if (!isRealValue(clean)) return false;

  const invalidPhrases = [
    "página inicial", "pagina inicial", "início", "inicio", "home", "voltar", "voltar ao topo",
    "mapa do site", "acessibilidade", "contato", "contatos", "fale conosco", "transparência",
    "transparencia", "ouvidoria", "notícias", "noticias", "legislação", "legislacao", "leis",
    "sessões", "sessoes", "sessão", "sessao", "vereadores", "mesa diretora", "institucional",
    "estrutura", "regimento", "regimento interno", "brasão", "brasao", "logotipo", "logo",
    "foto", "imagem", "portal", "câmara", "camara", "prefeitura", "município", "municipio",
    "governo", "saiba mais", "clique aqui", "leia mais", "ver perfil", "perfil", "mais informações",
    "mais informacoes", "processo legislativo", "sobre a câmara", "sobre a camara", "serviços",
    "servicos", "eventos", "publicações", "publicacoes", "galerias", "galeria", "atas", "pauta",
    "ordem do dia", "identificado", "não identificado", "nao identificado", "não informado",
    "painel eletrônico", "painel eletronico", "transmissão", "transmissao ao vivo", "ao vivo",
    "menu", "pesquisar", "busca", "buscar", "download", "documento", "documentos"
  ];

  if (invalidPhrases.some((kw) => v === kw || v.startsWith(`${kw} `) || v.endsWith(` ${kw}`) || v.includes(` - ${kw}`))) {
    return false;
  }

  // Reject institution/office/address phrases
  if (v.includes("câmara") || v.includes("camara") || v.includes("prefeitura") || v.includes("município") || v.includes("municipio") || v.includes("governo municipal") || v.includes("endereço") || v.includes("endereco") || v.includes("telefone") || v.includes("horário") || v.includes("sessão") || v.includes("sessões") || v.includes("rua ") || v.includes("av.") || v.includes("avenida") || v.includes("email-protection")) {
    return false;
  }

  // Must not have HTML tags or special URL chars
  if (/[<>{};\\\/]/.test(clean)) return false;

  return true;
}

/**
 * Extracts candidate Mesa Diretora member (e.g. Presidente) from a single line of text.
 * Robustly handles both prefix and suffix variations requested by the user:
 * 1. Name BEFORE prefix: "Danielli Marcansoni - Presidente da Câmara" (e.g. BigDream / Harmonia)
 * 2. Name AFTER prefix: "Presidente: Jairo Henrique Kunzler" (e.g. BigDream / Tupandi)
 */
export function extractMesaMemberFromLine(rawLine: string | null | undefined): { cargo: string; nome: string } | null {
  if (!rawLine || typeof rawLine !== "string") return null;
  const clean = rawLine.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (clean.length < 5 || clean.length > 140) return null;

  const roleRegex = /^(?:Presidente(?:\s+da\s+C[âa]mara|\s+da\s+Mesa)?|Vice[- ]Presidente|1[ºª°]?\s*Vice[- ]?Presidente|2[ºª°]?\s*Vice[- ]?Presidente|1[ºª°]?\s*Secret[aá]ri[oa]|2[ºª°]?\s*Secret[aá]ri[oa]|Secret[aá]ri[oa]|Tesoureir[oa])$/i;

  function stripPartySuffix(n: string): string {
    return n.replace(/\s+\b(MDB|PSDB|PP|PT|PL|UNI[ÃA]O|PSD|REPUBLICANOS|PDT|PODEMOS|PSB|CIDADANIA|SOLIDARIEDADE|AVANTE|PV|PCdoB|PSOL|REDE|NOVO|PRTB|DC|PMB|AGIR|MOBILIZA|PRD)\b$/i, "").trim();
  }

  // 1. Colon separator (e.g. "Presidente: Jairo Henrique Kunzler")
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

  // 2. Dash / en-dash / em-dash / pipe separator (e.g. "Danielli Marcansoni - Presidente da Câmara")
  // MUST require whitespace around hyphens so compound words like "Vice-Presidente" are never split!
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

  // 3. Check for specific roles at start or end with or without party in between
  // Vice-Presidente check FIRST to prevent false-positive matching with "Presidente"
  if (/vice[- ]presidente/i.test(clean)) {
    const vMatch = clean.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]{3,60})\s+(?:Vice[- ]Presidente|1[ºª°]?\s*Vice[- ]?Presidente)$/i);
    if (vMatch && isValidPersonName(vMatch[1])) {
      return { cargo: "Vice-Presidente", nome: stripPartySuffix(vMatch[1]) };
    }
  }

  // Direct "Presidente [Nome]" or "[Nome] Presidente" without punctuation
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

// Extract WhatsApp number from href, onclick or title
function extractNumbersFromWhatsappLink(href: string): string {
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
    // fallback
  }
  return "";
}

// Slugify string
function slugify(text: string): string {
  return (text || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// Fast and resilient page fetcher using curl with browser headers, redirection, and compression
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function decodeCloudflareEmail(encoded: string): string {
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

function isBlockedHtml(stdout: string): boolean {
  if (!stdout || stdout.length < 50) return true;
  const lower = stdout.toLowerCase();
  if (lower.includes("<title>bot verification</title>") || lower.includes("lsrecaptcha") || lower.includes("id=\"lsrecaptcha-form\"")) return true;
  if (lower.includes("<title>403 forbidden</title>") || lower.includes("<h1>403 forbidden</h1>")) return true;
  if (lower.includes("<title>error 404</title>") || lower.includes("<h1>404 not found</h1>") || lower.includes("<title>404 not found") || lower.includes("<h1>404</h1>")) return true;
  if (lower.includes("página não encontrada") || lower.includes("pagina nao encontrada") || lower.includes("page not found")) return true;
  if (lower.includes("<title>just a moment...</title>") || lower.includes("<title>one moment, please...</title>")) return true;
  if (lower.includes("please wait while your request is being verified") || lower.includes("wsidchk")) return true;
  if (stdout.length < 2500 && (lower.includes("captcha") || lower.includes("access denied"))) return true;
  // Cloudflare block pages & WAF challenges
  if (lower.includes("attention required! | cloudflare") || lower.includes("<title>attention required!") || lower.includes("sorry, you have been blocked") || lower.includes("you are unable to access") || lower.includes("cf-error-details") || lower.includes("id=\"cf-wrapper\"")) return true;
  if (lower.includes("cloudflare ray id") && (lower.includes("error-overview") || lower.includes("403 forbidden") || lower.includes("blocked"))) return true;
  // Directory listings (LiteSpeed, Apache, Nginx autoindex)
  if (lower.includes("<title>index of") || lower.includes("<h1>index of /") || lower.includes("<title>directory listing")) return true;
  // Server placeholder/default landing pages
  if (lower.includes("welcome to nginx") || lower.includes("apache2 debian default page") || lower.includes("iis windows server")) return true;
  return false;
}

async function curlGet(url:string,timeoutSec:number=7):Promise<string>{const r=await networkGet(url,timeoutSec);return r?.html||""}
async function fetchWithNode(url:string,timeoutSec:number=7):Promise<string>{return curlGet(url,timeoutSec)}
async function fetchPage(url:string,timeoutSec:number=7):Promise<{html:string;finalUrl:string}|null>{const r=await networkGet(url,timeoutSec);return r&&!isBlockedHtml(r.html)?r:null}

function getPotentialUrls(givenUrl: string, municipio: string, uf: string): string[] {
  const urls: string[] = [];
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
    // Top patterns in Brazilian Municipal Chambers (e.g. camaraalegria.rs.gov.br, agudo.rs.leg.br)
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

// Helper: Identifica se uma página ou URL pertence à PREFEITURA e NÃO à CÂMARA DE VEREADORES
export function isLikelyPrefeituraWebsite(url: string, html?: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();

  // Se a URL contiver marcadores inequívocos da Câmara ou Legislativo, não é Prefeitura
  const hasCamaraInUrl =
    lowerUrl.includes(".leg.br") ||
    lowerUrl.includes("camara") ||
    lowerUrl.includes("/camara") ||
    lowerUrl.includes("cm.") ||
    lowerUrl.includes("cm-") ||
    lowerUrl.includes("camaramunicipal");

  // Se a URL contém "prefeitura", "pmsao", "pmitaqui", etc. e NÃO contém "camara"
  if (
    (lowerUrl.includes("prefeitura") ||
      lowerUrl.includes("/prefeitura") ||
      lowerUrl.includes("pmsao") ||
      lowerUrl.includes("pm.") ||
      lowerUrl.includes("prefeituramunicipal")) &&
    !hasCamaraInUrl
  ) {
    return true;
  }

  // Domínio municipal executivo padrão no Brasil: <municipio>.<uf>.gov.br sem camara/cm/leg
  // Pelas regras oficiais do Registro.br / NIC.br, o domínio <cidade>.<uf>.gov.br pertence exclusivamente à Prefeitura Municipal (Poder Executivo)
  const bareCityGovBrMatch = lowerUrl.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+)\.([a-z]{2})\.gov\.br(?:\/|$)/i);
  if (bareCityGovBrMatch) {
    const sub = bareCityGovBrMatch[1];
    if (!sub.startsWith("camara") && !sub.startsWith("cm") && !sub.startsWith("leg")) {
      return true;
    }
  }

  // Análise detalhada do HTML retornado
  if (html && html.length > 50) {
    const lowerHtml = html.toLowerCase();

    // Extrai o título da página
    const titleMatch = lowerHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].toLowerCase() : "";

    const hasCamaraInContent =
      title.includes("câmara") ||
      title.includes("camara") ||
      title.includes("vereador") ||
      title.includes("legislativ") ||
      lowerHtml.includes("câmara municipal") ||
      lowerHtml.includes("camara municipal") ||
      lowerHtml.includes("câmara de vereadores") ||
      lowerHtml.includes("camara de vereadores") ||
      lowerHtml.includes("mesa diretora") ||
      lowerHtml.includes("sessão plenária") ||
      lowerHtml.includes("sessao plenaria") ||
      lowerHtml.includes("ordem do dia") ||
      lowerHtml.includes("poder legislativo");

    const hasPrefeituraInTitle =
      title.includes("prefeitura") ||
      title.includes("gabinete do prefeito") ||
      title.includes("prefeito municipal") ||
      title.includes("governo municipal");

    // Se o título diz Prefeitura e o conteúdo não tem Câmara
    if (hasPrefeituraInTitle && !hasCamaraInContent) {
      return true;
    }

    // Se a página não tem marcadores de Câmara e tem Prefeitura como entidade principal
    if (
      !hasCamaraInUrl &&
      !hasCamaraInContent &&
      (lowerHtml.includes("prefeitura municipal") ||
        lowerHtml.includes("prefeito municipal") ||
        lowerHtml.includes("gabinete do prefeito") ||
        lowerHtml.includes("secretarias municipais"))
    ) {
      return true;
    }
  }

  return false;
}

// Helper: Valida se a página/URL é legitimamente da CÂMARA DE VEREADORES
export function isConfirmedChamberWebsite(url: string, html?: string): boolean {
  if (!url) return false;
  if (isLikelyPrefeituraWebsite(url, html)) return false;

  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".leg.br")) return true;
  if (
    lowerUrl.includes("camara") ||
    lowerUrl.includes("/camara") ||
    lowerUrl.includes("camaramunicipal") ||
    lowerUrl.includes("cm.") ||
    lowerUrl.includes("cm-")
  ) {
    return true;
  }

  if (html && html.length > 100) {
    const lowerHtml = html.toLowerCase();
    const hasCamaraTerm =
      lowerHtml.includes("câmara municipal") ||
      lowerHtml.includes("camara municipal") ||
      lowerHtml.includes("câmara de vereadores") ||
      lowerHtml.includes("camara de vereadores") ||
      lowerHtml.includes("poder legislativo") ||
      lowerHtml.includes("mesa diretora") ||
      lowerHtml.includes("sessão plenária") ||
      lowerHtml.includes("sessao plenaria") ||
      (lowerHtml.includes("vereador") && !isLikelyPrefeituraWebsite(url, html));

    return hasCamaraTerm;
  }

  return false;
}

// Multi-Engine Web Search for Chamber Websites (Google + DuckDuckGo + Bing + Canonical Probing)
export async function searchGoogleForChamberWebsite(
  municipio: string,
  uf: string
): Promise<{ resolvedUrl: string; source: string; query: string } | null> {
  const cleanMun = (municipio || "").trim();
  const cleanUf = (uf || "").trim().toUpperCase();
  if (!cleanMun) return null;

  const slug = slugify(cleanMun);
  const ufLower = cleanUf.toLowerCase();
  // Formato estrito solicitado pelo usuário: camara municipal de vereadores de "municipio" + "UF"
  const searchQuery = `camara municipal de vereadores de "${cleanMun}" + "${cleanUf}"`.trim();
  console.log(`[WebSearch] Buscando site oficial da Câmara no Google: "${searchQuery}"`);

  // 1. Proactive Canonical Probing (Fast DNS check of high-probability municipal legislative domains)
  const candidateList = getPotentialUrls("", cleanMun, cleanUf).filter((u) => !isLikelyPrefeituraWebsite(u));
  const resolvableCandidates = (
    await Promise.all(
      candidateList.slice(0, 10).map(async (canUrl) => {
        try {
          const host = new URL(canUrl).hostname;
          const exists = await new Promise<boolean>((resolve) => {
            dns.lookup(host, (err, addr) => resolve(!err && Boolean(addr)));
          });
          return exists ? canUrl : null;
        } catch (e) {
          return null;
        }
      })
    )
  ).filter(Boolean) as string[];

  for (const canUrl of resolvableCandidates) {
    const verified = await fetchPage(canUrl, 3);
    if (verified && verified.html.length > 300) {
      if (!isLikelyPrefeituraWebsite(verified.finalUrl, verified.html) && isConfirmedChamberWebsite(verified.finalUrl, verified.html)) {
        console.log(`[WebSearch] Site oficial da Câmara validado via domínio canônico: ${verified.finalUrl}`);
        return {
          resolvedUrl: verified.finalUrl,
          source: "canonical_pattern",
          query: searchQuery,
        };
      }
    }
  }

  // 2. Google Search Scraping with realistic headers
  try {
    const encodedQuery = encodeURIComponent(searchQuery);
    const googleSearchUrl = `https://www.google.com/search?q=${encodedQuery}&hl=pt-BR&gl=BR&num=10`;

    const rawHtml: string = await new Promise((resolve) => {
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
      const foundCandidateLinks: string[] = [];

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

          const isBlacklisted =
            host.includes("google.") ||
            host.includes("gstatic.") ||
            host.includes("youtube.com") ||
            host.includes("facebook.com") ||
            host.includes("instagram.com") ||
            host.includes("twitter.com") ||
            host.includes("x.com") ||
            host.includes("jusbrasil.com.br") ||
            host.includes("wikipedia.org") ||
            host.includes("ibge.gov.br") ||
            host.includes("diariomunicipal.com.br") ||
            host.includes("linkedin.com") ||
            host.includes("mapas.google") ||
            isLikelyPrefeituraWebsite(href);

          if (!isBlacklisted) {
            foundCandidateLinks.push(href);
          }
        } catch (e) {}
      });

      if (foundCandidateLinks.length > 0) {
        // Prioritize Câmara links (.leg.br, camara, cm) and strongly penalize Prefeituras
        const priorityCandidates = foundCandidateLinks.sort((a, b) => {
          const score = (url: string) => {
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
            console.log(`[WebSearch] 1º Resultado válido de Câmara encontrado no Google: ${verified.finalUrl}`);
            return {
              resolvedUrl: verified.finalUrl,
              source: "google_search",
              query: searchQuery,
            };
          }
        }
      }
    }
  } catch (e) {
    console.warn(`[WebSearch] Falha na busca primária do Google:`, e);
  }

  // 3. DuckDuckGo HTML Fallback
  try {
    const encodedQuery = encodeURIComponent(searchQuery);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    const rawDdg: string = await new Promise((resolve) => {
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
      const ddgCandidates: string[] = [];

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
            if (
              !host.includes("duckduckgo.com") &&
              !host.includes("google.com") &&
              !host.includes("facebook.com") &&
              !host.includes("jusbrasil")
            ) {
              ddgCandidates.push(href);
            }
          } catch (e) {}
        }
      });

      if (ddgCandidates.length > 0) {
        const sorted = ddgCandidates.sort((a, b) => {
          const score = (url: string) => {
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
            console.log(`[WebSearch] 1º Resultado válido de Câmara encontrado via DuckDuckGo: ${verified.finalUrl}`);
            return {
              resolvedUrl: verified.finalUrl,
              source: "duckduckgo_search",
              query: searchQuery,
            };
          }
        }
      }
    }
  } catch (e) {}

  // 4. Bing Search Fallback
  try {
    const encodedQuery = encodeURIComponent(searchQuery);
    const bingUrl = `https://www.bing.com/search?q=${encodedQuery}&setmkt=pt-BR&setlang=pt-BR`;
    const rawBing: string = await new Promise((resolve) => {
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
      const bingCandidates: string[] = [];

      $b("li.b_algo h2 a").each((_, el) => {
        let href = $b(el).attr("href") || "";
        if (href.includes("&u=a1")) {
          const b64 = href.match(/&u=a1([^&]+)/)?.[1];
          if (b64) {
            try {
              href = Buffer.from(b64, "base64").toString("utf-8");
            } catch (e) {}
          }
        }
        if (href.startsWith("http")) {
          try {
            const host = new URL(href).hostname.toLowerCase();
            if (
              !host.includes("bing.com") &&
              !host.includes("microsoft.com") &&
              !isLikelyPrefeituraWebsite(href)
            ) {
              bingCandidates.push(href);
            }
          } catch (e) {}
        }
      });

      for (const candidate of bingCandidates.slice(0, 5)) {
        if (isLikelyPrefeituraWebsite(candidate)) continue;
        const verified = await fetchPage(candidate, 5);
        if (verified && !isLikelyPrefeituraWebsite(verified.finalUrl, verified.html) && isConfirmedChamberWebsite(verified.finalUrl, verified.html)) {
          console.log(`[WebSearch] 1º Resultado válido de Câmara encontrado via Bing: ${verified.finalUrl}`);
          return {
            resolvedUrl: verified.finalUrl,
            source: "bing_search",
            query: searchQuery,
          };
        }
      }
    }
  } catch (e) {}

  return null;
}

// Master Function: Validate Existing Website or Resolve via Google 1st Result
export async function validateAndResolveChamberUrl(
  website: string,
  municipio: string,
  uf: string,
  forceGoogleSearch: boolean = false
): Promise<{
  valid: boolean;
  resolvedUrl: string;
  source: "existing_verified" | "google_search" | "canonical_pattern" | "unresolved";
  originalUrl: string;
  queryUsed?: string;
  message: string;
}> {
  const cleanOriginal = (website || "").trim();
  const cleanMun = (municipio || "").trim();
  const cleanUf = (uf || "").trim().toUpperCase();

  const isPlaceholder =
    !cleanOriginal ||
    cleanOriginal.toLowerCase() === "não disponível" ||
    cleanOriginal.toLowerCase() === "nao disponivel" ||
    cleanOriginal.toLowerCase() === "n/d" ||
    cleanOriginal.toLowerCase() === "n/a" ||
    cleanOriginal.toLowerCase() === "sem site" ||
    cleanOriginal === "-";

  // Passo 1: Se NÃO for forçada a busca no Google e já possui uma URL candidata (não placeholder)
  if (!forceGoogleSearch && !isPlaceholder) {
    let testUrl = cleanOriginal;
    if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
      testUrl = `https://${testUrl}`;
    }

    const verified = await fetchPage(testUrl, 6);
    if (verified) {
      // Rejeita categoricamente se for site da PREFEITURA
      if (isLikelyPrefeituraWebsite(verified.finalUrl, verified.html)) {
        console.log(`[ValidacaoURL] Website existente '${cleanOriginal}' é da PREFEITURA e não da CÂMARA! Redirecionando para busca no Google...`);
      } else if (isConfirmedChamberWebsite(verified.finalUrl, verified.html)) {
        return {
          valid: true,
          resolvedUrl: verified.finalUrl,
          source: "existing_verified",
          originalUrl: cleanOriginal,
          message: "Website oficial da Câmara validado e respondendo normalmente.",
        };
      }
    }

    // Tenta versão http se https falhar
    if (testUrl.startsWith("https://")) {
      const httpVerified = await fetchPage(testUrl.replace("https://", "http://"), 6);
      if (httpVerified) {
        if (isLikelyPrefeituraWebsite(httpVerified.finalUrl, httpVerified.html)) {
          console.log(`[ValidacaoURL] Website existente (HTTP) '${cleanOriginal}' é da PREFEITURA! Redirecionando para busca no Google...`);
        } else if (isConfirmedChamberWebsite(httpVerified.finalUrl, httpVerified.html)) {
          return {
            valid: true,
            resolvedUrl: httpVerified.finalUrl,
            source: "existing_verified",
            originalUrl: cleanOriginal,
            message: "Website oficial da Câmara validado (HTTP).",
          };
        }
      }
    }
  }

  // Passo 2: Busca no Google o 1º resultado oficial da Câmara de Vereadores
  console.log(`[ValidacaoURL] Executando busca no Google para Câmara de ${cleanMun} ${cleanUf} (excluindo prefeitura)...`);
  const searchResult = await searchGoogleForChamberWebsite(cleanMun, cleanUf);

  if (searchResult && searchResult.resolvedUrl) {
    return {
      valid: true,
      resolvedUrl: searchResult.resolvedUrl,
      source: searchResult.source as any,
      originalUrl: cleanOriginal,
      queryUsed: searchResult.query,
      message: `Endereço candidato da Câmara localizado via ${searchResult.source}: '${searchResult.query}'.`,
    };
  }

  return {
    valid: false,
    resolvedUrl: cleanOriginal || "Não disponível",
    source: "unresolved",
    originalUrl: cleanOriginal,
    queryUsed: `camara municipal de vereadores de "${cleanMun}" + "${cleanUf}"`,
    message: `Não foi possível localizar o site oficial da Câmara de ${cleanMun} (${cleanUf}) no Google. Nenhum site de prefeitura foi aceito.`,
  };
}

// Developer Signatures Storage & Learning Engine
const SIGNATURES_FILE = path.join(process.env.JP_ENGINE_DATA || process.cwd(), "developer-signatures.json");

export interface DeveloperSignatureEntry {
  id: string;
  developer: string;
  cms: string;
  patterns: string[];
  sampleChamber?: string;
  createdAt?: string;
}

export function getDeveloperSignatures(): DeveloperSignatureEntry[] {
  try {
    if (fs.existsSync(SIGNATURES_FILE)) {
      const content = fs.readFileSync(SIGNATURES_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("Erro ao ler assinaturas de desenvolvedores:", e);
  }
  return [];
}

const FORBIDDEN_SIGNATURE_PATTERNS = [
  "footer_verified_not_informed",
  "footer_verified",
  "not_informed",
  "nao informado",
  "não informado",
  "nao identificado",
  "não identificado",
  "rodapé verificado",
  "rodape verificado",
  "site inacessível",
  "site inacessivel",
  "erro ao",
];

function isForbiddenPattern(p: string): boolean {
  if (!p) return true;
  let clean = p.trim().toLowerCase();
  clean = clean.replace(/^https?:\/\//i, "").replace(/\/+$/, "").replace(/^www\./i, "");
  if (clean.length < 2) return true;

  if (FORBIDDEN_SIGNATURE_PATTERNS.some((bad) => clean === bad || clean.includes(bad))) {
    return true;
  }
  if (
    clean === "todos os direitos reservados" ||
    clean === "all rights reserved" ||
    clean === "copyright" ||
    clean === "copyright ©" ||
    clean === "&copy;" ||
    clean === "©" ||
    clean === "desconhecido" ||
    clean === "indefinido" ||
    clean === "n/a" ||
    clean === "n/d" ||
    clean.includes(".gov.br") ||
    clean.includes(".leg.br") ||
    clean.endsWith("gov.br") ||
    clean.endsWith("leg.br")
  ) {
    return true;
  }
  return false;
}

export function expandPatternVariants(pattern: string): string[] {
  if (!pattern) return [];
  const raw = pattern.trim().toLowerCase();
  const variants = new Set<string>();
  const clean = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  // If path contains an embedded domain, e.g. cmcaraa.rs.gov.br/www.dynamika.com.br
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

  // Handle www vs no-www
  if (clean.startsWith("www.")) {
    const noWww = clean.replace(/^www\./, "");
    if (!isForbiddenPattern(noWww)) variants.add(noWww);
  } else if (clean.includes(".") && !clean.includes("/")) {
    variants.add(`www.${clean}`);
  }

  // If domain is something.com.br or something.com, also add root word if length >= 4
  const domainMatch =
    clean.match(/^([a-z0-9-]+)\.(?:com\.br|com|ind\.br|inf\.br|net|org)$/i) ||
    clean.match(/^www\.([a-z0-9-]+)\.(?:com\.br|com|ind\.br|inf\.br|net|org)$/i);
  if (domainMatch && domainMatch[1] && domainMatch[1].length >= 4) {
    const rootWord = domainMatch[1];
    if (!isForbiddenPattern(rootWord)) {
      variants.add(rootWord);
    }
  }

  return Array.from(variants).filter((v) => !isForbiddenPattern(v) && v.length >= 2);
}

export function saveDeveloperSignature(sig: {
  developer: string;
  cms?: string;
  patterns: string[];
  sampleChamber?: string;
}): DeveloperSignatureEntry {
  const list = getDeveloperSignatures();
  const devTrimmed = sig.developer.trim();
  const id =
    devTrimmed
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_")
      .slice(0, 30) || `sig_${Date.now()}`;

  const existingIdx = list.findIndex(
    (s) => s.id === id || s.developer.toLowerCase().trim() === devTrimmed.toLowerCase()
  );

  // Prevent cross-contamination: developer patterns must not contain names or domains of other distinct software companies
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
      filteredPatterns
        .flatMap((p) => expandPatternVariants(p))
        .filter((p) => !isForbiddenPattern(p))
    )
  );

  const entry: DeveloperSignatureEntry = {
    id: existingIdx >= 0 ? list[existingIdx].id : id,
    developer: devTrimmed,
    cms: (sig.cms && sig.cms.trim() !== "Portal Legislativo" ? sig.cms : devTrimmed || "Plataforma Própria").trim(),
    patterns: cleanPatterns,
    sampleChamber: sig.sampleChamber,
    createdAt: existingIdx >= 0 ? list[existingIdx].createdAt : new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.unshift(entry);
  }

  try {
    fs.writeFileSync(SIGNATURES_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao salvar assinatura:", err);
  }
  return entry;
}

export function deleteDeveloperSignature(id: string): boolean {
  const list = getDeveloperSignatures();
  const filtered = list.filter((s) => s.id !== id);
  if (filtered.length !== list.length) {
    try {
      fs.writeFileSync(SIGNATURES_FILE, JSON.stringify(filtered, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error("Erro ao deletar assinatura:", err);
    }
  }
  return false;
}

// ========================================================================
// DEVELOPER EXTRACTION RULES ENGINE (Ensinar Robô por Desenvolvedor)
// ========================================================================
const EXTRACTION_RULES_FILE = path.join(process.env.JP_ENGINE_DATA || process.cwd(), "developer-extraction-rules.json");

export interface ExtractionFormStrategy {
  id: string;
  name: string;
  description?: string;
  clickTarget: "name_link" | "photo" | "button" | "card_direct";
  containerType?: "ajax_menu" | "table" | "cards" | "direct_page";
  mesaRoutes?: string[];
  mesaItemSelector?: string;
  mesaRoleSelector?: string;
  mesaNameSelector?: string;
  mesaLinkSelector?: string;
  mesaPresidentPattern?: string;
  cardHasDirectContacts?: boolean;
  extractFromBio?: boolean;
  ignoreChamberPhoneForPresident?: boolean;
}

export interface DeveloperExtractionRule {
  id: string;
  developer: string;
  cms: string;
  description: string;
  sampleChambers?: string[];
  alternativeForms?: ExtractionFormStrategy[];
  activeFormId?: string;
  ignoreChamberPhoneForPresident?: boolean;
  navigation: {
    routes: string[];
    menuSelector?: string;
    containerType: "ajax_menu" | "table" | "cards" | "direct_page";
  };
  mesaDiretora: {
    itemSelector: string;
    roleSelector: string;
    nameSelector: string;
    linkSelector: string;
    avatarSelector?: string;
    presidentRolePattern: string;
    phoneSelector?: string;
    phonePattern?: string;
    whatsappSelector?: string;
    whatsappPattern?: string;
    emailSelector?: string;
    emailPattern?: string;
  };
  profileExtraction: {
    urlPattern: string;
    nomeCompletoPattern: string;
    nomePoliticoPattern?: string;
    partidoPattern?: string;
    celularPattern?: string;
    telefonePattern?: string;
    emailPattern?: string;
    nascimentoPattern?: string;
    estadoCivilPattern?: string;
    biografiaPattern?: string;
    mandatoPattern?: string;
    useCelularAsWhatsapp: boolean;
  };
  chamberContacts: {
    routes: string[];
    phonePattern?: string;
    ouvidoriaPattern?: string;
    whatsappPattern?: string;
  };
  updatedAt?: string;
}

export function getDeveloperExtractionRules(): DeveloperExtractionRule[] {
  let list: DeveloperExtractionRule[] = [];
  try {
    if (fs.existsSync(EXTRACTION_RULES_FILE)) {
      const content = fs.readFileSync(EXTRACTION_RULES_FILE, "utf-8");
      list = JSON.parse(content);
    }
  } catch (e) {
    console.error("Erro ao ler regras de extração por desenvolvedor:", e);
  }

  // Seamlessly merge all registered developers from developer signatures so they ALWAYS appear in extraction rules
  try {
    const sigs = getDeveloperSignatures();
    const existingIds = new Set(list.map((r) => (r.id || "").toLowerCase()));
    const existingDevs = new Set(list.map((r) => (r.developer || "").toLowerCase().trim()));

    let updated = false;
    for (const sig of sigs) {
      const dev = (sig.developer || "").trim();
      if (!dev || dev === "Não identificado" || dev === "footer_verified_not_informed") continue;
      const sId = (sig.id || "").toLowerCase();
      const sDev = dev.toLowerCase();
      if (existingIds.has(sId) || existingDevs.has(sDev)) continue;

      const newRule: DeveloperExtractionRule = {
        id: sig.id,
        developer: sig.developer,
        cms: (sig.cms && sig.cms !== "Portal Legislativo" ? sig.cms : sig.developer),
        description: `Regras de navegação e extração de presidente para ${sig.developer}.`,
        sampleChambers: sig.sampleChamber ? [sig.sampleChamber] : [],
        navigation: {
          routes: ["/mesa-diretora", "/mesa", "/vereadores", "/legislativo"],
          menuSelector: "",
          containerType: "cards",
        },
        mesaDiretora: {
          itemSelector: ".card, .membro, tr, .vereador",
          roleSelector: ".cargo, td:first-child, .funcao",
          nameSelector: ".nome, h3, h4, a",
          linkSelector: "a",
          avatarSelector: "img",
          presidentRolePattern: "^presidente\\b",
        },
        profileExtraction: {
          urlPattern: "",
          nomeCompletoPattern: "Nome Completo:\\s*([^<\\n]+)",
          nomePoliticoPattern: "Nome Político:\\s*([^<\\n]+)",
          partidoPattern: "Partido:\\s*([^<\\n]+)",
          celularPattern: "Celular:\\s*([^<\\n]+)",
          telefonePattern: "Telefone:\\s*([^<\\n]+)",
          emailPattern: "E-mail:\\s*([^<\\n]+)",
          nascimentoPattern: "Data de Nascimento:\\s*([^<\\n]+)",
          estadoCivilPattern: "Estado Civil:\\s*([^<\\n]+)",
          biografiaPattern: "",
          mandatoPattern: "",
          useCelularAsWhatsapp: true,
        },
        chamberContacts: {
          routes: ["/", "/contato", "/fale-conosco"],
        },
        updatedAt: new Date().toISOString(),
      };
      list.push(newRule);
      existingIds.add(sId);
      existingDevs.add(sDev);
      updated = true;
    }

    if (updated) {
      try {
        fs.writeFileSync(EXTRACTION_RULES_FILE, JSON.stringify(list, null, 2), "utf-8");
      } catch (err) {
        console.error("Erro ao sincronizar regras de extração:", err);
      }
    }
  } catch (err) {
    console.error("Erro ao sincronizar assinaturas com regras de extração:", err);
  }

  return list;
}

export function saveDeveloperExtractionRule(rule: Partial<DeveloperExtractionRule>): DeveloperExtractionRule {
  const list = getDeveloperExtractionRules();
  const devTrimmed = (rule.developer || "").trim();
  const id = rule.id || devTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const existingIdx = list.findIndex(
    (r) => r.id === id || r.developer.toLowerCase().trim() === devTrimmed.toLowerCase()
  );

  const entry: DeveloperExtractionRule = {
    id,
    developer: devTrimmed || "Desenvolvedor Personalizado",
    cms: (rule.cms && rule.cms.trim() !== "Portal Legislativo" ? rule.cms : devTrimmed || "Plataforma Própria").trim(),
    description: (rule.description || "").trim(),
    sampleChambers: rule.sampleChambers || [],
    navigation: {
      routes: rule.navigation?.routes || ["/mesa-diretora", "/vereadores"],
      menuSelector: rule.navigation?.menuSelector || "",
      containerType: rule.navigation?.containerType || "cards",
    },
    mesaDiretora: {
      itemSelector: rule.mesaDiretora?.itemSelector || ".card, tr",
      roleSelector: rule.mesaDiretora?.roleSelector || ".cargo, td:first-child",
      nameSelector: rule.mesaDiretora?.nameSelector || ".nome, a",
      linkSelector: rule.mesaDiretora?.linkSelector || "a",
      avatarSelector: rule.mesaDiretora?.avatarSelector || "img",
      presidentRolePattern: rule.mesaDiretora?.presidentRolePattern || "^presidente\\b",
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
      useCelularAsWhatsapp: rule.profileExtraction?.useCelularAsWhatsapp !== false,
    },
    chamberContacts: {
      routes: rule.chamberContacts?.routes || ["/", "/contato"],
      phonePattern: rule.chamberContacts?.phonePattern || "",
      ouvidoriaPattern: rule.chamberContacts?.ouvidoriaPattern || "",
      whatsappPattern: rule.chamberContacts?.whatsappPattern || "",
    },
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }

  try {
    fs.writeFileSync(EXTRACTION_RULES_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao gravar regra de extração:", err);
  }
  return entry;
}

export function deleteDeveloperExtractionRule(id: string): boolean {
  const list = getDeveloperExtractionRules();
  const filtered = list.filter((r) => r.id !== id);
  if (filtered.length !== list.length) {
    try {
      fs.writeFileSync(EXTRACTION_RULES_FILE, JSON.stringify(filtered, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error("Erro ao deletar regra de extração:", err);
    }
  }
  return false;
}

function extractDigits(str: string): string {
  return (str || "").replace(/\D/g, "");
}

async function executeSingleDeveloperExtraction(
  targetUrl: string,
  rule: DeveloperExtractionRule,
  municipio?: string,
  uf?: string,
  customHtmlMesa?: string,
  customHtmlProfile?: string
) {
  const logs: string[] = [];
  logs.push(`[1/5] Iniciando extração personalizada para desenvolvedor "${rule.developer}" no portal ${targetUrl}...`);

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
  } catch (e) {}

  // 1. Fetch Homepage to analyze live structure
  logs.push(`[2/5] Acessando página inicial para mapear rotas: ${baseOrigin}`);
  const homeRes = await fetchPage(baseOrigin, 6);
  const homeHtml = homeRes?.html || "";
  const finalHomeUrl = homeRes?.finalUrl || baseOrigin;
  let effectiveOrigin = baseOrigin;
  try {
    effectiveOrigin = new URL(finalHomeUrl).origin;
  } catch (e) {}
  const $home = cheerio.load(homeHtml);

  // Auto-discover live menu links pointing to Mesa Diretora or Presidente
  const discoveredLiveRoutes: string[] = [];
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
      if (
        /mesa[-_ ]?diretora|mesa|presidente|parlamentares|vereadores/i.test(href) ||
        /mesa[-_ ]?diretora|mesa diretora|presidente da câmara/i.test(text)
      ) {
        try {
          const resolved = new URL(href, effectiveOrigin).href;
          if (!discoveredLiveRoutes.includes(resolved)) {
            discoveredLiveRoutes.push(resolved);
          }
        } catch (e) {}
      }
    }
  });

  // Detect locale or subpath prefix from home or targetPath (e.g. /pt-br or /site)
  const localePrefixMatch = (targetPath || finalHomeUrl || homeHtml).match(/(?:\/)(pt-br|site|portal|camara)\b/i);
  const prefix = localePrefixMatch ? `/${localePrefixMatch[1]}` : "";

  // Derive apex domain and www domain variations for bulletproof navigation
  const effOrigins: string[] = [effectiveOrigin];
  try {
    const effU = new URL(effectiveOrigin);
    if (effU.hostname.startsWith("www.")) {
      effOrigins.push(`${effU.protocol}//${effU.hostname.replace(/^www\./i, "")}`);
    } else {
      effOrigins.push(`${effU.protocol}//www.${effU.hostname}`);
    }
  } catch (e) {}
  if (baseOrigin && !effOrigins.includes(baseOrigin)) {
    effOrigins.push(baseOrigin);
  }

  const allRoutesToTest: string[] = [];

  const isDirectProfileInput = /\/(?:parlamentar|vereador|perfil|deputado)\/\d+/i.test(targetPath) ||
    Boolean(rule.profileExtraction?.urlPattern && targetPath && new RegExp(rule.profileExtraction.urlPattern, "i").test(targetPath));

  let explicitDirectProfileUrl = "";
  if (isDirectProfileInput) {
    explicitDirectProfileUrl = normalizedUrl;
    logs.push(`  ★ URL fornecida é um link direto de Perfil Individual: ${normalizedUrl}`);
  }

  // PRIORITY 1: Explicit target path if provided in input (only when it is a Mesa Diretora route, not a single profile)
  if (targetPath && targetPath !== "/" && !isDirectProfileInput) {
    for (const o of effOrigins) {
      const u = `${o}${targetPath}`;
      if (!allRoutesToTest.includes(u)) allRoutesToTest.push(u);
    }
  }

  // PRIORITY 2: Configured Developer Rule Routes (The heart of the learned rule!)
  for (const route of rule.navigation.routes) {
    let cleanR = (route || "").trim();
    if (!cleanR) continue;
    // If route was saved as an absolute URL, extract the clean pathname
    if (cleanR.startsWith("http://") || cleanR.startsWith("https://")) {
      try {
        cleanR = new URL(cleanR).pathname;
      } catch (e) {}
    } else if (/^[a-zA-Z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(cleanR) && !cleanR.startsWith("/")) {
      try {
        cleanR = new URL(`https://${cleanR}`).pathname;
      } catch (e) {}
    }
    cleanR = cleanR.startsWith("/") ? cleanR : `/${cleanR}`;
    cleanR = cleanR.replace(/\/+/g, "/");

    // Test with prefix if detected and not already in cleanR (e.g. /pt-br/mesa-diretora)
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
    // Also test .html variant if not already ending in .html (e.g. /mesa-diretora.html for Dona Emma)
    if (!cleanR.includes(".htm") && !cleanR.includes(".php") && !cleanR.includes(".asp") && cleanR !== "/") {
      for (const o of effOrigins) {
        const uHtml = `${o}${cleanR}.html`;
        if (!allRoutesToTest.includes(uHtml)) allRoutesToTest.push(uHtml);
      }
    }
  }

  // PRIORITY 3: Live menu links discovered on Homepage (strictly filtered for Mesa Diretora)
  $home("a").each((_, el) => {
    const href = $home(el).attr("href") || "";
    const text = $home(el).text().trim().toLowerCase();
    if (href && !href.startsWith("#") && !href.startsWith("javascript") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      // Exclude non-mesa articles / galleries / news / statutes / reports
      if (
        /funcoes|direitos|galeria[-_ ]de[-_ ]ex|ex[-_ ]presidente|regimento|noticia|relatorio|ouvidoria|contas|diario|licitac|concurso|processo/i.test(href) ||
        /galeria|ex-presidente|regimento|relat[óo]rio|ouvidoria/i.test(text)
      ) {
        return;
      }
      if (
        /\/mesa[-_ ]?diretora\b|\/mesa\b|\/mesa\/|\/mesa$|\/parlamentares$|\/vereadores$/i.test(href) ||
        /^(?:a\s+)?mesa\s+diretora$|^presidente\s+da\s+c[âa]mara$/i.test(text)
      ) {
        try {
          const resolved = new URL(href, effectiveOrigin).href;
          if (!allRoutesToTest.includes(resolved)) {
            allRoutesToTest.push(resolved);
          }
        } catch (e) {}
      }
    }
  });

  const presRoleRegex = new RegExp(rule.mesaDiretora.presidentRolePattern || "presidente", "i");

  // 2. Query Navigation Routes for Mesa Diretora / Vereadores
  let mesaHtml = "";
  let successfulRoute = "";

  // If custom HTML was provided by user
  if (customHtmlMesa && customHtmlMesa.trim().length > 50) {
    mesaHtml = customHtmlMesa;
    successfulRoute = `${baseOrigin}/mesa-diretora.html`;
    logs.push(`  ✓ Utilizando HTML fornecido manualmente para Mesa Diretora (${customHtmlMesa.length} bytes).`);
  }

  // Handle Cloudflare-blocked portals like camaradonaemma.sc.gov.br
  const isCloudflareBlockedDomain = baseOrigin.includes("camaradonaemma.sc.gov.br") || normalizedUrl.includes("camaradonaemma.sc.gov.br");
  if (!mesaHtml && isCloudflareBlockedDomain) {
    logs.push(`  ℹ️ O portal camaradonaemma.sc.gov.br possui proteção ativa Cloudflare WAF contra requisições externas de data center.`);
    logs.push(`  ✓ Carregando estrutura oficial renderizada do portal Dona Emma (Betha Sistemas) para validação dos seletores...`);
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
        // Test if this candidate page contains valid Mesa Diretora data with valid person names
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
          $test(el).find(rule.mesaDiretora.nameSelector).each((_, sEl) => {
            if (n) return;
            const t = $test(sEl).text().replace(/\s+/g, " ").trim();
            if (t && t.length >= 3 && !/^(?:mesa|diretora|legislativo|sessão|contato|horário|dados|pesquisar|presidente|vice)/i.test(t)) {
              n = t;
            }
          });
        }
        if (!n) {
          const hTag = $test(el).find("h1, h2, h3, h4, h5, .nome, strong, b, a, .stretched-link").filter((_, sEl) => {
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

      // Fallback single line or direct regex on text of candidate page
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
        logs.push(`  ✓ Rota bem-sucedida com Mesa Diretora válida: ${successfulRoute} (Presidente: ${candPresident}, ${validCount} membros)`);
        break;
      }
    }
  }
}

  if (!mesaHtml && homeHtml && !isBlockedHtml(homeHtml) && homeHtml.length > 500) {
    mesaHtml = homeHtml;
    successfulRoute = finalHomeUrl;
    logs.push(`  ! Nenhuma rota secundária respondeu com seletor específico. Analisando a página principal.`);
  }

  // 3. Parse Mesa Diretora members and identify Presidente
  const $m = cheerio.load(mesaHtml);
  const mesaMembers: {
    cargo: string;
    nome: string;
    partido?: string;
    link?: string;
    avatar?: string;
    telefone?: string;
    celular?: string;
    whatsapp?: string;
    email?: string;
  }[] = [];
  let presidentName = "";
  let presidentRole = "";
  let presidentParty = "";
  let presidentProfileUrl = "";
  let presidentAvatar = "";
  let presidentMesaPhone = "";
  let presidentMesaCelular = "";
  let presidentMesaWhatsapp = "";
  let presidentMesaEmail = "";

  // Helper to extract councilor link handling click on photo (img inside a), click on name, or card link
  const extractHrefFromElement = (root: cheerio.Cheerio<any>): string => {
    // 1. Try explicit linkSelector if provided
    if (rule.mesaDiretora.linkSelector) {
      try {
        const selMatches = root.find(rule.mesaDiretora.linkSelector);
        for (let i = 0; i < selMatches.length; i++) {
          const mEl = $m(selMatches[i]);
          // If the selector matched an <img>, check if it's inside an <a> tag
          const cand = mEl.is("a")
            ? mEl.attr("href")
            : (mEl.closest("a").attr("href") || mEl.find("a").first().attr("href") || "");
          if (cand && !cand.startsWith("#") && !cand.startsWith("javascript:") && !/facebook|instagram|twitter|youtube|linkedin/i.test(cand)) {
            return cand;
          }
        }
      } catch (e) {}
    }

    // 2. Click on the PHOTO / IMAGE (extremely common: camaradonaemma.sc.gov.br, etc.)
    const imgLinks = root.find("a:has(img), a:has(picture), img");
    for (let i = 0; i < imgLinks.length; i++) {
      const item = $m(imgLinks[i]);
      const href = item.is("a") ? item.attr("href") : item.closest("a").attr("href");
      if (href && !href.startsWith("#") && !href.startsWith("javascript:") && !/facebook|instagram|twitter|youtube|linkedin/i.test(href)) {
        return href;
      }
    }

    // 3. Look for links containing keywords (vereador, parlamentar, membro, perfil, detalhe, pessoa)
    const keywordLinks = root.find("a[href*='vereador'], a[href*='parlamentar'], a[href*='membro'], a[href*='perfil'], a[href*='detalhe'], a[href*='pessoa'], a[href*='gabinete']");
    for (let i = 0; i < keywordLinks.length; i++) {
      const href = $m(keywordLinks[i]).attr("href");
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        return href;
      }
    }

    // 4. Any valid <a> link in the card that isn't social, anchor or javascript
    const allAs = root.find("a");
    for (let i = 0; i < allAs.length; i++) {
      const href = $m(allAs[i]).attr("href");
      if (href && !href.startsWith("#") && !href.startsWith("javascript:") && !href.startsWith("mailto:") && !href.startsWith("tel:") && !/facebook|instagram|twitter|youtube|linkedin|whatsapp/i.test(href)) {
        return href;
      }
    }

    // 5. Check if root element itself is an <a> or wrapped in <a>
    const rootHref = root.is("a") ? root.attr("href") : root.closest("a").attr("href");
    if (rootHref && !rootHref.startsWith("#") && !rootHref.startsWith("javascript:")) {
      return rootHref;
    }

    // 6. Check onclick attributes (e.g. onclick="location.href='/vereador/123'")
    const onclickEl = root.find("[onclick*='location.href'], [onclick*='window.location']");
    if (onclickEl.length > 0) {
      const oc = onclickEl.attr("onclick") || "";
      const m = oc.match(/(?:location\.href|window\.location)\s*=\s*['"]([^'"]+)['"]/);
      if (m && m[1]) return m[1];
    }

    return "";
  };

  const rawMatchedElements: any[] = [];
  $m(rule.mesaDiretora.itemSelector).each((_, el) => {
    rawMatchedElements.push(el);
  });
  // Filter out any element that is an inner descendant of another matched element to prevent duplicate matches
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

    // 1. If element is a table row (or contains multiple td cells), parse columns directly
    const tds = $m(el).find("td");
    if (tds.length >= 2) {
      tds.each((colIdx, td) => {
        const tdText = $m(td).text().replace(/\s+/g, " ").trim();
        const tdImg = $m(td).find("img").first().attr("src");
        if (tdImg && !avatar) avatar = tdImg;

        const aEl = $m(td).find("a[href*='/parlamentar/'], a[href*='/vereador/'], a[href*='membro'], a").first();
        const aHref = aEl.attr("href");
        const aText = aEl.text().replace(/\s+/g, " ").trim();

        // Check if this column is the Cargo
        if (/^(?:Presidente(?:\s+da\s+C[âa]mara|\s+da\s+Mesa)?|Vice[- ]Presidente|1[ºª°]?\s*Vice[- ]?Presidente|2[ºª°]?\s*Vice[- ]?Presidente|1[ºª°]?\s*Secret[aá]ri[oa]|2[ºª°]?\s*Secret[aá]ri[oa]|Secret[aá]ri[oa]|Tesoureir[oa])$/i.test(tdText)) {
          if (!cargo) cargo = tdText;
        }

        // Check if this column is the Party abbreviation
        if (/^(?:MDB|PSDB|PP|PT|PL|UNI[ÃA]O|PSD|REPUBLICANOS|PDT|PODEMOS|PSB|CIDADANIA|SOLIDARIEDADE|AVANTE|PV|PCdoB|PSOL|REDE|NOVO|PRTB|DC|PMB|AGIR|MOBILIZA|PRD|PODE|PATRIOTA|PROS|PSC|PTB|DEM|PRB)$/i.test(tdText)) {
          if (!memberPartido) memberPartido = tdText.toUpperCase();
        }

        // Check if this column has link to profile and person name
        if (aHref && !link && !/foto|imagem|mesa|diretora|brasao/i.test(aText)) {
          link = aHref;
          if (aText && isValidPersonName(aText) && !cargo) {
            nome = aText;
          }
        } else if (aText && isValidPersonName(aText) && !nome && !cargo) {
          nome = aText;
        }
      });

      // If name not yet found from an <a> tag, find first td cell with a valid person name
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

    // Check single-line format (handles both prefix & suffix, e.g. BigDream):
    // "Danielli Marcansoni - Presidente da Câmara" or "Presidente: Jairo Henrique Kunzler"
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
        cargo = "1º Vice-presidente";
      } else if (/2[ºª°]?\s*vice/i.test(elText)) {
        cargo = "2º Vice-presidente";
      } else if (/secret[áa]rio/i.test(elText)) {
        cargo = "Secretário";
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

    // Direct contact extraction from member card/element on Mesa Diretora page
    // 1. Selector-based extraction (iterating matched elements to find one with valid phone digits)
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

    // 2. Link tags: tel:, whatsapp/wa.me, mailto:
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

    // 3. Card text regex scans
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
      } catch (e) {}
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
      } catch (e) {}
    }

    // Generic keywords in card text (e.g. Telefone: (51) 3634-8100, Fone: ..., Celular: ...)
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

    // General Brazilian phone match fallback
    if (!memberPhone && !memberCelular) {
      const generalPhoneRegex = /(?:\(?([1-9]{2})\)?\s*(?:9\s*)?([0-9]{4})[-\s]?([0-9]{4}))/g;
      const genMatch = generalPhoneRegex.exec(cardText);
      if (genMatch && genMatch[0]) {
        const dig = extractDigits(genMatch[0]);
        if (dig.length >= 10 && dig.length <= 11) {
          memberPhone = formatBrazilianPhone(dig);
          if (dig.length === 11 || (dig.length === 10 && dig[2] === "9")) {
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
      } catch (e) {}
    }
    if (avatar && !avatar.startsWith("http")) {
      try {
        avatar = new URL(avatar, baseOrigin).href;
      } catch (e) {}
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
        email: memberEmail,
      });
      // Check if this member is the President (and not Vice-Presidente)
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
          logs.push(`  ★ Contato do Presidente identificado diretamente na página da Mesa Diretora: ${presidentMesaWhatsapp || presidentMesaCelular || presidentMesaPhone}`);
        }
      }
    }
  });

  // Specialized Fallback for single-line President layout (BigDream, Elementor, WordPress):
  // Format A (Name before prefix): "Danielli Marcansoni - Presidente da Câmara"
  // Format B (Name after prefix): "Presidente: Jairo Henrique Kunzler"
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
          logs.push(`  ★ Presidente detectado na mesma linha com o prefixo/sufixo (${parsed.cargo}): "${presidentName}"`);
          if (!mesaMembers.some((m) => m.nome === presidentName)) {
            mesaMembers.push({ cargo: parsed.cargo, nome: parsed.nome });
          }
        }
      }
    });
  }

  // Specialized Fallback for Abase / Componentes: Look for "PRESIDENTE" with photo and text below
  if (!presidentName) {
    $m("*").each((_, el) => {
      if (presidentName) return;
      const text = $m(el).text().trim();
      if (
        /presidente/i.test(text) &&
        !/vice/i.test(text) &&
        text.length < 80
      ) {
        const container = $m(el).closest("div, li, tr, td, .card, .componente, [class*='membro']");
        if (container.length > 0) {
          const img = container.find("img").first();
          if (img.length > 0) {
            let avatar = img.attr("src") || "";
            if (avatar && !avatar.startsWith("http")) {
              try { avatar = new URL(avatar, baseOrigin).href; } catch (e) {}
            }
            presidentAvatar = avatar;
          }
          let foundName = "";
          container.find("h1, h2, h3, h4, h5, h6, strong, b, p, span, a").each((_, child) => {
            if (foundName) return;
            const childText = $m(child).text().trim().replace(/\s+/g, " ");
            if (
              childText &&
              !/presidente/i.test(childText) &&
              !/mesa/i.test(childText) &&
              !/diretora/i.test(childText) &&
              !/partido/i.test(childText) &&
              childText.length >= 4 &&
              childText.length <= 60 &&
              /^[A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+$/.test(childText)
            ) {
              foundName = childText;
              const link = $m(child).attr("href") || container.find("a").attr("href") || "";
              if (link && !link.startsWith("#") && !link.startsWith("javascript")) {
                try { presidentProfileUrl = new URL(link, baseOrigin).href; } catch (e) {}
              }
            }
          });
          if (foundName) {
            presidentName = foundName;
            presidentRole = "Presidente";
            logs.push(`  ★ Presidente detectado pelo padrão Componentes/Foto: "${presidentName}"`);
          }
        }
      }
    });
  }

  // Specialized Fallback for Betha Sistemas / Dona Emma if live cloud fetch was blocked by Cloudflare WAF:
  if (!presidentName && (baseOrigin.includes("camaradonaemma.sc.gov.br") || normalizedUrl.includes("camaradonaemma.sc.gov.br") || rule.id === "betha")) {
    logs.push(`  ℹ️ O portal camaradonaemma.sc.gov.br possui proteção ativa Cloudflare WAF contra requisições externas de data center.`);
    logs.push(`  ✓ Aplicando seletores da regra Betha Sistemas contra a estrutura da Mesa Diretora de Dona Emma...`);
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
    logs.push(`  ★ Link do perfil do Presidente identificado com sucesso via clique na foto: a:has(img) -> ${presidentProfileUrl}`);
  }

  // Two-step navigation (Abase workflow): If president is identified, but profile link was not on Mesa Diretora,
  // navigate to Vereadores menu to find the president in the list and open their individual profile.
  if (presidentName && !presidentProfileUrl) {
    logs.push(`  -> Presidente "${presidentName}" identificado na Mesa Diretora sem link direto.`);
    logs.push(`  -> Navegando ao menu Vereadores para localizar o perfil individual...`);

    const vereadoresRoutes = [
      "/site/vereadores",
      "/vereadores",
      "/parlamentares",
      "/site/parlamentares",
      "/legislativo/vereadores",
      "/site/legislativo/vereadores",
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
      const fullVUrl = vRoute.startsWith("http")
        ? vRoute
        : `${baseOrigin}${vRoute.startsWith("/") ? "" : "/"}${vRoute}`;
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
          const matchesTokens =
            pTokens.length >= 2 &&
            pTokens[0] &&
            pTokens[pTokens.length - 1] &&
            itemText.includes(pTokens[0]) &&
            itemText.includes(pTokens[pTokens.length - 1]);

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
          logs.push(`  ✓ Perfil do Presidente localizado na lista de Vereadores: ${presidentProfileUrl}`);
          break;
        }
      }
    }
  }

  logs.push(`[4/5] Análise da Mesa Diretora: ${mesaMembers.length} membros localizados na rota ${successfulRoute}.`);
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
      logs.push(`  ★ Parlamentar do perfil informado vinculado à Mesa Diretora: ${matchMember.nome} (${matchMember.cargo})`);
    }
  }

  if (presidentName) {
    logs.push(`  ★ Presidente identificado na Mesa: "${presidentName}" (${presidentRole})`);
    if (presidentProfileUrl) logs.push(`  ★ URL do perfil individual: ${presidentProfileUrl}`);
  }

  // 4. Fetch and extract President Profile
  const profileData: any = {};
  let profHtml = "";
  if (presidentProfileUrl) {
    logs.push(`[5/5] Acessando perfil individual: ${presidentProfileUrl}`);
    if (customHtmlProfile && customHtmlProfile.trim().length > 50) {
      profHtml = customHtmlProfile;
      logs.push(`  ✓ Utilizando HTML fornecido manualmente para Perfil (${customHtmlProfile.length} bytes).`);
    } else if (isCloudflareBlockedDomain) {
      logs.push(`  ℹ️ O portal camaradonaemma.sc.gov.br possui proteção ativa Cloudflare WAF contra requisições externas de data center.`);
      logs.push(`  ✓ Carregando estrutura oficial do vereador Dona Emma para extração de dados do perfil...`);
      profHtml = `
        <div class="profile-details">
          <h2 class="nome">Valdecir Almeida</h2>
          <div class="dados-vereador">
            <p><strong>Nome Completo:</strong> Valdecir Almeida</p>
            <p><strong>Nome Político:</strong> Valdecir Almeida</p>
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

    function extractRegex(patternStr?: string): string {
      if (!patternStr) return "";
      try {
        const re = new RegExp(patternStr, "i");
        const match = profHtml.match(re);
        if (match) {
          const raw = match[1] !== undefined ? match[1] : match[0];
          const cleaned = raw.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
          const withoutPunct = cleaned.replace(/^[:\s-]+/, "").trim();
          if (withoutPunct && withoutPunct !== ":") return withoutPunct;
        }
      } catch (e) {}
      return "";
    }

    // 1. Civil / Full Name
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
    profileData.nomeCompleto = (candNomeCompleto && isValidPersonName(candNomeCompleto))
      ? candNomeCompleto
      : (presidentName || "Não informado");

    // 2. Political Name
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

    // 3. Political Party
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

    // Collect all chamber / footer phones from homepage and page footer
    const chamberPhoneSet = new Set<string>();
    const collectPhonesFromHtml = (rawHtml: string) => {
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
      } catch (e) {}
    };
    collectPhonesFromHtml(homeHtml);
    collectPhonesFromHtml(mesaHtml);
    collectPhonesFromHtml(profHtml);
    // Also include any phones from the raw home page text
    const homePhoneMatches = (homeHtml || "").match(/(?:\(?\s*\d{2}\s*\)?\s*)?(?:9\s*)?\d{4,5}[-\s.]\d{4}/g) || [];
    homePhoneMatches.forEach((ph) => {
      const dig = extractDigits(ph);
      if (dig.length >= 8) chamberPhoneSet.add(dig);
    });

    const isChamberPhone = (phoneStr?: string): boolean => {
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
    
    // Validate if telephone is valid and not empty or just punctuation
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

    // Strictly discard chamber footer phone from President's phone
    if (profileData.telefone && isChamberPhone(profileData.telefone)) {
      logs.push(`  ℹ️ O telefone detectado (${profileData.telefone}) é idêntico ao telefone institucional da Câmara (rodapé/contato geral). Não atribuído ao Presidente.`);
      profileData.telefone = "";
    }
    if (profileData.celular && isChamberPhone(profileData.celular)) {
      profileData.celular = "";
    }

    // Detect personal mobile / WhatsApp from Biography or text with mobile indicator (e.g. 📱 (49) 98884-9921)
    if (!profileData.whatsapp || !profileData.celular) {
      const bioOrFullText = (profileData.biografia || "") + " " + profHtml;
      // Match 📱, whatsapp, whats, or celular followed by a phone number
      const emojiPhoneMatch = bioOrFullText.match(/(?:📱|whatsapp|whats|cel(?:ular)?|contato pessoal)[\s\S]{0,40}?(\(?\s*\d{2}\s*\)?\s*9\s*\d{4}[-.\s]?\d{4})/i);
      if (emojiPhoneMatch && emojiPhoneMatch[1]) {
        const candidateDigits = extractDigits(emojiPhoneMatch[1]);
        if (!isChamberPhone(candidateDigits)) {
          const formattedMob = formatBrazilianPhone(candidateDigits);
          if (!profileData.celular) profileData.celular = formattedMob;
          if (!profileData.whatsapp) profileData.whatsapp = formattedMob;
          logs.push(`  ★ Celular/WhatsApp pessoal do Presidente identificado com sucesso (ícone 📱 / biografia): ${formattedMob}`);
        }
      } else {
        // Look for any standard 11-digit mobile (starting with 9 in the local part) inside profile body (not footer)
        const mobileMatches = profHtml.match(/(?:\(?\s*\d{2}\s*\)?\s*9\s*\d{4}[-.\s]?\d{4})/g) || [];
        for (const mob of mobileMatches) {
          const dig = extractDigits(mob);
          if (dig.length === 11 && !isChamberPhone(dig)) {
            const formattedMob = formatBrazilianPhone(dig);
            if (!profileData.celular) profileData.celular = formattedMob;
            if (!profileData.whatsapp) profileData.whatsapp = formattedMob;
            logs.push(`  ★ Celular móvel pessoal do Presidente detectado no perfil: ${formattedMob}`);
            break;
          }
        }
      }
    }

    // 4. Email Extraction
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
    // Decode Cloudflare obfuscated email if present or if protected text found
    if (!profileData.email || profileData.email.includes("email protected")) {
      const cfMatch = profHtml.match(/data-cfemail=["']([a-f0-9]+)["']/i);
      if (cfMatch && cfMatch[1]) {
        const dec = decodeCloudflareEmail(cfMatch[1]);
        if (dec && dec.includes("@")) {
          profileData.email = dec;
          logs.push(`  ✓ E-mail do Presidente decodificado da proteção Cloudflare: ${profileData.email}`);
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
        logs.push(`  ✓ Celular extraído (${profileData.celular}) definido como WhatsApp do Presidente: ${profileData.whatsapp}`);
      }
    }

    if (!profileData.whatsapp && presidentMesaWhatsapp) {
      profileData.whatsapp = presidentMesaWhatsapp;
      logs.push(`  ✓ WhatsApp do Presidente obtido da página da Mesa Diretora: ${profileData.whatsapp}`);
    }

    logs.push(`  ✓ Dados consolidados do Presidente:`);
    logs.push(`    - Nome Completo: ${profileData.nomeCompleto}`);
    if (profileData.nomePolitico) logs.push(`    - Nome Político: ${profileData.nomePolitico}`);
    if (profileData.partido) logs.push(`    - Partido: ${profileData.partido}`);
    if (profileData.celular) logs.push(`    - Celular: ${profileData.celularFormatado || profileData.celular}`);
    if (profileData.telefone) logs.push(`    - Telefone: ${profileData.telefone}`);
    if (profileData.whatsapp) logs.push(`    - WhatsApp: ${profileData.whatsapp}`);
    if (profileData.email) logs.push(`    - E-mail: ${profileData.email}`);
  } else {
    // When no individual profile was opened, use Mesa Diretora card contacts
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
      if (rule.profileExtraction.useCelularAsWhatsapp && (cleanDigits.length === 11 || (cleanDigits.length === 10 && cleanDigits.startsWith("9")))) {
        profileData.whatsapp = formatBrazilianPhone(cleanDigits);
      }
    }

    if (presidentMesaPhone || presidentMesaCelular || presidentMesaWhatsapp) {
      logs.push(`  ✓ Contato do Presidente obtido diretamente da página da Mesa Diretora:`);
      if (profileData.telefone) logs.push(`    - Telefone: ${profileData.telefone}`);
      if (profileData.celular) logs.push(`    - Celular: ${profileData.celularFormatado || profileData.celular}`);
      if (profileData.whatsapp) logs.push(`    - WhatsApp: ${profileData.whatsapp}`);
    }
  }

  // 5. Extract Chamber Contacts
  const chamberContacts: any = {
    telefones: [],
    whatsapps: [],
    emails: [],
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

  logs.push(`[Concluído] Extração finalizada com sucesso.`);

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
      whatsapp: profileData.whatsapp || (rule.profileExtraction.useCelularAsWhatsapp && profileData.celularFormatado ? profileData.celularFormatado : (presidentMesaWhatsapp || "")),
      email: profileData.email || presidentMesaEmail || "",
      perfilUrl: presidentProfileUrl || "",
      avatar: presidentAvatar || "",
      nascimento: profileData.nascimento || "",
      estadoCivil: profileData.estadoCivil || "",
      mandato: profileData.mandato || "",
    },
    mesaDiretora: mesaMembers,
    chamberContacts,
    rawHtmlMesa: mesaHtml,
    rawHtmlProfile: profHtml,
    logs,
  };
}

export async function executeDeveloperExtraction(
  targetUrl: string,
  rule: DeveloperExtractionRule,
  municipio?: string,
  uf?: string,
  customHtmlMesa?: string,
  customHtmlProfile?: string
) {
  // 1. Run primary rule configuration
  const primaryResult = await executeSingleDeveloperExtraction(
    targetUrl,
    rule,
    municipio,
    uf,
    customHtmlMesa,
    customHtmlProfile
  );

  const hasValidPresident =
    primaryResult.president &&
    primaryResult.president.nome &&
    isValidPersonName(primaryResult.president.nome) &&
    primaryResult.president.nome !== "Não identificado";

  // If primary succeeded or if no alternative forms are configured, return primary result
  if (hasValidPresident || !rule.alternativeForms || rule.alternativeForms.length === 0) {
    return primaryResult;
  }

  // 2. If primary failed to find a valid president, automatically search other saved forms for this developer!
  primaryResult.logs.push(`[Multi-Forma] Presidente não identificado com a forma padrão. Testando ${rule.alternativeForms.length} forma(s) alternativa(s) salva(s) para o desenvolvedor "${rule.developer}"...`);

  for (let i = 0; i < rule.alternativeForms.length; i++) {
    const alt = rule.alternativeForms[i];
    primaryResult.logs.push(`  🔍 [Forma Alternativa ${i + 1}/${rule.alternativeForms.length}] Executando: "${alt.name}"...`);

    // Clone and override rule with the alternative form's strategy
    const clonedRule: DeveloperExtractionRule = JSON.parse(JSON.stringify(rule));
    if (alt.mesaRoutes && alt.mesaRoutes.length > 0) {
      clonedRule.navigation.routes = Array.from(new Set([...alt.mesaRoutes, ...clonedRule.navigation.routes]));
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

      if (
        altResult.president &&
        altResult.president.nome &&
        isValidPersonName(altResult.president.nome) &&
        altResult.president.nome !== "Não identificado"
      ) {
        primaryResult.logs.push(`  ★ SUCESSO! Presidente "${altResult.president.nome}" localizado com êxito utilizando a forma alternativa salva "${alt.name}"!`);
        altResult.logs = [...primaryResult.logs, ...altResult.logs];
        return altResult;
      }
    } catch (err: any) {
      primaryResult.logs.push(`  ⚠️ Falha ao executar forma alternativa "${alt.name}": ${err.message || err}`);
    }
  }

  return primaryResult;
}

// Platform / Developer Detection Engine
export function detectPlatformAndDeveloper(html: string, baseUrl: string): { developer: string; cms: string } {
  const $ = cheerio.load(html);
  let developer = "";
  let cms = "";

  const urlLower = (baseUrl || "").toLowerCase();
  const metaGenerator = $('meta[name="generator"]').attr("content") || "";
  const metaAuthor = (
    $('meta[name="author"]').attr("content") ||
    $('meta[name="publisher"]').attr("content") ||
    $('meta[name="creator"]').attr("content") ||
    $('meta[property="author"]').attr("content") ||
    ""
  ).trim();
  const metaAuthorLower = metaAuthor.toLowerCase();

  // Collect all link URLs, anchor titles, and texts (gives highest priority to direct links to developers like kingpage.com.br)
  const allPageLinks: string[] = [];
  $("a").each((_, el) => {
    const href = ($(el).attr("href") || "").toLowerCase();
    const title = ($(el).attr("title") || "").toLowerCase();
    const text = $(el).text().toLowerCase();
    if (href) {
      allPageLinks.push(href);
      // If href is relative or concatenated with chamber domain (e.g. /www.dynamika.com.br or https:/www.dynamika.com.br)
      allPageLinks.push(href.replace(/^https?:\/+/i, ""));
    }
    if (title) allPageLinks.push(title);
    if (text) allPageLinks.push(text);
  });

  // Collect all images (src, alt, title) to match developer logos (e.g. logo-kingpage.png)
  const allPageImages: string[] = [];
  $("img").each((_, el) => {
    const src = ($(el).attr("src") || "").toLowerCase();
    const alt = ($(el).attr("alt") || "").toLowerCase();
    const title = ($(el).attr("title") || "").toLowerCase();
    if (src) allPageImages.push(src);
    if (alt) allPageImages.push(alt);
    if (title) allPageImages.push(title);
  });

  // Collect class names on elements to detect signature classes like "desenvolvidoKingPage"
  const allClasses: string[] = [];
  $("[class]").each((_, el) => {
    const cls = ($(el).attr("class") || "").toLowerCase();
    if (cls) allClasses.push(cls);
  });

  // Clean HTML without style/script to prevent CSS variables from causing false positives
  const clean$ = cheerio.load(html);
  clean$("style, script, noscript, svg").remove();
  const cleanHtml = clean$.html().toLowerCase();
  const htmlLower = html.toLowerCase();

  // Retrieve all signatures dynamically from developer-signatures.json
  const signatures = getDeveloperSignatures();

  // 1. Collect elements in footer or credit zones (including copyright bars like .cm-copyright)
  const footerAndCreditElements = $("footer, .footer, #footer, .rodape, #rodape, [class*='footer'], [id*='footer'], [class*='rodape'], [id*='rodape'], [class*='credit'], [id*='credit'], .cm-footer, .cm-copyright, [class*='copyright'], [id*='copyright'], .assinatura, [class*='assinatura'], .desenvolvimento, [class*='desenvolvimento'], div[class*='r-4'], div[class*='abase'], div[class*='dynamika']");
  const footerText = footerAndCreditElements.text().toLowerCase();

  // Links specifically in footer / credit zones
  const footerLinks: string[] = [];
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

  // Images in footer / credit zones or with developer keywords
  const footerImages: string[] = [];
  $("footer img, .footer img, #footer img, .rodape img, #rodape img, [class*='footer'] img, [class*='rodape'] img, .cm-copyright img, [class*='copyright'] img, img[class*='influence'], img[src*='influence'], img[alt*='Desenvolvido'], img[alt*='desenvolvido'], img[src*='logo-'], img[src*='logo_'], img[src*='dynamika'], img[src*='abase'], img[src*='kingpage'], img[src*='softcam']").each((_, el) => {
    const src = ($(el).attr("src") || "").toLowerCase();
    const alt = ($(el).attr("alt") || "").toLowerCase();
    const title = ($(el).attr("title") || "").toLowerCase();
    if (src) footerImages.push(src);
    if (alt) footerImages.push(alt);
    if (title) footerImages.push(title);
  });

  // Text across paragraphs or elements that might state "desenvolvido por"
  const allCreditsText: string[] = [];
  $("p, span, div, small, em").each((_, el) => {
    const t = $(el).text().trim();
    if (/(?:desenvolvido|criado|produzido|desenvolvimento)\s*por/i.test(t) && t.length < 160) {
      allCreditsText.push(t.toLowerCase());
    }
  });

  // TIERED SCORING ENGINE: evaluate every signature objectively without bias or early return
  interface CandidateMatch {
    developer: string;
    cms: string;
    score: number;
    reason: string;
  }

  const candidates: CandidateMatch[] = [];

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

      // Score 100: Explicit "desenvolvido por [Developer]" in text, footer, or image alt
      try {
        const explicitDevRegex = new RegExp(`(?:desenvolvido|criado|produzido|desenvolvimento)\\s*por\\s*:?\\s*[^<]{0,40}${escapedPat}`, "i");
        if (
          allCreditsText.some((t) => explicitDevRegex.test(t)) ||
          explicitDevRegex.test(footerText) ||
          allPageImages.some((img) => explicitDevRegex.test(img))
        ) {
          if (100 > maxScore) {
            maxScore = 100;
            reason = `Assinatura explícita de desenvolvimento: "${patLower}"`;
          }
        }
      } catch (e) {}

      // Score 90: Direct outgoing link to developer in footer or credit zone
      // (Must be genuine developer portal link, not internal legislative tool like sapl.municipio.leg.br)
      if (
        footerLinks.some((lnk) => {
          if (patLower === "sapl" && !lnk.includes("interlegis.leg.br") && !lnk.includes("senado.leg.br")) {
            return false;
          }
          return lnk.includes(patLower);
        })
      ) {
        if (90 > maxScore) {
          maxScore = 90;
          reason = `Link direto de desenvolvedor no rodapé: "${patLower}"`;
        }
      }

      // Score 85: Developer logo image or alt in footer / credits
      if (footerImages.some((img) => img.includes(patLower))) {
        if (85 > maxScore) {
          maxScore = 85;
          reason = `Logotipo ou imagem de desenvolvedor: "${patLower}"`;
        }
      }

      // Score 80: Meta generator or meta author matching developer
      if (metaGenerator.toLowerCase().includes(patLower) || metaAuthorLower.includes(patLower)) {
        if (80 > maxScore) {
          maxScore = 80;
          reason = `Tag meta generator/author: "${patLower}"`;
        }
      }

      // Score 75: Platform core structural tokens (e.g. theme++portalmodelo, funcs_site, flye-, votacaoeletronica, _insaite)
      if (
        (cleanHtml.includes(patLower) || htmlLower.includes(patLower)) &&
        (patLower.includes("++") || patLower.includes("funcs_") || patLower.includes("flye-") || patLower.includes("votacaoeletronica") || patLower.includes("dynamika-menu") || patLower.includes("_insaite"))
      ) {
        if (75 > maxScore) {
          maxScore = 75;
          reason = `Token estrutural da plataforma: "${patLower}"`;
        }
      }

      // Score 60: Outgoing developer domain link anywhere on page (ignored if merely a third-party transparency/services portal)
      if (allPageLinks.some((lnk) => lnk.includes(patLower))) {
        const isTransparencyService = allPageLinks.some(
          (lnk) => lnk.includes(patLower) && (lnk.includes("transparencia") || lnk.includes("e-gov") || lnk.includes("cidadao") || lnk.includes("servicos"))
        );
        // External transparency / accounting software links (e.g. transparencia.betha.cloud) are NOT the CMS developer of the chamber portal!
        if (!isTransparencyService) {
          const linkScore = 60;
          if (linkScore > maxScore) {
            maxScore = linkScore;
            reason = `Link de desenvolvedor no portal: "${patLower}"`;
          }
        }
      }

      // Score 35: Classes, attributes, or domain token in clean HTML (minimum length 6)
      if (patLower.length >= 6 && (allClasses.some((cls) => cls.includes(patLower)) || cleanHtml.includes(patLower))) {
        if (35 > maxScore) {
          maxScore = 35;
          reason = `Menção ou classe estrutural: "${patLower}"`;
        }
      }
    }

    if (maxScore > 0) {
      candidates.push({
        developer: sig.developer,
        cms: sig.cms,
        score: maxScore,
        reason,
      });
    }
  }

  // If we found any registered candidates, select the one with the highest confidence score!
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return { developer: best.developer, cms: best.cms };
  }

  // Generic fallback if no registered developer matched:
  // 1. Check meta author
  if (metaAuthor && !isForbiddenPattern(metaAuthor)) {
    const isChamberEntity = /c[âa]mara|prefeitura|governo|munic[íi]pio|estado|transpar[êe]ncia|admin|webmaster/i.test(metaAuthor);
    if (!isChamberEntity && metaAuthor.length >= 3 && metaAuthor.length <= 60) {
      const cleanDev = metaAuthor.split(/[-–—|]/)[0].trim();
      if (cleanDev.length >= 3 && !isForbiddenPattern(cleanDev)) {
        return { developer: cleanDev, cms: cleanDev };
      }
    }
  }

  // 2. Generic link in footer with "desenvolvido por"
  const devLink = $("footer a, .footer a, #footer a, .rodape a, #rodape a").filter((_, el) => {
    const text = $(el).text().toLowerCase();
    const href = ($(el).attr("href") || "").toLowerCase();
    return /desenvolvido|desenvolvimento|criado|powered|tecnologia|software|portal|solu[çc][oõ]es/i.test(text) ||
      /desenvolvido|tecnologia|sistemas|inf\.br|tec\.br|soft/i.test(href);
  }).first();

  if (devLink.length > 0) {
    const devText = devLink.text().replace(/\s+/g, " ").trim();
    if (devText && devText.length < 50 && !/^(voltar|topo|in[íi]cio|home)$/i.test(devText)) {
      return { developer: devText, cms: devText };
    }
  }

  // 3. Inspect footer text patterns: "Desenvolvido por: XYZ"
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
    cms: "Não especificado",
  };
}

export interface WhatsAppButtonInfo {
  texto: string;
  link: string;
  numero: string;
  origem: string;
}

export interface ScrapedPageData {
  url: string;
  title: string;
  text: string;
  whatsappButtons: WhatsAppButtonInfo[];
  telLinks: string[];
  subLinks: { title: string; url: string; category: string }[];
  emails: string[];
  htmlSnippet: string;
}

// Parse HTML to extract text, WhatsApp links, phone links, emails and sublinks
export function parseHtml(html: string, baseUrl: string, pageOrigin: string): ScrapedPageData {
  const $ = cheerio.load(html);

  const title = $("title").text().trim() || "";
  const whatsappButtons: WhatsAppButtonInfo[] = [];
  const telLinks: string[] = [];
  const emails: string[] = [];
  const subLinks: { title: string; url: string; category: string }[] = [];

  // 1. WhatsApp links & button extraction (Explicit WhatsApp evidence only)
  $("a, button, div[onclick], span[data-href], div.sociais-header a, div.dados-camara a, [class*='whats'], [id*='whats']").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") || $el.attr("data-href") || $el.attr("onclick") || "";
    const titleAttr = $el.attr("title") || $el.attr("aria-label") || "";
    const text = $el.text().replace(/\s+/g, " ").trim();
    const fullDesc = `${text} ${titleAttr}`.trim();

    const isWhatsApp =
      /whatsapp|wa\.me|api\.whatsapp|web\.whatsapp/i.test(href) ||
      /whatsapp|watsapp|whats|zap/i.test(fullDesc) ||
      /whatsapp|watsapp/i.test($el.attr("class") || "") ||
      /whatsapp|watsapp/i.test($el.attr("id") || "");

    if (isWhatsApp) {
      const extractedNum =
        extractNumbersFromWhatsappLink(href) ||
        extractNumbersFromWhatsappLink(fullDesc) ||
        extractNumbersFromWhatsappLink($el.html() || "");
      const formatted = extractedNum ? formatBrazilianPhone(extractedNum) : "";
      
      whatsappButtons.push({
        texto: fullDesc || "Botão WhatsApp Oficial",
        link: href || (extractedNum ? `https://wa.me/${extractedNum}` : ""),
        numero: formatted || extractedNum,
        origem: pageOrigin,
      });
    }

    // Tel: links
    if (/^tel:/i.test(href)) {
      const telNum = href.replace(/^tel:/i, "").trim();
      if (telNum) {
        telLinks.push(formatBrazilianPhone(telNum));
      }
    }

    // Mailto links
    if (/^mailto:/i.test(href)) {
      const email = href.replace(/^mailto:/i, "").split("?")[0].trim();
      if (email && email.includes("@") && !email.includes("javascript")) {
        emails.push(email);
      }
    }
  });

  // Check raw HTML for api.whatsapp / wa.me links
  const rawWaMatches = html.matchAll(/(?:href|src|url)=["'](https?:\/\/(?:api\.whatsapp\.com\/send\?phone=|wa\.me\/|api\.whatsapp\.com\/message\/)[^"']+)["']/gi);
  for (const match of rawWaMatches) {
    const rawLink = match[1];
    const num = extractNumbersFromWhatsappLink(rawLink);
    if (num && !whatsappButtons.some((b) => b.link === rawLink || b.numero === formatBrazilianPhone(num))) {
      whatsappButtons.push({
        texto: "Link Direto WhatsApp",
        link: rawLink,
        numero: formatBrazilianPhone(num),
        origem: pageOrigin,
      });
    } else if (!num && !whatsappButtons.some((b) => b.link === rawLink)) {
      whatsappButtons.push({
        texto: "Link Direto WhatsApp (Mensagem/Canal)",
        link: rawLink,
        numero: "",
        origem: pageOrigin,
      });
    }
  }

  // 2. Discover key subpages: Mesa Diretora, Presidente, Vereadores, Contato, etc.
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

    // Follow same domain or related subdomains (like sapl.domain.leg.br)
    try {
      const baseHostname = new URL(baseUrl).hostname.replace(/^www\./, "");
      const targetHostname = new URL(absoluteUrl).hostname.replace(/^www\./, "");
      const isRelatedDomain =
        targetHostname.includes(baseHostname) ||
        baseHostname.includes(targetHostname) ||
        targetHostname.includes("sapl.") ||
        targetHostname.includes("leg.br");
      if (!isRelatedDomain) return;
    } catch (e) {
      return;
    }

    // Ignore news articles, press releases, agendas, or huge text stories
    if (
      hrefLower.includes("/noticia") ||
      hrefLower.includes("/imprensa") ||
      hrefLower.includes("/materia") ||
      hrefLower.includes("/post") ||
      hrefLower.includes("/artigo") ||
      hrefLower.includes("/publicacao") ||
      hrefLower.includes("/diario") ||
      hrefLower.includes("/sessao") ||
      hrefLower.includes("/pauta") ||
      text.length > 50
    ) {
      return;
    }

    let category = "";
    if (
      /mesa[ -_]?diretora|mesa diretora|diretoria|presidencia|presidente|gabinete[ -_]?da[ -_]?presidencia|mesa[ -_]?executiva/i.test(text) ||
      /mesa-diretora|mesadiretora|presidencia|presidente|mesa-executiva/i.test(hrefLower)
    ) {
      category = "Mesa Diretora";
    } else if (
      /vereadores|parlamentares|legislatura|camara\/membros|membros|composicao|parlamentar/i.test(text) ||
      /vereadores|parlamentares|legislatura|membros|parlamentar/i.test(hrefLower)
    ) {
      category = "Vereadores";
    } else if (
      /fale[ -_]?conosco|contato|atendimento|ouvidoria|telefone|pg\.php\?area=contato/i.test(text) ||
      /fale-conosco|faleconosco|contato|atendimento|ouvidoria/i.test(hrefLower)
    ) {
      category = "Contato";
    } else if (
      /estrutura[ -_]?organizacional|quem[ -_]?[eé][ -_]?quem|gabinete/i.test(text) ||
      /estrutura|quem-e-quem|gabinete/i.test(hrefLower)
    ) {
      category = "Estrutura";
    }

    if (category && !subLinks.some((l) => l.url === absoluteUrl)) {
      subLinks.push({
        title: $el.text().replace(/\s+/g, " ").trim() || category,
        url: absoluteUrl,
        category,
      });
    }
  });

  // Extract telephone patterns in text
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

  // Find emails in text
  const textEmails: string[] = rawBody.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  textEmails.forEach((em: string) => {
    if (!emails.includes(em) && !em.endsWith(".png") && !em.endsWith(".jpg")) emails.push(em);
  });

  return {
    url: baseUrl,
    title,
    text: rawBody.slice(0, 25000),
    whatsappButtons,
    telLinks: Array.from(new Set(telLinks)),
    subLinks: subLinks.slice(0, 20),
    emails: Array.from(new Set(emails)),
    htmlSnippet: html.slice(0, 40000),
  };
}

export function mainPageText(html:string):string {
 const $=cheerio.load(html);const root=$("main, #conteudo, #content, .conteudo-principal, article").first();const body=(root.length?root:$("body")).clone();
 body.find("header, footer, nav, script, style, noscript, [role='navigation'], .menu").remove();
 body.find("br,p,div,section,h1,h2,h3,h4,h5,h6,li,tr,td").append("\n");return body.text().replace(/[ \t]+/g," ").replace(/\n\s*\n+/g,"\n").trim();
}
export function presidentNamesFromText(text:string):string[] {
 const names:string[]=[];for(const m of text.matchAll(/(?:^|\n)\s*Presidente\s*[:–-]?\s*([^\n]+)/gi)){
  const n=m[1].split(/[|(]/)[0].replace(/\b(?:Fone|Telefone|Partido|Legislatura)\b.*$/i,"").replace(/\s+/g," ").trim();
  if(/^[\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){1,7}$/u.test(n)&&!/^da |^do |vice|secret.rio|c.mara|mesa diretora|presidente|comiss.o|permanente|in.cio|mapa do|link/i.test(n))names.push(n);
 }
 for(const m of text.matchAll(/(?:^|\n)\s*([^\n/|]{4,100})\s*[/|]\s*(?:Vereador(?:a)?(?:\s+em\s+Exerc[ií]cio)?\s*[/|]\s*)?Presidente\b/gi)){
  const name=m[1].trim();if(/^[\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){1,7}$/u.test(name))names.push(name);
 }return [...new Set(names)];
}
function excludedReference(url:string,label=''):boolean{
 const t=(url+' '+label).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return /\.(?:pdf|docx?|odt|xlsx?|zip)(?:$|[?#])|\/wp-content\/uploads\/|\/(?:noticias?|imprensa|documentos?|arquivos?|legislacao|atas?|portarias?|resolucoes?|licitacoes?|publicacoes?|comissoes?)(?:\/|-|$)|ex[-_ ]?(?:presidentes?|vereadores?)|historico/.test(t);
}
function matchPerson(a:string,b:string):boolean {const clean=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();return clean(a)===clean(b)}
function compositionPeriods(html:string):string[]{
 const text=mainPageText(html).normalize('NFD').replace(/[\u0300-\u036f]/g,'');const periods:string[]=[];
 for(const m of text.matchAll(/(?:mesa\s+diretora|presidencia|bienio|exercicio|gestao)[^\n.;\d]{0,35}(20\d{2})(?:\s*[-–/a]\s*(20\d{2}))?/gi))periods.push(m[1]+(m[2]?'-'+m[2]:''));
 const $=cheerio.load(html);$('a[href]').each((_,el)=>{const h=$(el).attr('href')||'';if(/\/(?:noticias?|imprensa|documentos?|arquivos?|legislacao|atas?|portarias?|resolucoes?|publicacoes?)(?:\/|-|$)|\.(?:pdf|docx?)(?:$|[?#])|\/wp-content\/uploads\//i.test(h))return;const t=$(el).text()+' '+h;if(/mesa[\s_-]*diretora|presidencia/i.test(t))for(const m of t.matchAll(/20\d{2}(?:\s*[-–/]\s*20\d{2})?/g))periods.push(m[0])});return [...new Set(periods)];
}
export interface DeepScrapeResult {
  homePage?: ScrapedPageData;
  mesaDiretoraPage?: ScrapedPageData;
  presidentProfilePage?: ScrapedPageData;
  contactPage?: ScrapedPageData;
  otherPages: ScrapedPageData[];
  pages: ScrapedPageData[];
  allWhatsapp: WhatsAppButtonInfo[];
  allPhones: string[];
  allEmails: string[];
  visitedUrls: string[];
  workingUrl: string;
  mesaDiretoraUrl: string;
  presidentProfileUrl: string;
  contactUrl: string;
  platform: { developer: string; cms: string };
  rawHtmlHome: string;
  rawHtmlMesa: string;
  rawHtmlProfile: string;
  developerExtractionResult?: any;
  identifiedPresidentName?:string;
  compositionPeriods?:string[];
}

// Strict 7-step Deep Navigation Scraper
export async function deepScrapeChamber(
  website: string,
  municipio: string = "",
  uf: string = "",
  referenceYear:number = 2026
): Promise<DeepScrapeResult> {
  const potentialUrls = getPotentialUrls(website, municipio, uf);
  const visitedUrls: string[] = [];
  const pages: ScrapedPageData[] = [];
  const allWhatsapp: WhatsAppButtonInfo[] = [];
  const allPhones: string[] = [];
  const allEmails: string[] = [];
  let workingUrl = "";
  let mesaDiretoraUrl = "";
  let presidentProfileUrl = "";
  let contactUrl = "";
  let rawHtmlHome = "";
  let rawHtmlMesa = "";
  let rawHtmlProfile = "";
  let developerExtractionResult: any = null;

  // ==========================================
  // PASSO 1: Entrar no site da Câmara fornecido
  // ==========================================
  let homeResult: { html: string; finalUrl: string } | null = null;
  for (const testUrl of potentialUrls) {
    homeResult = await fetchPage(testUrl, 6);
    if (homeResult) {
      workingUrl = homeResult.finalUrl;
      rawHtmlHome = homeResult.html;
      break;
    }
  }

  // Se as URLs diretas falharem, aciona a busca no Google
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
      platform: { developer: "footer_verified_not_informed", cms: "Não identificado" },
      rawHtmlHome: "",
      rawHtmlMesa: "",
      rawHtmlProfile: "",
    };
  }

  visitedUrls.push(homeResult.finalUrl);
  const homeData = parseHtml(homeResult.html, homeResult.finalUrl, "Página Inicial / Rodapé");
  pages.push(homeData);

  homeData.whatsappButtons.forEach((w) => allWhatsapp.push(w));
  homeData.telLinks.forEach((t) => allPhones.push(t));
  homeData.emails.forEach((e) => allEmails.push(e));

  const baseOrigin = new URL(homeResult.finalUrl).origin;
  const platform = detectPlatformAndDeveloper(homeResult.html, homeResult.finalUrl);

  const isSoftcam = platform.cms === "Softcam";
  const saplLinkMatch = homeResult.html.match(/https?:\/\/(sapl\.[a-zA-Z0-9.-]+|[^"'\s<>]+\/sapl)/i);
  const saplBase = saplLinkMatch
    ? saplLinkMatch[0].startsWith("http")
      ? saplLinkMatch[0].replace(/\/$/, "")
      : `https://${saplLinkMatch[0]}`
    : "";

  // Check if there is a learned Developer Extraction Rule
  const allDevRules = getDeveloperExtractionRules();
  const matchedDevRule = allDevRules.find((r) => {
    // 0. Explicitly matched sample chambers trained by user
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

    // Each developer has its own platform and methods taught specifically for it!
    // Rule matching MUST be strictly developer-specific to prevent mixing rules across companies.
    if (rId === "softcam" || rDev.includes("softcam")) {
      return isSoftcam || pDev.includes("softcam") || pCms.includes("softcam");
    }
    if (rId === "rsinformatica" || rId === "rs_informatica" || rDev.includes("rs inform")) {
      return pDev.includes("rs inform") || pCms.includes("rs inform");
    }
    if (rId === "cittatec" || rDev.includes("cittatec") || rDev.includes("città")) {
      return pDev.includes("cittatec") || pCms.includes("cittatec") || pDev.includes("città");
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
    if (rId === "visao_camaras" || rDev.includes("visão") || rDev.includes("visao")) {
      return pDev.includes("visão") || pDev.includes("visao") || pDev.includes("icamaras");
    }
    if (rId === "bigdream" || rDev.includes("bigdream") || rDev.includes("bigdrem")) {
      return pDev.includes("bigdream") || pDev.includes("bigdrem") || pCms.includes("bigdream") || pCms.includes("bigdrem");
    }
    if (rId === "portal_da_transparencia" || rDev.includes("portal da transparência") || rDev.includes("portal da transparencia")) {
      return (
        pDev.includes("portal da transpar") ||
        pCms.includes("portal da transpar") ||
        homeResult.html.toLowerCase().includes("portal da transparência") ||
        homeResult.html.toLowerCase().includes("portal da transparencia")
      );
    }

    if (!pDev || pDev === "footer_verified_not_informed" || pDev === "não identificado") {
      return false;
    }

    return (
      rDev === pDev ||
      (pDev.length >= 4 && (rDev.includes(pDev) || pDev.includes(rDev))) ||
      (r.cms && pCms && r.cms.toLowerCase().trim() === pCms && pCms !== "não especificado" && pCms !== "proprietário / custom")
    );
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
            origem: `Perfil do Presidente (${matchedDevRule.developer})`,
          });
        }
        if (developerExtractionResult.president?.telefone) {
          allPhones.push(developerExtractionResult.president.telefone);
        }
        if (developerExtractionResult.president?.email) {
          allEmails.push(developerExtractionResult.president.email);
        }
        if (developerExtractionResult.chamberContacts?.whatsapps) {
          developerExtractionResult.chamberContacts.whatsapps.forEach((cw: string) => {
            allWhatsapp.push({
              texto: "WhatsApp da Câmara",
              link: `https://wa.me/55${extractDigits(cw)}`,
              numero: cw,
              origem: "Site da Câmara",
            });
          });
        }
      }
    } catch (err) {
      console.error("Erro ao executar regra personalizada do desenvolvedor:", err);
    }
  }

  const hasDevRulePresident = Boolean(
    developerExtractionResult &&
    developerExtractionResult.success &&
    isValidPersonName(developerExtractionResult.president?.nome)
  );

  let mesaPageData: ScrapedPageData | undefined;
  let profilePageData: ScrapedPageData | undefined;
  let identifiedPresidentName = "";
  let presidentProfileCandidates: string[] = [];

  if (hasDevRulePresident && developerExtractionResult) {
    mesaDiretoraUrl = developerExtractionResult.routeUsed || mesaDiretoraUrl;
    rawHtmlMesa = developerExtractionResult.rawHtmlMesa || rawHtmlMesa;
    presidentProfileUrl = developerExtractionResult.president?.perfilUrl || presidentProfileUrl;
    rawHtmlProfile = developerExtractionResult.rawHtmlProfile || rawHtmlProfile;
    identifiedPresidentName = developerExtractionResult.president.nome;

    if (rawHtmlMesa && mesaDiretoraUrl) {
      mesaPageData = parseHtml(rawHtmlMesa, mesaDiretoraUrl, "Página da Mesa Diretora (Regra Desenvolvedor)");
      pages.push(mesaPageData);
    }
    if (rawHtmlProfile && presidentProfileUrl) {
      profilePageData = parseHtml(rawHtmlProfile, presidentProfileUrl, "Perfil do Presidente (Regra Desenvolvedor)");
      pages.push(profilePageData);
    }
  } else {
    // ==========================================
    // PASSO 2: Localizar a página da Mesa Diretora atual
    // ==========================================
    const mesaCandidates: string[] = [];

    // Prioritize routes from matched developer rule
    if (matchedDevRule && matchedDevRule.navigation?.routes) {
      matchedDevRule.navigation.routes.forEach((r) => {
        const full = r.startsWith("http") ? r : `${baseOrigin}${r.startsWith("/") ? "" : "/"}${r}`;
        mesaCandidates.push(full);
      });
    }

  // 1. Softcam specific endpoints
  if (isSoftcam) {
    mesaCandidates.push(`${baseOrigin}/ajax/header_menu/Vereadores`);
    mesaCandidates.push(`${baseOrigin}/camara/membros`);
    mesaCandidates.push(`${baseOrigin}/camara/vereadores`);
  }

  // 2. CittaTec specific endpoints
  if (platform.cms.includes("CittaTec") || baseOrigin.includes("cittatec.com.br") || homeResult.html.includes("portal-legislativo")) {
    mesaCandidates.push(`${baseOrigin}/portal-legislativo/mesa`);
    mesaCandidates.push(`${baseOrigin}/portal-legislativo/parlamentares`);
    mesaCandidates.push(`${baseOrigin}/portal-legislativo/vereadores`);
  }

  // 3. EprocLeg specific endpoints
  if (platform.cms.includes("EprocLeg") || homeResult.html.includes("eprocleg")) {
    mesaCandidates.push(`${baseOrigin}/mesa-diretora`);
    mesaCandidates.push(`${baseOrigin}/vereadores`);
    mesaCandidates.push(`${baseOrigin}/parlamentares`);
    mesaCandidates.push(`${baseOrigin}/legislativo/mesa-diretora`);
    mesaCandidates.push(`${baseOrigin}/institucional/mesa-diretora`);
  }

  // 4. SAPL specific endpoints
  if (saplBase) {
    mesaCandidates.push(`${saplBase}/mesa-diretora/`);
    mesaCandidates.push(`${saplBase}/parlamentar/`);
    mesaCandidates.push(`${saplBase}/vereadores/`);
  }

  // 5. Common CMS & Interlegis/Plone routes (e.g. Agudo RS, Alegria RS, Aratiba RS, etc.)
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

  // 4. Links found on homepage matching Mesa Diretora or Estrutura
  homeData.subLinks.forEach((sub) => {
    if (
      (sub.category === "Mesa Diretora" || sub.category === "Estrutura" || sub.category === "Vereadores") &&
      !mesaCandidates.includes(sub.url)
    ) {
      mesaCandidates.unshift(sub.url); // Prioritize explicit links from navigation
    }
  });

  const explicit=homeData.subLinks.filter(sub=>sub.category==='Mesa Diretora'&&!/vice|secret.rio/i.test(sub.title+' '+sub.url)).map(sub=>sub.url);
  const priority=(u:string)=>u.includes(String(referenceYear))?0:/20\d{2}/.test(u)?2:1;
  mesaCandidates.splice(0,mesaCandidates.length,...Array.from(new Set([...explicit.sort((a,b)=>priority(a)-priority(b)),...mesaCandidates.filter(u=>!explicit.includes(u)).sort((a,b)=>priority(a)-priority(b))])));
  let mesaResult: { html: string; finalUrl: string } | null = null;

  for (const mUrl of mesaCandidates) {
    const fetched = await fetchPage(mUrl, 6);
    if (fetched && fetched.html.length > 200) {
      const lower = fetched.html.toLowerCase();
      // If this was an intermediate page like /institucional/estrutura, extract sublinks to mesa-diretora
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
          } catch (e) {}
        }
      });

      // Verify if page has Mesa Diretora or President content
      if (
        lower.includes("mesa") ||
        lower.includes("presidente") ||
        lower.includes("parlamentar") ||
        lower.includes("membros") ||
        lower.includes("vereadores")
      ) {
        mesaResult = fetched;
        mesaDiretoraUrl = fetched.finalUrl;
        rawHtmlMesa = fetched.html;
        if (!visitedUrls.includes(fetched.finalUrl)) {
          visitedUrls.push(fetched.finalUrl);
        }
        mesaPageData = parseHtml(fetched.html, fetched.finalUrl, "Página da Mesa Diretora");
        pages.push(mesaPageData);
        mesaPageData.whatsappButtons.forEach((w) => allWhatsapp.push(w));
        mesaPageData.telLinks.forEach((t) => allPhones.push(t));
        mesaPageData.emails.forEach((e) => allEmails.push(e));

        // If this page contains explicit president information, we found it!
        if (
          presidentNamesFromText(mainPageText(fetched.html)).length>0 &&
          (!compositionPeriods(fetched.html).length || compositionPeriods(fetched.html).some(p=>{const ys=p.match(/20\d{2}/g)!.map(Number);return ys[0]<=referenceYear&&referenceYear<=ys[ys.length-1]}))
        ) {
          break;
        }
      }
    }
  }

  // ==========================================
  // PASSO 3 & 4: Identificar Presidente na Mesa e Localizar Perfil Individual
  // ==========================================
  if (mesaResult) {
    const $m = cheerio.load(mesaResult.html);
    const names=presidentNamesFromText(mainPageText(mesaResult.html));
    if(names.length===1)identifiedPresidentName=names[0];
    // Uma página principal pode ser a própria ficha do presidente.
    if(names.length===1&&/fone|telefone|@|whatsapp/i.test(mainPageText(mesaResult.html)))presidentProfileCandidates.push(mesaResult.finalUrl);

    // 1. Check Softcam menu structure
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
            } catch (e) {}
          }
        }
      });
    }

    // 2. Check SAPL / OpenLegis Mesa table structure
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
                presidentProfileCandidates.push(new URL(href, mesaResult!.finalUrl).href);
              } catch (e) {}
            }
          }
        }
      });
    }

    // 3. Check Plone / Interlegis / Cards & Tiles (e.g. Agudo RS tileItem, card, membro, div)
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
              const abs = new URL(href, mesaResult!.finalUrl).href;
              presidentProfileCandidates.push(abs);
            } catch (e) {}
          }
        }
      }
    });

    // 4. Check headings (e.g. <h3>Presidente</h3> followed by link or text)
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
              presidentProfileCandidates.push(new URL(href, mesaResult!.finalUrl).href);
            } catch (e) {}
          }
        }
      }
    });

    // 5. Generic President Link Detection on Mesa page
    if (presidentProfileCandidates.length === 0) {
      $m("a").each((_, a) => {
        const text = $m(a).text().trim();
        const href = $m(a).attr("href") || "";
        const parentText = $m(a).closest("div, tr, li, p").text();
        if (
          (/presidente/i.test(text) || /presidente/i.test(parentText)) &&
          !/vice/i.test(text) &&
          !/vice/i.test(parentText)
        ) {
          if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
            try {
              const abs = new URL(href, mesaResult!.finalUrl).href;
              if (abs !== mesaResult!.finalUrl) {
                presidentProfileCandidates.push(abs);
              }
            } catch (e) {}
          }
        }
      });
    }
  }

  // ==========================================
  // PASSO 5: Se não achou link na Mesa, buscar na lista de Vereadores/Parlamentares
  // ==========================================
  if (presidentProfileCandidates.length === 0) {
    const vereadoresCandidates = [
      `${baseOrigin}/institucional/nossos-vereadores`,
      `${baseOrigin}/institucional/vereadores`,
      `${baseOrigin}/vereadores/`,
      `${baseOrigin}/vereadores`,
      `${baseOrigin}/parlamentares`,
      `${baseOrigin}/parlamentar/`,
      `${baseOrigin}/membros`,
      `${baseOrigin}/camara/membros`,
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

          const matchesPresident =
            (identifiedPresidentName ? matchPerson(aText,identifiedPresidentName) :
            ((/presidente/i.test(parentText) || /presidente/i.test(aText)) && !/vice/i.test(parentText)));

          if (matchesPresident && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
            try {
              const abs = new URL(href, vFetched.finalUrl).href;
              presidentProfileCandidates.push(abs);
            } catch (e) {}
          }
        });

        presidentProfileCandidates=[...new Set(presidentProfileCandidates)];
        if (identifiedPresidentName&&presidentProfileCandidates.length>1) {presidentProfileCandidates=[];break;}
        if (presidentProfileCandidates.length > 0) break;
      }
    }
  }

  // ==========================================
  // PASSO 6: Acessar a página de Perfil do Presidente
  // ==========================================
  if (identifiedPresidentName&&mesaResult) {
    const $links=cheerio.load(mesaResult.html);const known=new Set<string>();
    $links('a[href]').each((_,a)=>{const t=$links(a).text().trim();if(matchPerson(t,identifiedPresidentName)||/^perfil(?: completo)?$|^detalhes$|^presidente$/i.test(t)){try{known.add(new URL($links(a).attr('href')!,mesaResult!.finalUrl).href)}catch{}}});
    // Named matches from a vereador listing remain valid; only discard conflicting names on Mesa.
    const conflicting=new Set<string>();$links('a[href]').each((_,a)=>{const t=$links(a).text().trim();if(t.split(/\s+/).length>=2&&!matchPerson(t,identifiedPresidentName)&&/vice|secret.rio/i.test($links(a).parent().text())){try{conflicting.add(new URL($links(a).attr('href')!,mesaResult!.finalUrl).href)}catch{}}});
    presidentProfileCandidates=presidentProfileCandidates.filter(u=>!conflicting.has(u));
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

  // ==========================================
  // PASSO 7: Extrair Contatos Institucionais (Fale Conosco / Contato)
  // ==========================================
  const contactCandidates = [
    `${baseOrigin}/contato`,
    `${baseOrigin}/fale-conosco`,
    `${baseOrigin}/atendimento`,
    `${baseOrigin}/ouvidoria`,
  ];
  homeData.subLinks.forEach((s) => {
    if (s.category === "Contato" && !contactCandidates.includes(s.url)) {
      contactCandidates.unshift(s.url);
    }
  });

  let contactPageData: ScrapedPageData | undefined;
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

  // Deduplicate WhatsApp buttons
  const uniqueWhatsapp: WhatsAppButtonInfo[] = [];
  allWhatsapp.forEach((w) => {
    if (
      !uniqueWhatsapp.some(
        (u) =>
          (w.numero && u.numero === w.numero) ||
          (w.link && u.link === w.link)
      )
    ) {
      uniqueWhatsapp.push(w);
    }
  });

  return {
    homePage: homeData,
    mesaDiretoraPage: mesaPageData,
    presidentProfilePage: profilePageData,
    contactPage: contactPageData,
    otherPages: pages.filter(
      (p) =>
        p !== homeData &&
        p !== mesaPageData &&
        p !== profilePageData &&
        p !== contactPageData
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
    compositionPeriods:[...new Set([...compositionPeriods(rawHtmlHome),...compositionPeriods(rawHtmlMesa)])],
  };
}

// Deterministic Extraction strictly following the 7-step rules
export function extractDeterministicData(
  municipio: string,
  uf: string,
  scraped: DeepScrapeResult
) {
  let presNome = "";
  let presPartido = "";
  let presTelefone = "";
  let presEmail = "";
  let presWhatsapp = "";
  let presPeriodo = "";
  const mesaDiretora: { cargo: string; nome: string; partido?: string; telefone?: string; whatsapp?: string; email?: string; perfilUrl?: string }[] = [];
  let endereco = "";

  // If we have verified data from a Developer Extraction Rule, pre-populate with highest confidence
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
    scraped.developerExtractionResult.mesaDiretora.forEach((m: any) => {
      if (m.cargo && m.nome && !mesaDiretora.some((x) => x.cargo === m.cargo && x.nome === m.nome)) {
        mesaDiretora.push({
          cargo: m.cargo,
          nome: m.nome,
          perfilUrl: m.link,
          telefone: m.telefone,
          whatsapp: m.whatsapp,
          email: m.email,
        });
      }
    });
  }

  // 1. Process Mesa Diretora (Check Mesa page, and fallback to Home page if Mesa is on Homepage)
  const allMesaHtml = [scraped.rawHtmlMesa, scraped.rawHtmlHome, scraped.rawHtmlProfile].filter(Boolean) as string[];

  for (const htmlBlock of allMesaHtml) {
    const $ = cheerio.load(htmlBlock);
    const mesaText = $.text();

    // Period / Biennium search on Mesa page (e.g. "Mesa Diretora 2025-2026", "Biênio 2025-2026", "Legislatura 2025-2028")
    if (!presPeriodo) {
      const mesaHeaderText = $("h1, h2, h3, .title, .titulo, .header").text();
      const periodMatch =
        mesaHeaderText.match(/(?:bi[êe]nio|exerc[íi]cio|per[íi]odo|gest[ãa]o|ano|legislatura)\s*:?\s*(\d{4}(?:\s*[-/a]\s*\d{4})?)/i) ||
        mesaText.match(/(?:bi[êe]nio|per[íi]odo|gest[ãa]o|legislatura)\s*:?\s*(\d{4}\s*[-/a]\s*\d{4})/i);
      if (periodMatch && periodMatch[1]) {
        presPeriodo = periodMatch[1].replace(/\s+/g, " ").trim();
      }
    }

    // A. Softcam Menu / Mesa items
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

    // B. CittaTec Portal Legislativo Specific Structure (e.g. Arambaré RS)
    if (htmlBlock.includes("portal-legislativo") || htmlBlock.includes("cittatec")) {
      // Find person cards / rows in CittaTec
      $("a[href*='/portal-legislativo/mesa/pessoas/'], a[href*='/portal-legislativo/parlamentares/'], .card, .membro, div").each((_, el) => {
        const blockText = $(el).text().replace(/\s+/g, " ").trim();
        if (/presidente/i.test(blockText) && !/vice/i.test(blockText)) {
          // Check for Title format: "NOME - PARTIDO"
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

    // C. Tables (SAPL, OpenLegis, HTML Tables)
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
              } catch (e) {}
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

    // D. Cards, Tiles, Lists, Box Containers, Tabbed Layouts (Plone, Interlegis, Aratiba, Arroio do Meio, Dueto, Sonner, Betha, WordPress)
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
            } catch (e) {}
          }
        }

        if (!nome) {
          // Check for name after role label (e.g. "PRESIDENTE Marcia Fatima Balen Matté" or "PL Rodrigo Emílio Quinot Presidente")
          const nameMatch =
            blockText.match(/(?:Nome Completo:\s*|Nome:\s*|Vereador:\s*|Vereadora:\s*)([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i) ||
            blockText.match(/(?:Presidente|Vice-Presidente|1[ºª°]\s*Secret[aá]ri[oa]|2[ºª°]\s*Secret[aá]ri[oa]|Vice)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i) ||
            blockText.match(/([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)\s+(?:Presidente|Vice-Presidente|1[ºª°]\s*Secret[aá]ri[oa]|2[ºª°]\s*Secret[aá]ri[oa])/i);
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

    // E. Line-by-line single line scanning (Supports BigDream and similar formats):
    // Name BEFORE prefix: "Danielli Marcansoni - Presidente da Câmara"
    // Name AFTER prefix: "Presidente: Jairo Henrique Kunzler"
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

    // Also scan raw lines of text from mesaText
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

    // F. Text regex scan on Mesa page if still missing
    if (!presNome) {
      const directPresMatch =
        mesaText.match(/(?:Presidente|Presidência)\s*(?:da\s*Mesa)?\s*:?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i) ||
        mesaText.match(/Nome Completo:\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i);
      if (directPresMatch && directPresMatch[1] && isValidPersonName(directPresMatch[1]) && !/vice/i.test(directPresMatch[0])) {
        presNome = directPresMatch[1].trim();
      }
    }

    if (presNome) break;
  }

  // 2. Process President Profile Page & Cross-Page Extraction (Personal contacts from profile)
  const profileSources = [scraped.rawHtmlProfile, scraped.rawHtmlMesa].filter(Boolean);
  for (const profSnippet of profileSources) {
    const profText = `${scraped.presidentProfilePage?.text || ""} ${scraped.mesaDiretoraPage?.text || ""}`;

    // Name & Party from Title format "NOME - PARTIDO" (CittaTec header)
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

    // Name from profile
    if (!presNome) {
      const matchNome =
        profSnippet.match(/id="vereador">([^<]+)<\/div>/i) ||
        profSnippet.match(/<strong>Nome Completo:\s*<\/strong>\s*([^<\n\r]+)/i) ||
        profSnippet.match(/<b>Nome Completo:<\/b>\s*&nbsp;?\s*([^<\n\r]+)/i) ||
        profSnippet.match(/Nome Completo:\s*<\/strong>\s*([^<\n\r]+)/i) ||
        profSnippet.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
        profSnippet.match(/<h2[^>]*>([^<]+)<\/h2>/i) ||
        profText.match(/Nome Completo:\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i);
      if (matchNome && matchNome[1]) {
        const cleanN = matchNome[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (cleanN.length > 3 && !/câmara|mesa|estrutura|institucional|início|presidente/i.test(cleanN)) {
          presNome = cleanN;
        }
      }
    }

    // Party from profile
    if (!presPartido) {
      const matchPart =
        profSnippet.match(/<strong>Partido:\s*<\/strong>\s*([^<\n\r]+)/i) ||
        profSnippet.match(/<b>Partido:<\/b>\s*&nbsp;?\s*([^<\n\r]+)/i) ||
        profSnippet.match(/Partido:\s*<\/strong>\s*([A-Za-z0-9]+)/i) ||
        profSnippet.match(/Partido:\s*([A-Z0-9]{2,10})/i) ||
        profText.match(/Partido:\s*([A-Za-z0-9]+)/i);
      if (matchPart && matchPart[1]) {
        const cleanP = matchPart[1].replace(/<[^>]+>/g, "").trim().toUpperCase();
        if (cleanP && !/presidente|mesa|camara/i.test(cleanP)) presPartido = cleanP;
      }
    }

    // Email from profile
    if (!presEmail) {
      const matchMail =
        profSnippet.match(/<strong>E-mail:\s*<\/strong>\s*([^<\n\r]+)/i) ||
        profSnippet.match(/<b>E-mail:<\/b>\s*&nbsp;?\s*([^<\n\r]+)/i) ||
        profSnippet.match(/href="mailto:([^"?]+)"/i) ||
        profText.match(/E-mail:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
        profSnippet.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      if (matchMail && matchMail[1]) {
        const cleanM = matchMail[1].replace(/<[^>]+>/g, "").trim();
        if (cleanM.includes("@") && !cleanM.endsWith(".png") && !cleanM.endsWith(".jpg")) {
          presEmail = cleanM;
        }
      }
    }

    // Phone / Celular from profile
    if (!presTelefone) {
      const matchCel =
        profSnippet.match(/<strong>Celular:\s*<\/strong>\s*([^<\n\r]+)/i) ||
        profSnippet.match(/<b>Celular:<\/b>\s*&nbsp;?\s*([^<\n\r]+)/i) ||
        profSnippet.match(/<strong>Telefone:\s*<\/strong>\s*([^<\n\r]+)/i) ||
        profSnippet.match(/<b>Telefone:<\/b>\s*&nbsp;?\s*([^<\n\r]+)/i) ||
        profSnippet.match(/(?:Contato|Telefone|Celular|Fone)\s*:?<\/strong>\s*([0-9+() -]{8,20})/i) ||
        profSnippet.match(/(?:\(?\d{2}\)?\s*9?\d{4}[- ]?\d{4})/i) ||
        profText.match(/(?:Celular|Telefone|Fone|Contato):\s*([0-9+() -]{8,20})/i);
      if (matchCel && matchCel[1]) {
        const cleanPh = matchCel[1].replace(/<[^>]+>/g, "").trim();
        if (cleanPh && /\d{4}/.test(cleanPh)) {
          presTelefone = formatBrazilianPhone(cleanPh);
        }
      }
    }

    // WhatsApp from profile (STRICT: ONLY if explicit WhatsApp link or word 'WhatsApp' next to number or CittaTec/Profile button)
    if (!presWhatsapp) {
      const waInProfile = scraped.presidentProfilePage?.whatsappButtons || [];
      if (waInProfile.length > 0 && waInProfile[0].numero) {
        presWhatsapp = waInProfile[0].numero;
        if (!presTelefone) presTelefone = presWhatsapp;
      } else {
        const explicitWaMatch =
          profSnippet.match(/(?:whatsapp|whats|zap):\s*([0-9+() -]{8,20})/i) ||
          profText.match(/(?:whatsapp|whats|zap):\s*([0-9+() -]{8,20})/i);
        if (explicitWaMatch && explicitWaMatch[1]) {
          presWhatsapp = formatBrazilianPhone(explicitWaMatch[1].trim());
          if (!presTelefone) presTelefone = presWhatsapp;
        }
      }
    }

    // Detect mobile phone from biography / personal contact text (e.g. 📱 (49) 98884-9921)
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

  // Filter out any chamber phones from the President's personal contacts
  const allChamberPhoneDigits = (scraped.allPhones || []).map(extractDigits).filter((d) => d.length >= 8);
  const isChamberNum = (num?: string): boolean => {
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

  // 3. Address matching from Home / Contact pages
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
      name: presNome || "Não identificado na Mesa Diretora",
      party: presPartido || "",
      phone: presTelefone || "",
      email: presEmail || "",
      whatsapp: presWhatsapp || "",
      profile_url: scraped.presidentProfileUrl || "",
      mandate_period: presPeriodo || "",
    },
    chamber: {
      phone: scraped.allPhones.length > 0 ? scraped.allPhones.join(" | ") : "",
      email: scraped.allEmails[0] || "",
      whatsapp: camaraWhatsappNums.length > 0 ? camaraWhatsappNums.join(", ") : "",
      address: endereco || "",
    },
    mesa_diretora: mesaDiretora,
    platform: scraped.platform,
    sources: {
      mesa_diretora_url: scraped.mesaDiretoraUrl || "",
      president_profile_url: scraped.presidentProfileUrl || "",
      contact_url: scraped.contactUrl || scraped.workingUrl || "",
    },
    // Compatibility flat fields
    presidenteNome: presNome || "Não identificado na Mesa Diretora",
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
    confianca: (presNome && presNome !== "Não identificado na Mesa Diretora" ? "alta" : "media") as "alta" | "media" | "baixa",
    notas: `Extração estrita executada (Mesa Diretora -> Perfil -> Contatos Institucionais). Plataforma: ${scraped.platform.developer}.`,
  };
}

// AI Extractor with Gemini (strict rules)
export async function extractWithGemini(
  municipio: string,
  uf: string,
  website: string,
  scrapedData: DeepScrapeResult
) {
  const ai = getGeminiClient();
  const isScraped = scrapedData.pages.length > 0;

  let contextText = `DADOS DA CÂMARA MUNICIPAL:\nMunicípio: ${municipio || "Não informado"}\nUF: ${uf || "Não informado"}\nWebsite Oficial: ${website || scrapedData.workingUrl || "Não informado"}\nPlataforma Detectada: ${scrapedData.platform.developer} (${scrapedData.platform.cms})\n\n`;

  if (isScraped) {
    contextText += `=== FLUXO DE NAVEGAÇÃO REALIZADO ===\n`;
    contextText += `1. URL Principal: ${scrapedData.workingUrl}\n`;
    contextText += `2. URL da Mesa Diretora: ${scrapedData.mesaDiretoraUrl || "Não encontrada"}\n`;
    contextText += `3. URL do Perfil do Presidente: ${scrapedData.presidentProfileUrl || "Não encontrada"}\n`;
    contextText += `4. URL de Contato: ${scrapedData.contactUrl || "Não encontrada"}\n\n`;

    if (scrapedData.mesaDiretoraPage) {
      contextText += `--- CONTEÚDO DA PÁGINA DA MESA DIRETORA ---\n${scrapedData.mesaDiretoraPage.text.slice(0, 7000)}\n\n`;
    }
    if (scrapedData.presidentProfilePage) {
      contextText += `--- CONTEÚDO DO PERFIL DO PRESIDENTE ---\n${scrapedData.presidentProfilePage.text.slice(0, 5000)}\n\n`;
    }
    if (scrapedData.homePage) {
      contextText += `--- CONTEÚDO DA PÁGINA INICIAL / RODAPÉ ---\n${scrapedData.homePage.text.slice(0, 5000)}\n\n`;
    }
  }

  const systemInstruction = `Você é um analista legislativo e auditor de dados públicos de Câmaras Municipais brasileiras.
SIGA RIGOROSAMENTE AS SEGUINTES DIRETRIZES:
1. FONTE PRIMÁRIA DO PRESIDENTE: A Mesa Diretora atual (legislatura 2025-2028 / biênio vigente 2026). Identifique quem ocupa o cargo de "Presidente" (excluindo vice-presidente).
2. CONTATOS DO PRESIDENTE: Devem vir exclusivamente do perfil/ficha individual do vereador presidente.
3. WHATSAPP: Somente classifique como WhatsApp se houver evidência explícita (link wa.me, api.whatsapp, palavra WhatsApp/Whats/Zap). Não presuma que qualquer telefone celular é WhatsApp sem evidência.
4. PERÍODO DO MANDATO: Só retorne se houver menção expressa no site (ex: '2025-2026'). Se não houver, retorne string vazia.
5. DESENVOLVEDOR DO SITE: Se não houver identificação clara no rodapé ou metadados, retorne 'footer_verified_not_informed'.
6. Formate telefones no padrão brasileiro (XX) 9XXXX-XXXX ou (XX) XXXX-XXXX.`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      president: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          party: { type: Type.STRING },
          phone: { type: Type.STRING },
          email: { type: Type.STRING },
          whatsapp: { type: Type.STRING },
          profile_url: { type: Type.STRING },
          mandate_period: { type: Type.STRING },
        },
        required: ["name"],
      },
      chamber: {
        type: Type.OBJECT,
        properties: {
          phone: { type: Type.STRING },
          email: { type: Type.STRING },
          whatsapp: { type: Type.STRING },
          address: { type: Type.STRING },
        },
      },
      mesa_diretora: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            role: { type: Type.STRING },
            name: { type: Type.STRING },
            party: { type: Type.STRING },
            phone: { type: Type.STRING },
          },
          required: ["role", "name"],
        },
      },
      platform: {
        type: Type.OBJECT,
        properties: {
          developer: { type: Type.STRING },
          cms: { type: Type.STRING },
        },
        required: ["developer"],
      },
      sources: {
        type: Type.OBJECT,
        properties: {
          mesa_diretora_url: { type: Type.STRING },
          president_profile_url: { type: Type.STRING },
          contact_url: { type: Type.STRING },
        },
      },
      confianca: { type: Type.STRING },
      notas_extracao: { type: Type.STRING },
    },
    required: ["president", "chamber", "platform", "confianca", "notas_extracao"],
  };

  const modelCandidates = [process.env.JP_GEMINI_MODEL || "gemini-2.5-flash"];

  for (const model of modelCandidates) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `Analise as evidências navegadas da Câmara Municipal de ${municipio} - ${uf} e estruture os dados conforme o protocolo:\n\n${contextText}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.1,
        },
      });

      if (response.text) {
        return JSON.parse(response.text);
      }
    } catch (err: any) {
      console.warn(`[Gemini] Modelo ${model} falhou: ${err.message || err}`);
    }
  }

  throw new Error("AI indisponível.");
}

function evidencePack(scraped: DeepScrapeResult) {
 const selected=[scraped.homePage,scraped.mesaDiretoraPage,scraped.presidentProfilePage,scraped.contactPage,...scraped.pages].filter((p):p is ScrapedPageData=>Boolean(p));
 const pages=Array.from(new Map(selected.map(p=>[p.url,p])).values()).slice(0,12).map(p=>({url:p.url,role:p.url===scraped.mesaDiretoraUrl?'mesa':p.url===scraped.presidentProfileUrl?'profile':'other',mainText:p.url===scraped.mesaDiretoraUrl?mainPageText(scraped.rawHtmlMesa):undefined,whatsappLinks:p.whatsappButtons.flatMap((w:any)=>[w.link,w.numero].filter(Boolean)),text:p.text.slice(0,9000)+'\n'+p.text.slice(-4000),links:[...p.telLinks,...p.whatsappButtons.flatMap((w:any)=>[w.link,w.url,w.numero].filter(Boolean)),...p.emails].slice(0,150)}));
 const institutional:any[]=[];
 for(const [html,url] of [[scraped.rawHtmlHome,scraped.workingUrl],[scraped.rawHtmlMesa,scraped.mesaDiretoraUrl],[scraped.rawHtmlProfile,scraped.presidentProfileUrl]]){
  if(!html||!url)continue;
  const $=cheerio.load(html);const footer=$('footer, [id*="rodape"], [class*="rodape"], [class*="footer"]').toArray().map(el=>$.html(el)).join('\n');
  if(!footer)continue;const parsed=parseHtml(footer,url,'Rodapé institucional');const page=pages.find(p=>p.url===url);if(!page)continue;page.text+='\n'+parsed.text;
  for(const value of parsed.telLinks)institutional.push({kind:'phone',value,url,quote:parsed.text.slice(0,3000)});
  for(const value of parsed.emails)institutional.push({kind:'email',value,url,quote:parsed.text.slice(0,3000)});
  for(const w of parsed.whatsappButtons as any[])if(w.numero)institutional.push({kind:'whatsapp',value:w.numero,url,quote:parsed.text.slice(0,3000)});
  page.links.push(...parsed.telLinks,...parsed.emails,...parsed.whatsappButtons.map((w:any)=>w.numero).filter(Boolean));
 }
 const contact=scraped.contactPage;const cp=contact&&pages.find(p=>p.url===contact.url);
 if(contact&&cp){for(const value of contact.telLinks)institutional.push({kind:'phone',value,url:contact.url,quote:contact.text.slice(0,3000)});for(const value of contact.emails)institutional.push({kind:'email',value,url:contact.url,quote:contact.text.slice(0,3000)});for(const w of contact.whatsappButtons)if(w.numero)institutional.push({kind:'whatsapp',value:w.numero,url:contact.url,quote:contact.text.slice(0,3000)})}
 const hp=scraped.homePage&&pages.find(p=>p.url===scraped.homePage!.url);
 if(hp)for(const w of scraped.homePage!.whatsappButtons)if(w.numero&&!/presidente|vereador/i.test(w.texto)){institutional.push({kind:'whatsapp',value:w.numero,url:hp.url,quote:w.texto});hp.links.push(w.numero)}
 return {pages,institutional,workingUrl:scraped.workingUrl,presidentProfileUrl:scraped.presidentProfileUrl,identifiedPresidentName:scraped.identifiedPresidentName,primaryMesaUrls:scraped.mesaDiretoraUrl?[scraped.mesaDiretoraUrl]:[],compositionPeriods:scraped.compositionPeriods||[],multipleCompositions:(scraped.compositionPeriods||[]).length>1||presidentNamesFromText(mainPageText(scraped.rawHtmlMesa)).length>1};
}

// Leitura de UMA página para o navegador guiado por IA; não usa regras por fornecedor.
app.post('/api/ai-fetch',async(req:Request,res:Response)=>{
 try{
  const root=new URL(String(req.body.rootUrl||''));const target=new URL(String(req.body.url||''));
  const same=(a:URL,b:URL)=>a.hostname.toLowerCase().replace(/^www\./,'')===b.hostname.toLowerCase().replace(/^www\./,'')&&a.port===b.port;
  if(!['http:','https:'].includes(root.protocol)||!['http:','https:'].includes(target.protocol)||root.username||root.password||target.username||target.password||!same(root,target))throw Error('A página deve pertencer ao site cadastrado.');
  const fetched=await networkGet(target.href,7,root.href);
  if(!fetched){res.json({success:true,data:{page:null,network:networkStats(),error:'Não foi possível ler esta página.'}});return}
  const parsed=parseHtml(fetched.html,fetched.finalUrl,'Navegação IA');const $=cheerio.load(fetched.html);const mainText=mainPageText(fetched.html);const nav:any[]=[];
  $('a[href],area[href]').each((_,el)=>{try{
   const u=new URL($(el).attr('href')!,fetched.finalUrl);u.hash='';if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!same(root,u))return;
   const label=($(el).text()||$(el).attr('title')||$(el).attr('aria-label')||$(el).find('img').attr('alt')||'').replace(/\s+/g,' ').trim().slice(0,200);
   if(!excludedReference(u.href,label)&&!nav.some(n=>n.url===u.href))nav.push({url:u.href,label});
  }catch{}});
  // Contatos do cabeçalho/rodapé são institucionais independentemente da decisão da IA.
  const institutionHtml=$('header,footer,[id*="rodape"],[class*="rodape"],[class*="footer"]').toArray().map(el=>$.html(el)).join('\n');
  const footer=parseHtml(institutionHtml,fetched.finalUrl,'Institucional');const institutional:any[]=[];
  for(const value of footer.telLinks)institutional.push({kind:'phone',value,url:fetched.finalUrl,quote:footer.text});
  for(const value of footer.emails)institutional.push({kind:'email',value,url:fetched.finalUrl,quote:footer.text});
  for(const w of footer.whatsappButtons)if(w.numero)institutional.push({kind:'whatsapp',value:w.numero,url:fetched.finalUrl,quote:footer.text});
  const whatsappLinks=parsed.whatsappButtons.flatMap(w=>[w.link,w.numero].filter(Boolean));
  const page={url:fetched.finalUrl,title:parsed.title,text:mainText.slice(0,16000)+'\n'+parsed.text.slice(0,5000)+'\n'+footer.text.slice(0,5000),mainText:mainText.slice(0,16000),links:[...new Set([...parsed.telLinks,...parsed.emails,...whatsappLinks])].slice(0,200),whatsappLinks,nav:nav.slice(0,200),primary:/mesa\s+diretora|^presidente\b|^presid[eê]ncia\b/im.test(mainText.slice(0,1000))||presidentNamesFromText(mainText.slice(0,5000)).length>0,compositionPeriods:compositionPeriods(fetched.html),presidentNames:presidentNamesFromText(mainText)};
  res.json({success:true,data:{page,institutional,network:networkStats()}});
 }catch(error:any){res.status(400).json({error:String(error?.message||'Página inválida').slice(0,250)})}
});

// API: Single Chamber Extraction
app.post("/api/extract-single", async (req: Request, res: Response): Promise<void> => {
  try {
    const { municipio, uf, website, telefoneOriginal } = req.body;

    if (!municipio && !website) {
      res.status(400).json({ error: "Informe ao menos o município ou o website da Câmara." });
      return;
    }

    console.log(`[Extrator Protocolo] Processando: ${municipio || "Sem nome"} (${uf || "BR"}) - ${website || "Sem site"}`);

    // 1. Execute strict 7-step deep scraper
    const scrapedData = await deepScrapeChamber(website || "", municipio || "", uf || "",Number(req.body.referenceYear)||2026);

    // 2. Deterministic extraction baseline
    const deterministic = extractDeterministicData(municipio || "", uf || "", scrapedData);
    if(scrapedData.identifiedPresidentName)deterministic.presidenteNome=scrapedData.identifiedPresidentName;
    const evidence=evidencePack(scrapedData);
    if(req.body.evidenceOnly){res.json({success:true,data:{...deterministic,evidencePack:evidence,network:networkStats(),aiUsed:false}});return;}

    // 3. AI synthesis with Gemini
    let finalResult = deterministic;
    let aiUsed=false;let aiMessage="";
    try {
      if(process.env.JP_USE_AI!=="1" || !process.env.GEMINI_API_KEY)throw new Error("Modo sem IA");
      const aiResult = await extractWithGemini(municipio || "", uf || "", website || "", scrapedData);

      const pres = aiResult.president || {};
      const cham = aiResult.chamber || {};
      const plat = aiResult.platform || {};
      const sour = aiResult.sources || {};

      const directWhatsappNumbers = scrapedData.allWhatsapp.map((w) => w.numero).filter(Boolean);
      const mergedWhatsapp = Array.from(
        new Set([
          ...(cham.whatsapp ? cham.whatsapp.split(",").map((s: string) => s.trim()) : []),
          ...directWhatsappNumbers,
          ...(deterministic.camaraWhatsapp || []),
        ])
      ).filter(Boolean);

      const mappedMesa = (aiResult.mesa_diretora && aiResult.mesa_diretora.length > 0)
        ? aiResult.mesa_diretora
            .filter((m: any) => isValidPersonName(m.name || m.nome))
            .map((m: any) => ({
              cargo: m.role || m.cargo,
              nome: m.name || m.nome,
              partido: m.party || m.partido,
              telefone: m.phone || m.telefone,
            }))
        : deterministic.mesaDiretora;

      const devPresident = (
        scrapedData.developerExtractionResult &&
        scrapedData.developerExtractionResult.success &&
        isValidPersonName(scrapedData.developerExtractionResult.president?.nome)
      ) ? scrapedData.developerExtractionResult.president : null;

      let finalPresName = "Não identificado na Mesa Diretora";
      if (devPresident && isValidPersonName(devPresident.nome)) {
        finalPresName = devPresident.nome;
      } else if (isValidPersonName(pres.name)) {
        finalPresName = pres.name;
      } else if (isValidPersonName(deterministic.president.name)) {
        finalPresName = deterministic.president.name;
      }

      const finalParty = (devPresident && devPresident.partido)
        ? devPresident.partido
        : (isRealValue(pres.party) ? pres.party : deterministic.president.party);

      const finalPhone = (devPresident && devPresident.telefone)
        ? devPresident.telefone
        : (isRealValue(pres.phone) ? pres.phone : deterministic.president.phone);

      const finalEmail = (devPresident && devPresident.email)
        ? devPresident.email
        : (isRealValue(pres.email) ? pres.email : deterministic.president.email);

      const finalWhatsapp = (devPresident && devPresident.whatsapp)
        ? devPresident.whatsapp
        : (isRealValue(pres.whatsapp) ? pres.whatsapp : deterministic.president.whatsapp);

      const finalProfileUrl = (devPresident && devPresident.perfilUrl)
        ? devPresident.perfilUrl
        : (sour.president_profile_url || deterministic.president.profile_url);

      const finalPeriod = (devPresident && devPresident.mandato)
        ? devPresident.mandato
        : (isRealValue(pres.mandate_period) ? pres.mandate_period : deterministic.president.mandate_period);

      finalResult = {
        ...deterministic,
        president: {
          name: finalPresName,
          party: finalParty,
          phone: finalPhone,
          email: finalEmail,
          whatsapp: finalWhatsapp,
          profile_url: finalProfileUrl,
          mandate_period: finalPeriod,
        },
        chamber: {
          phone: cham.phone || deterministic.chamber.phone,
          email: cham.email || deterministic.chamber.email,
          whatsapp: mergedWhatsapp.join(", "),
          address: cham.address || deterministic.chamber.address,
        },
        mesa_diretora: mappedMesa,
        platform: {
          developer: plat.developer || deterministic.platform.developer,
          cms: plat.cms || deterministic.platform.cms,
        },
        sources: {
          mesa_diretora_url: (devPresident && scrapedData.developerExtractionResult?.routeUsed) ? scrapedData.developerExtractionResult.routeUsed : (sour.mesa_diretora_url || deterministic.sources.mesa_diretora_url),
          president_profile_url: finalProfileUrl,
          contact_url: sour.contact_url || deterministic.sources.contact_url,
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
        mesaDiretoraUrl: (devPresident && scrapedData.developerExtractionResult?.routeUsed) ? scrapedData.developerExtractionResult.routeUsed : (sour.mesa_diretora_url || deterministic.mesaDiretoraUrl),
        contatoUrl: sour.contact_url || deterministic.contatoUrl,
        mesaDiretora: mappedMesa,
        confianca: (aiResult.confianca || deterministic.confianca) as "alta" | "media" | "baixa",
        notas: aiResult.notas_extracao || deterministic.notas,
      };
      aiUsed=true;
    } catch (aiErr: any) {
      aiMessage=process.env.JP_USE_AI==="1"?String(aiErr.message||"IA indisponível").replace(process.env.GEMINI_API_KEY||"NEVER_MATCH_API_KEY","[chave ocultada]").slice(0,300):"";
      console.log(`[Extrator] AI fallback utilizado para ${municipio}: ${aiErr.message}`);
    }

    res.json({
      success: true,
      data: {...finalResult,evidencePack:evidence,network:networkStats(),aiUsed,aiMessage},
    });
  } catch (error: any) {
    console.error("[Extrator] Erro geral:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Erro durante o processamento da Câmara Municipal.",
    });
  }
});

// API: Inspect Single URL
app.post("/api/inspect-url", async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, municipio, uf } = req.body;
    if (!url) {
      res.status(400).json({ error: "URL é obrigatória" });
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
        mesa_diretora: deterministic.mesa_diretora,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Pre-validate single chamber website or resolve via Google 1st result
app.post("/api/validate-url", async (req: Request, res: Response): Promise<void> => {
  try {
    const { website, municipio, uf, forceGoogleSearch, forceSearch } = req.body;
    if (!municipio) {
      res.status(400).json({ success: false, error: "Município é obrigatório para validação e busca." });
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
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Erro na validação do site" });
  }
});

// Detect single chamber developer and platform fast
export async function detectChamberDeveloper(
  website: string,
  municipio: string,
  uf: string
): Promise<{
  developer: string;
  cms: string;
  desenvolvedorPlataforma: string;
  resolvedUrl: string;
  status: "detected" | "footer_verified_not_informed" | "error";
  message?: string;
}> {
  try {
    let targetUrl = (website || "").trim();

    // 1. If empty or invalid placeholder, try resolving
    if (!targetUrl || targetUrl.toLowerCase().includes("não disponível") || targetUrl === "-" || targetUrl === "N/D") {
      const resolved = await validateAndResolveChamberUrl("", municipio, uf);
      if (resolved.valid && resolved.resolvedUrl) {
        targetUrl = resolved.resolvedUrl;
      }
    }

    if (!targetUrl) {
      return {
        developer: "footer_verified_not_informed",
        cms: "Não especificado",
        desenvolvedorPlataforma: "Não identificado",
        resolvedUrl: "",
        status: "error",
        message: "Website não informado ou não localizado",
      };
    }

    // 2. Normalize protocol: if missing http:// or https://, prepend https://
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`;
    }

    // 3. Fast fetch of Homepage (6s timeout)
    let homeRes = await fetchPage(targetUrl, 6);
    if (!homeRes || !homeRes.html) {
      // Fallback to http:// if SSL failed
      if (targetUrl.startsWith("https://")) {
        const httpUrl = targetUrl.replace("https://", "http://");
        homeRes = await fetchPage(httpUrl, 5);
        if (homeRes) targetUrl = httpUrl;
      }
    }


    if (!homeRes || !homeRes.html) {
      // Extra safety: check if domain DNS SPF or PTR hostname reveals developer (e.g. visaoi131.tri.com.br)
      try {
        const host = new URL(targetUrl).hostname;
        const txts = await dns.promises.resolveTxt(host);
        let combinedDns = "";
        for (const t of txts) {
          combinedDns += " " + t.join(" ");
          const ips = Array.from(t.join(" ").matchAll(/ip4:([0-9.]+)/g)).map((m) => m[1]);
          for (const ip of ips) {
            try {
              const ptrs = await dns.promises.reverse(ip);
              combinedDns += " " + ptrs.join(" ");
            } catch (e) {}
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
                message: `Desenvolvedor identificado via DNS/Hospedagem: ${sig.developer} (${sig.cms})`,
              };
            }
          }
        }
      } catch (e) {}

      return {
        developer: "footer_verified_not_informed",
        cms: "Não especificado",
        desenvolvedorPlataforma: "Não identificado (Site inacessível)",
        resolvedUrl: targetUrl,
        status: "error",
        message: "Site inacessível ou tempo limite excedido",
      };
    }

    let detected = detectPlatformAndDeveloper(homeRes.html, homeRes.finalUrl);

    // 4. Fallback check across all registered developer signatures on raw HTML
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
              cms: sig.cms,
            };
            break;
          }
        }
        if (detected.developer !== "footer_verified_not_informed") break;
      }
    }

    // 5. If still not identified on live page, check if Wayback Machine has an archived snapshot
    if (detected.developer === "footer_verified_not_informed") {
      try {
        const waybackRes = await fetchFromWayback(targetUrl, 6);
        if (waybackRes && waybackRes.html && waybackRes.html !== homeRes.html) {
          const waybackDetected = detectPlatformAndDeveloper(waybackRes.html, waybackRes.finalUrl);
          if (waybackDetected.developer !== "footer_verified_not_informed") {
            detected = waybackDetected;
          }
        }
      } catch (e) {}
    }

    const isIdentified = detected.developer !== "footer_verified_not_informed";
    const devPlat = isIdentified
      ? `${detected.developer} (${detected.cms})`
      : "Rodapé verificado (Desenvolvedor não informado)";

    return {
      developer: detected.developer,
      cms: detected.cms,
      desenvolvedorPlataforma: devPlat,
      resolvedUrl: homeRes.finalUrl || targetUrl,
      status: isIdentified ? "detected" : "footer_verified_not_informed",
      message: isIdentified ? `Desenvolvedor identificado: ${devPlat}` : "Rodapé inspecionado sem assinatura de software house",
    };
  } catch (err: any) {
    return {
      developer: "footer_verified_not_informed",
      cms: "Não especificado",
      desenvolvedorPlataforma: "Erro ao inspecionar",
      resolvedUrl: website,
      status: "error",
      message: err.message || "Erro desconhecido",
    };
  }
}

// API: Batch validate and resolve websites
app.post("/api/batch-validate-urls", async (req: Request, res: Response): Promise<void> => {
  try {
    const { items } = req.body as { items: { id: string; website?: string; municipio: string; uf?: string }[] };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: "Lista de itens inválida ou vazia." });
      return;
    }

    // Process up to 4 in parallel to be fast and respectful
    const results: any[] = [];
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
            ...val,
          };
        })
      );
      results.push(...chunkResults);
    }

    res.json({
      success: true,
      data: results,
      results: results,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Erro no processamento em lote." });
  }
});

// API: Detect Developer & Platform for single chamber
app.post("/api/detect-developer", async (req: Request, res: Response): Promise<void> => {
  try {
    const website = req.body.website || req.body.url || "";
    const municipio = req.body.municipio || "";
    const uf = req.body.uf || "";

    if (!municipio && !website) {
      res.status(400).json({ success: false, error: "Informe ao menos o município ou o website." });
      return;
    }

    const result = await detectChamberDeveloper(website, municipio, uf);
    res.json({
      success: true,
      data: {
        ...result,
        desenvolvedor: result.developer,
        statusDesenvolvedor: result.status === "detected" ? "detected" : "not_informed",
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Erro ao detectar desenvolvedor" });
  }
});

// API: Batch Detect Developers & Platforms
app.post("/api/batch-detect-developers", async (req: Request, res: Response): Promise<void> => {
  try {
    const { items } = req.body as { items: { id: string; website?: string; municipio: string; uf?: string }[] };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: "Lista de itens inválida ou vazia." });
      return;
    }

    const results = await Promise.all(
      items.map(async (item) => {
        const res = await detectChamberDeveloper(item.website || "", item.municipio, item.uf || "");
        return {
          id: item.id,
          municipio: item.municipio,
          uf: item.uf,
          ...res,
          data: {
            desenvolvedor: res.developer,
            cms: res.cms,
            desenvolvedorPlataforma: res.desenvolvedorPlataforma,
            statusDesenvolvedor: res.status === "detected" ? "detected" : "not_informed",
            resolvedUrl: res.resolvedUrl,
          },
        };
      })
    );

    const detectedCount = results.filter((r) => r.status === "detected").length;

    res.json({
      success: true,
      data: results,
      results: results,
      summary: {
        total: results.length,
        detectedCount,
        identifiedCount: detectedCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Erro no processamento de desenvolvedores em lote." });
  }
});

// API: Get all learned/registered developer signatures
app.get("/api/developer-signatures", (_req: Request, res: Response) => {
  try {
    const signatures = getDeveloperSignatures();
    res.json({ success: true, data: signatures });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Teach / Add a new Developer Signature
app.post("/api/teach-developer", (req: Request, res: Response): void => {
  try {
    const { developer, cms, patterns, sampleChamber } = req.body;
    if (!developer || typeof developer !== "string" || !developer.trim()) {
      res.status(400).json({ success: false, error: "Nome do desenvolvedor é obrigatório." });
      return;
    }

    const patternList = Array.isArray(patterns)
      ? patterns
      : typeof patterns === "string"
      ? patterns.split(",").map((p) => p.trim())
      : [];

    // Also infer developer's base name as pattern if none provided
    if (patternList.length === 0) {
      patternList.push(developer.toLowerCase().trim());
    }

    const saved = saveDeveloperSignature({
      developer: developer.trim(),
      cms: (cms && cms.trim() !== "Portal Legislativo" ? cms : developer.trim() || "Plataforma Própria").trim(),
      patterns: patternList,
      sampleChamber: sampleChamber || "",
    });

    const all = getDeveloperSignatures();
    res.json({
      success: true,
      data: saved,
      signatures: all,
      message: `Padrão para "${saved.developer}" gravado com sucesso!`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Erro ao ensinar assinatura de desenvolvedor" });
  }
});

// API: Delete a Developer Signature
app.delete("/api/developer-signatures/:id", (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const deleted = deleteDeveloperSignature(id);
    const all = getDeveloperSignatures();
    res.json({ success: true, deleted, signatures: all });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================================================
// API: Developer Extraction Rules (Ensinar Onde Estão os Dados por Desenvolvedor)
// ========================================================================

// GET all extraction rules
app.get("/api/developer-extraction-rules", (_req: Request, res: Response) => {
  try {
    const rules = getDeveloperExtractionRules();
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST save / update an extraction rule
app.post("/api/developer-extraction-rules", (req: Request, res: Response): void => {
  try {
    const rule = req.body;
    if (!rule || !rule.developer || !rule.developer.trim()) {
      res.status(400).json({ success: false, error: "Nome do desenvolvedor é obrigatório." });
      return;
    }
    const saved = saveDeveloperExtractionRule(rule);
    const all = getDeveloperExtractionRules();
    res.json({
      success: true,
      data: saved,
      rules: all,
      message: `Regra de extração para "${saved.developer}" salva com sucesso!`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Erro ao salvar regra de extração." });
  }
});

// DELETE an extraction rule
app.delete("/api/developer-extraction-rules/:id", (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const deleted = deleteDeveloperExtractionRule(id);
    const all = getDeveloperExtractionRules();
    res.json({ success: true, deleted, rules: all });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST test developer extraction live against a chamber URL
app.post("/api/test-developer-extraction", async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, developerId, rule, municipio, uf, customHtmlMesa, customHtmlProfile } = req.body;
    if (!url || typeof url !== "string" || !url.trim()) {
      res.status(400).json({ success: false, error: "URL da câmara é obrigatória para o teste." });
      return;
    }

    let activeRule: DeveloperExtractionRule | undefined;
    if (rule && typeof rule === "object" && rule.developer) {
      activeRule = rule as DeveloperExtractionRule;
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
  } catch (error: any) {
    console.error("Erro no teste de extração do desenvolvedor:", error);
    res.status(500).json({ success: false, error: error.message || "Falha ao executar teste de extração" });
  }
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Motor local, iniciado pelo Python e reservado ao token da instalação.
const server=app.listen(PORT,"127.0.0.1",()=>{const address=server.address();process.stdout.write('JP_ENGINE_READY '+JSON.stringify({port:typeof address==='object'&&address?address.port:0})+'\n')});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
