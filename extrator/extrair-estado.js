const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const unzipper = require("unzipper");
const { parse } = require("csv-parse/sync");
const iconv = require("iconv-lite");
const { spawnSync } = require("child_process");

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

const UF = normalizeCli(getArg("uf", "MG"));
const MUNICIPIO_FILTRO = getArg("municipio", "").trim();
const CARGO = "VEREADOR";
const ANOS = [2004];
const TODAS_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ",
  "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];
const ALL_MODE = process.argv.includes("--all");


function normalizeCli(value) {
  return String(value || "").trim().toUpperCase();
}

const DATASET_IDS = {
  2004: ["candidatos-2004"],
  2008: ["candidatos-2008"],
  2012: ["candidatos-2012"],
  2016: ["candidatos-2016"],
  2020: ["candidatos-2020-subtemas", "candidatos-2020"],
  2024: ["candidatos-2024"],
};

const API_BASE =
  "https://dadosabertos.tse.jus.br/api/3/action/package_show";

const WORK_DIR = path.resolve(`trabalho_tse_${UF.toLowerCase()}`);
const OUTPUT_DIR = path.resolve(`fotos_vereadores_${UF}`);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function safeName(value) {
  return String(value || "SEM_NOME")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function getField(row, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name) && row[name] !== "") {
      return row[name];
    }
  }
  return "";
}

async function downloadStream(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 extrator-dados-publicos-tse",
      Accept: "*/*",
    },
    redirect: "follow",
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ao baixar ${url}`);
  }

  const temp = `${destination}.part`;
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temp));
  fs.renameSync(temp, destination);
}

async function getDataset(year) {
  const ids = DATASET_IDS[year] || [`candidatos-${year}`];

  for (const id of ids) {
    const response = await fetch(
      `${API_BASE}?id=${encodeURIComponent(id)}`
    );

    if (!response.ok) continue;

    const body = await response.json();
    if (body.success && body.result) return body.result;
  }

  throw new Error(`Conjunto de candidatos de ${year} não encontrado.`);
}

function chooseResource(resources, type) {
  const prepared = resources.map((resource) => ({
    resource,
    name: normalize(resource.name),
    description: normalize(resource.description),
    url: String(resource.url || ""),
  }));

  if (type === "candidatos") {
    const exact = prepared.find(({ name }) => name === "CANDIDATOS");
    if (exact) return exact.resource;

    const fallback = prepared.find(
      ({ name }) =>
        name.includes("CANDIDAT") &&
        !name.includes("FOTO") &&
        !name.includes("CERTID") &&
        !name.includes("BENS") &&
        !name.includes("COLIG")
    );
    if (fallback) return fallback.resource;
  }

  if (type === "fotos") {
    const exact = prepared.find(
      ({ name }) =>
        name === `${UF} - FOTOS DE CANDIDATOS` ||
        name === `${UF} FOTOS DE CANDIDATOS`
    );
    if (exact) return exact.resource;

    const fallback = prepared.find(
      ({ name }) => name.includes(UF) && name.includes("FOTO")
    );
    if (fallback) return fallback.resource;
  }

  throw new Error(`Recurso de ${type} não encontrado.`);
}

async function openZip(zipPath) {
  return unzipper.Open.file(zipPath);
}

function chooseUfCandidateEntry(directory) {
  const csvEntries = directory.files.filter(
    (entry) =>
      entry.type === "File" &&
      /\.csv$/i.test(entry.path) &&
      /consulta[_-]?cand/i.test(entry.path)
  );

  const escapedUf = UF.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ufPatterns = [
    new RegExp(`(?:^|[_/.-])${escapedUf}(?:[_/.-]|$)`, "i"),
    new RegExp(`consulta[_-]?cand.*${escapedUf}.*\\.csv$`, "i"),
  ];

  for (const pattern of ufPatterns) {
    const match = csvEntries.find((entry) => pattern.test(entry.path));
    if (match) return match;
  }

  if (csvEntries.length === 1) return csvEntries[0];

  const anyUfCsv = directory.files.find(
    (entry) =>
      entry.type === "File" &&
      /\.csv$/i.test(entry.path) &&
      new RegExp(`(?:^|[_/.-])${escapedUf}(?:[_/.-]|$)`, "i").test(entry.path)
  );

  if (anyUfCsv) return anyUfCsv;

  throw new Error(
    `CSV de candidaturas de ${UF} não encontrado. CSVs no ZIP: ${csvEntries
      .slice(0, 10)
      .map((e) => e.path)
      .join(", ")}`
  );
}

async function extractEntry(entry, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await pipeline(entry.stream(), fs.createWriteStream(destination));
}

function decodeCsv(buffer) {
  let text = buffer.toString("utf8");
  if (text.includes("\uFFFD")) {
    text = iconv.decode(buffer, "windows-1252");
  }
  return text;
}

function readCandidateCsv(file) {
  const buffer = fs.readFileSync(file);
  return parse(decodeCsv(buffer), {
    columns: (headers) =>
      headers.map((header) =>
        String(header)
          .replace(/^\uFEFF/, "")
          .replace(/^"|"$/g, "")
          .trim()
      ),
    delimiter: ";",
    quote: '"',
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });
}

function getMunicipality(row) {
  return getField(
    row,
    "NM_UE",
    "NOME_UE",
    "NM_MUNICIPIO",
    "NOME_MUNICIPIO"
  );
}

function getMunicipalityCode(row) {
  // Em 2004, o código usado no nome da foto é o código da unidade eleitoral
  // (CD_UE). Exemplo observado: FMG54453_00179_div.png.
  // Por isso CD_UE precisa ter prioridade sobre CD_MUNICIPIO.
  return getField(
    row,
    "CD_UE",
    "CODIGO_UE",
    "NR_UE",
    "CD_MUNICIPIO",
    "CODIGO_MUNICIPIO"
  );
}

function getOffice(row) {
  return getField(row, "DS_CARGO", "DESCRICAO_CARGO");
}

function getSituation(row) {
  return getField(
    row,
    "DS_SIT_TOT_TURNO",
    "DESC_SIT_TOT_TURNO",
    "DS_SITUACAO_TOTALIZACAO"
  );
}

function isElected(row) {
  const situation = normalize(getSituation(row));

  // Abrange as variações históricas usadas pelo TSE:
  // ELEITO, ELEITO POR QP, ELEITO POR MÉDIA e, em alguns arquivos,
  // apenas MÉDIA ou QUOCIENTE PARTIDÁRIO.
  return (
    situation.startsWith("ELEITO") ||
    situation === "MEDIA" ||
    situation.includes("POR MEDIA") ||
    situation === "QUOCIENTE PARTIDARIO" ||
    situation === "QP"
  );
}

function filterElectedCouncilors(rows) {
  const selected = rows.filter((row) => {
    const sameUf =
      normalize(getField(row, "SG_UF", "SIGLA_UF")) === UF;
    const isCouncilor = normalize(getOffice(row)) === CARGO;
    const elected = isElected(row);
    const municipalityMatches =
      !MUNICIPIO_FILTRO ||
      normalize(getMunicipality(row)) === normalize(MUNICIPIO_FILTRO);

    return sameUf && isCouncilor && elected && municipalityMatches;
  });

  if (!selected.length) {
    const scope = MUNICIPIO_FILTRO
      ? `${MUNICIPIO_FILTRO}/${UF}`
      : `o estado ${UF}`;

    throw new Error(`Nenhum vereador eleito encontrado para ${scope}.`);
  }

  return selected;
}

function candidateIds(row) {
  const values = [
    getField(row, "SQ_CANDIDATO", "SEQ_CANDIDATO"),
    getField(row, "NR_CANDIDATO", "NUMERO_CANDIDATO"),
  ];

  const ids = new Set();

  for (const value of values) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) continue;

    ids.add(digits);
    try {
      ids.add(String(BigInt(digits)));
    } catch {}
  }

  return [...ids];
}

function entryNumericTokens(entryPath) {
  const base = path.basename(entryPath, path.extname(entryPath));
  const tokens = base.match(/\d+/g) || [];
  const normalized = new Set(tokens);

  for (const token of tokens) {
    try {
      normalized.add(String(BigInt(token)));
    } catch {}
  }

  return normalized;
}

function buildPhotoIndex(photoEntries) {
  const index = new Map();

  for (const entry of photoEntries) {
    for (const token of entryNumericTokens(entry.path)) {
      if (!index.has(token)) index.set(token, entry);
    }
  }

  return index;
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeNumericString(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";

  try {
    return String(BigInt(digits));
  } catch {
    return digits.replace(/^0+/, "") || "0";
  }
}

function findPhotoEntry2004(photoEntries, row) {
  // Regra confirmada no arquivo histórico de 2004:
  //
  // nome da foto = F + UF + SG_UE + "_" + SQ_CANDIDATO com 5 dígitos + "_div"
  //
  // Exemplo:
  // SG_UE = 54453
  // SQ_CANDIDATO = 179
  // => FMG54453_00179_div.png
  const sgUeRaw = getField(row, "SG_UE");
  const sqCandidatoRaw = getField(row, "SQ_CANDIDATO");

  const sgUe = digitsOnly(sgUeRaw);
  const sqCandidato = digitsOnly(sqCandidatoRaw);

  if (!sgUe || !sqCandidato) {
    return null;
  }

  const sqCandidatoPadded = sqCandidato.padStart(5, "0");
  const expectedBase =
    `F${UF}${sgUe}_${sqCandidatoPadded}_DIV`.toUpperCase();

  return (
    photoEntries.find((entry) => {
      const base = path
        .basename(entry.path, path.extname(entry.path))
        .toUpperCase();

      return base === expectedBase;
    }) || null
  );
}

function findPhotoEntry(photoIndex, photoEntries, row, year) {
  // 2004 é especial: o número do candidato se repete entre municípios.
  // Nunca fazer fallback por NR_CANDIDATO isolado nesse ano.
  if (year === 2004) {
    return findPhotoEntry2004(photoEntries, row);
  }

  // 2008 em diante: preserva exatamente a lógica que já estava funcionando.
  for (const id of candidateIds(row)) {
    if (photoIndex.has(id)) return photoIndex.get(id);
  }

  return null;
}

async function extractSelectedPhotos(photoZip, elected, year) {
  const directory = await openZip(photoZip);
  const photoEntries = directory.files.filter(
    (entry) =>
      entry.type === "File" && /\.(jpe?g|png|webp)$/i.test(entry.path)
  );
  const photoIndex = buildPhotoIndex(photoEntries);
  const results = [];

  for (const row of elected) {
    const municipality = getMunicipality(row);
    const fullName = getField(row, "NM_CANDIDATO", "NOME_CANDIDATO");
    const ballotName = getField(
      row,
      "NM_URNA_CANDIDATO",
      "NOME_URNA_CANDIDATO"
    );
    const number = getField(row, "NR_CANDIDATO", "NUMERO_CANDIDATO");
    const party = getField(row, "SG_PARTIDO", "SIGLA_PARTIDO");
    const candidateId = getField(row, "SQ_CANDIDATO", "SEQ_CANDIDATO");
    const situation = getSituation(row);

    const municipalityDir = path.join(
      OUTPUT_DIR,
      safeName(municipality),
      String(year)
    );
    fs.mkdirSync(municipalityDir, { recursive: true });

    const photoEntry = findPhotoEntry(photoIndex, photoEntries, row, year);
    let relativeFile = "FOTO NÃO ENCONTRADA";

    if (photoEntry) {
      const extension = path.extname(photoEntry.path).toLowerCase() || ".jpg";
      const base = safeName(fullName || ballotName);
      let filename = `${base}${extension}`;
      let destination = path.join(municipalityDir, filename);

      if (fs.existsSync(destination)) {
        filename = `${base} ${String(number)}${extension}`;
        destination = path.join(municipalityDir, filename);
      }

      await extractEntry(photoEntry, destination);
      relativeFile = path.relative(OUTPUT_DIR, destination);
      console.log(`  OK: ${municipality} > ${year} > ${filename}`);
    } else {
      if (year === 2004) {
        const sgUe = digitsOnly(getField(row, "SG_UE"));
        const sqCandidato = digitsOnly(getField(row, "SQ_CANDIDATO"));
        const paddedSq = sqCandidato.padStart(5, "0");

        console.log(
          `  FOTO NÃO ENCONTRADA: ${municipality} - ${fullName || ballotName}` +
          ` [SG_UE=${sgUe} | SQ_CANDIDATO=${sqCandidato}` +
          ` | esperado: F${UF}${sgUe}_${paddedSq}_div]`
        );
      } else {
        console.log(
          `  FOTO NÃO ENCONTRADA: ${municipality} - ${fullName || ballotName}`
        );
      }
    }

    results.push([
      UF,
      municipality,
      year,
      ballotName,
      fullName,
      number,
      party,
      situation,
      candidateId,
      relativeFile,
    ]);
  }

  return results;
}

async function processYear(year, reportRows) {
  console.log(`\n========== ${year} ==========`);

  const yearWork = path.join(WORK_DIR, String(year));
  const candidateZip = path.join(yearWork, "candidatos.zip");
  const candidateCsv = path.join(yearWork, `consulta_cand_${year}_${UF}.csv`);
  const photoZip = path.join(yearWork, `fotos_${UF}.zip`);

  fs.mkdirSync(yearWork, { recursive: true });

  const dataset = await getDataset(year);
  const candidateResource = chooseResource(dataset.resources, "candidatos");
  const photoResource = chooseResource(dataset.resources, "fotos");

  console.log(`Candidatos: ${candidateResource.name}`);
  console.log(`Fotos: ${photoResource.name}`);

  if (!fs.existsSync(candidateZip)) {
    console.log("Baixando ZIP de candidaturas...");
    await downloadStream(candidateResource.url, candidateZip);
  }

  if (!fs.existsSync(candidateCsv)) {
    console.log(`Extraindo somente o CSV de ${UF}...`);
    const directory = await openZip(candidateZip);
    const ufEntry = chooseUfCandidateEntry(directory);
    console.log(`CSV selecionado: ${ufEntry.path}`);
    await extractEntry(ufEntry, candidateCsv);
  }

  const rows = readCandidateCsv(candidateCsv);
  const elected = filterElectedCouncilors(rows);

  console.log(`Vereadores eleitos encontrados: ${elected.length}`);

  if (!fs.existsSync(photoZip)) {
    console.log(`Baixando ZIP de fotos de ${UF} em fluxo...`);
    await downloadStream(photoResource.url, photoZip);
  }

  console.log("Extraindo somente as fotos dos eleitos...");
  const rowsForReport = await extractSelectedPhotos(
    photoZip,
    elected,
    year
  );

  reportRows.push(...rowsForReport);
}


function runAllStates() {
  console.log("==============================================");
  console.log(" EXTRAÇÃO NACIONAL DE VEREADORES ELEITOS");
  console.log(" Estados: 26 | DF não possui eleição municipal");
  console.log("==============================================");

  const failures = [];

  for (let i = 0; i < TODAS_UFS.length; i++) {
    const uf = TODAS_UFS[i];

    console.log(
      `\n\n########## ESTADO ${i + 1}/${TODAS_UFS.length}: ${uf} ##########\n`
    );

    const result = spawnSync(
      process.execPath,
      [__filename, "--uf", uf],
      {
        stdio: "inherit",
        windowsHide: false,
      }
    );

    if (result.error || result.status !== 0) {
      failures.push(uf);
      console.error(`\n*** FALHA AO PROCESSAR ${uf}. Continuando... ***\n`);
    } else {
      console.log(`\n*** ${uf} FINALIZADO ***\n`);
    }
  }

  console.log("\n==============================================");
  console.log(" EXTRAÇÃO NACIONAL FINALIZADA");
  console.log("==============================================");

  if (failures.length) {
    console.log(`Estados com falha: ${failures.join(", ")}`);
    console.log(
      "Você pode executar novamente somente esses estados com " +
      "node extrair-estado.js --uf SIGLA"
    );
    process.exitCode = 1;
  } else {
    console.log("Todos os 26 estados foram processados.");
  }
}

async function main() {
  console.log(`UF: ${UF}`);
  console.log(
    MUNICIPIO_FILTRO
      ? `Município: ${MUNICIPIO_FILTRO}`
      : "Municípios: todos"
  );

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const reportRows = [
    [
      "uf",
      "municipio",
      "ano",
      "nome_urna",
      "nome_completo",
      "numero",
      "partido",
      "situacao",
      "sq_candidato",
      "arquivo",
    ],
  ];

  for (const year of ANOS) {
    try {
      await processYear(year, reportRows);
    } catch (error) {
      console.error(`ERRO EM ${year}: ${error.message}`);
      reportRows.push([year, "", "", "", "", "ERRO", "", error.message]);
    }

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `vereadores_eleitos_${UF}.csv`),
      "\uFEFF" +
        reportRows.map((row) => row.map(csvEscape).join(";")).join("\n"),
      "utf8"
    );
  }

  console.log("\nFinalizado.");
  console.log(`Fotos: ${OUTPUT_DIR}`);
  console.log(
    `Relatório: ${path.join(OUTPUT_DIR, `vereadores_eleitos_${UF}.csv`)}`
  );
}

if (ALL_MODE) {
  runAllStates();
} else {
  main().catch((error) => {
    console.error("\nERRO FATAL:", error);
    process.exitCode = 1;
  });
}