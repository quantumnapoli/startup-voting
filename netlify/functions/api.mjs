// API unica per votanti e admin. Storage: Netlify Blobs (store "voting").
//
// Chiavi:
//   config           -> { open, criteria[], startups[], voters[] }
//   votes/<voterId>  -> { "<startupIdx>": { scores: {c1..c7}, ts } }
// Ogni votante scrive solo il proprio blob (nessuna contesa tra giurati).
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const config = { path: "/api/*" };

const CRITERIA = [
  { id: "innovazione", label: "Innovazione" },
  { id: "fattibilita", label: "Fattibilità" },
  { id: "impatto", label: "Impatto Sociale" },
  { id: "team", label: "Team" },
  { id: "scalabilita", label: "Scalabilità" },
  { id: "esg", label: "Livello ESG" },
  { id: "mercato", label: "Opportunità di mercato" },
];
const MIN = 1;
const MAX = 10;

const VOTER_NAMES = [
  "Fabbri", "Morgante", "Niglio", "Invitalia", "Rome Future Week",
  "Murate Idea Park", "Cataldo", "Zest", "Pagliari", "Lazioinnova",
  "Sapienza Hub", "Urbe HUB", "Elis", "ASSODIGIT", "Almaviva", "KPMG",
  "BIP", "unfoldtomorrow",
];
const STARTUPS = [
  "AcacIA Innovate: Korvia, ESG Intelligence Platform",
  "AI Tempo Brand: Il primo media di presenza, dedicato ai Brand",
  "APPYPILGRIM: Ecosystem Phygital per turismo spirituale e slow tourism",
  "BBB: Bio-Mattone per un’edilizia sostenibile in legno armato",
  "BIPV: Rivestimenti ad alta efficienza energetica per l’edilizia e l’architettura",
  "Brief: La tua redazione con i tuoi contenuti in audio naturale ed emozionale",
  "Capio Robotics: manipolazione flessibile per le piattaforme robotiche",
  "Cicerone: attraction & retention dei professionisti stranieri",
  "Cybertec Services: computArte, IA privata per tutti",
  "E-voluzione: stage orchestra audio and video experience",
  "Elephant Brain Lab: la piattaforma per le prestazioni mentali e fisiche",
  "DraftIngo: crea e consolida il tuo patrimonio giuridico, amministrativo, professionale e aziendale",
  "Grow Up: la Piattaforma HR che Incrementa il",
  "Handy Signs: il tuo assistente Lis a portata di mano",
  "Human Oversight Labs: dimostra che dietro il tuo lavoro c'è una persona",
  "IInformatica: sentinel grid, il sistema nervoso della rete elettrica",
  "InsiemePiù: il primo Sistema Operativo del Caregiving",
  "Invent Solutions: prevenzione e monitoraggio di primo livello",
  "Isagog: un'IA che sa dire cosa sa e non lo so",
  "Italy VR Experience: analisi turistico intelligente",
  "Laborium: valutiamo i talenti tech per il codice vero, oltre il CV",
  "Loki: migliorare la sicurezza stradale con l'intelligenza artificiale",
  "MindLeague: proteggere la mente e il cuore",
  "Mirabilis: Inclusione, formazione e innovazione per persone, scuole e territori",
  "Motiontech: prevenire e gestire le aziende ed eventuali situazioni di crisi",
  "Movitas: connettiamo pazienti, caregiver e partner per la mobilità",
  "My Industries: myRobot intelligenza nel gesto fisico",
  "Neurons: connettere cittadini, Scuole, Enti del Terzo Settore, imprese e comunità",
  "NV group: la rete di prossimità per i servizi pubblici",
  "Overbook: libri, persone, relazioni La biblioteca diffusa come fonte di valore",
  "Pamina: la stanza digitale 3D per provare i vestiti online",
  "Prana: per qualità dell’aria indoor",
  "ParlaconKarla: il supporto genitoriale verticale del mercato italiano",
  "RI-hub: il tuo fisioterapista, ovunque tu sia",
  "Sciamlab: il Report sul territorio a portata di tap",
  "Sensers: infrastruttura Fiduciaria per Comunità Intelligenti",
  "SiWeGO: smart eco transport",
  "SlowHive: weRoad degli smart worker",
  "Speaqi: la tua esperienza digitale, in ogni lingua",
  "Spm medica: infrastruttura sanitaria patient-centric che mette in comunicazione ogni realtà clinica",
  "Sportfulness: l'infrastruttura digitale per il benessere mentale nello sport",
  "Travelware: trasformare le destinazioni in ecosistemi rigenerativi"
];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const fail = (msg, status = 400) => json({ error: msg }, status);

const slug = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "votante";

const newToken = () => crypto.randomBytes(18).toString("base64url");
const newPassword = () => {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // niente caratteri ambigui
  const b = crypto.randomBytes(6);
  return Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
};

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(String(b ?? ""));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

const store = () => getStore({ name: "voting", consistency: "strong" });

function seedConfig() {
  const used = new Set();
  const voters = VOTER_NAMES.map((name) => {
    let id = slug(name);
    while (used.has(id)) id += "-2";
    used.add(id);
    return { id, name, token: newToken(), password: newPassword() };
  });
  return {
    open: true,
    criteria: CRITERIA,
    startups: STARTUPS,
    voters,
  };
}

async function loadConfig(s) {
  let c = await s.get("config", { type: "json" });
  if (!c) {
    await s.setJSON("config", seedConfig(), { onlyIfNew: true });
    c = await s.get("config", { type: "json" });
  }
  return c;
}

async function saveConfig(s, c) {
  await s.setJSON("config", c);
}

async function loadVotes(s, voterId) {
  return (await s.get(`votes/${voterId}`, { type: "json" })) || {};
}

function validScores(scores) {
  if (!scores || typeof scores !== "object") return null;
  const out = {};
  for (const c of CRITERIA) {
    const v = scores[c.id];
    if (!Number.isInteger(v) || v < MIN || v > MAX) return null;
    out[c.id] = v;
  }
  return out;
}

async function saveVote(s, voterId, startupIdx, scores) {
  const key = `votes/${voterId}`;
  for (let i = 0; i < 6; i++) {
    const e = await s.getWithMetadata(key, { type: "json" });
    const data = e ? e.data : {};
    data[startupIdx] = { scores, ts: Date.now() };
    const r = e
      ? await s.setJSON(key, data, { onlyIfMatch: e.etag })
      : await s.setJSON(key, data, { onlyIfNew: true });
    if (r.modified) return data[startupIdx];
  }
  throw new Error("Salvataggio concorrente non riuscito, riprova.");
}

function authVoter(cfg, token, password) {
  const v = cfg.voters.find((x) => safeEqual(x.token, token));
  if (!v || !safeEqual(v.password, password)) return null;
  return v;
}

function isAdmin(password) {
  const expected = Netlify.env.get("ADMIN_PASSWORD");
  return !!expected && safeEqual(expected, password);
}

async function adminState(s, cfg) {
  const votes = {};
  await Promise.all(
    cfg.voters.map(async (v) => {
      votes[v.id] = await loadVotes(s, v.id);
    }),
  );
  return { config: cfg, votes, serverTime: Date.now() };
}

export default async (req) => {
  if (req.method !== "POST") return fail("Metodo non consentito", 405);
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  let body;
  try {
    body = await req.json();
  } catch {
    return fail("JSON non valido");
  }

  const s = store();

  try {
    // ---------- VOTANTE ----------
    if (path === "me" || path === "vote") {
      const cfg = await loadConfig(s);
      const voter = authVoter(cfg, body.token, body.password);
      if (!voter) return fail("Link o password non validi", 401);

      if (path === "vote") {
        if (!cfg.open) return fail("Le votazioni sono chiuse", 403);
        const idx = body.startupId;
        if (!Number.isInteger(idx) || idx < 0 || idx >= cfg.startups.length)
          return fail("Startup non valida");
        const scores = validScores(body.scores);
        if (!scores) return fail(`Servono tutti i ${CRITERIA.length} voti (${MIN}-${MAX})`);
        const saved = await saveVote(s, voter.id, idx, scores);
        return json({ ok: true, saved });
      }

      return json({
        voter: { name: voter.name },
        open: cfg.open,
        criteria: cfg.criteria,
        startups: cfg.startups,
        scale: { min: MIN, max: MAX },
        votes: await loadVotes(s, voter.id),
      });
    }

    // ---------- ADMIN ----------
    if (path.startsWith("admin")) {
      if (!Netlify.env.get("ADMIN_PASSWORD"))
        return fail("ADMIN_PASSWORD non configurata sul sito", 500);
      if (!isAdmin(body.password)) return fail("Password admin errata", 401);

      const cfg = await loadConfig(s);
      const action = path.replace(/^admin\/?/, "") || "state";

      switch (action) {
        case "state":
          return json(await adminState(s, cfg));

        case "startups": {
          const names = (body.names || []).map((n) => String(n).trim()).filter(Boolean);
          if (!names.length || names.length > 200) return fail("Elenco startup non valido");
          cfg.startups = names;
          await saveConfig(s, cfg);
          return json(await adminState(s, cfg));
        }

        case "open":
          cfg.open = !!body.open;
          await saveConfig(s, cfg);
          return json(await adminState(s, cfg));

        case "add-voter": {
          const name = String(body.name || "").trim();
          if (!name) return fail("Nome mancante");
          let id = slug(name);
          while (cfg.voters.some((v) => v.id === id)) id += "-2";
          cfg.voters.push({ id, name, token: newToken(), password: newPassword() });
          await saveConfig(s, cfg);
          return json(await adminState(s, cfg));
        }

        case "reset-voter": {
          const v = cfg.voters.find((x) => x.id === body.id);
          if (!v) return fail("Votante non trovato", 404);
          v.token = newToken();
          v.password = newPassword();
          await saveConfig(s, cfg);
          return json(await adminState(s, cfg));
        }

        case "remove-voter": {
          cfg.voters = cfg.voters.filter((x) => x.id !== body.id);
          await saveConfig(s, cfg);
          await s.delete(`votes/${body.id}`);
          return json(await adminState(s, cfg));
        }

        default:
          return fail("Azione sconosciuta", 404);
      }
    }

    return fail("Non trovato", 404);
  } catch (err) {
    console.error(err);
    return fail(err.message || "Errore interno", 500);
  }
};
