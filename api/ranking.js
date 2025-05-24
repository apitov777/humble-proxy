/* ----------------------------------------------------------
   api/ranking.js  –  Função Serverless (ES-Modules) para Vercel
   ---------------------------------------------------------- */

/* 1. DEPENDÊNCIAS ------------------------------------------ */
import fetch from 'node-fetch';          // <--  obrig. no runtime Node 16/18
import cors  from 'cors';
import 'dotenv/config';                  // lê .env / variáveis da Vercel

/* 2. CORS -------------------------------------------------- */
const ALLOWED = [
  'https://www.humbleguild.com.br',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];
const corsHandler = cors({ origin: ALLOWED });
const runCors = (req, res) =>
  new Promise((ok, err) =>
    corsHandler(req, res, r => (r instanceof Error ? err(r) : ok()))
  );

/* 3. TOKEN COM CACHE -------------------------------------- */
let tokenCache = { value: null, exp: 0 };          // exp = timestamp ms
async function getToken () {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;

  const creds = Buffer.from(
    process.env.BLIZZ_ID + ':' + process.env.BLIZZ_SECRET
  ).toString('base64');

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const resp = await fetch('https://us.battle.net/oauth/token', {
    method : 'POST',
    headers: {
      Authorization : 'Basic ' + creds,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  }).then(r => r.json());

  tokenCache = {
    value: resp.access_token,
    exp  : Date.now() + resp.expires_in * 1000 - 60_000   // 1 min de folga
  };
  return tokenCache.value;
}

/* 4. HANDLER PRINCIPAL ------------------------------------ */
export default async function handler (req, res) {
  try {
    /* 4.1  libera CORS */
    await runCors(req, res);

    /* 4.2  token Blizzard */
    const token = await getToken();

    /* 4.3  roster da guilda */
    const rosterUrl =
      'https://us.api.blizzard.com/data/wow/guild/azralon/humble/roster' +
      '?namespace=profile-us&locale=en_US';

    const roster = await fetch(rosterUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json());

    const players = (roster.members || []).filter(m => m.rank <= 5);

    /* 4.4  busca achievements + avatar em lotes (LIMIT) */
    const LIMIT  = 6;
    const chunks = players.reduce((a, c, i) => {
      (a[i % LIMIT] ??= []).push(c);  // divide em grupos de 6
      return a;
    }, []);

    const results = [];
    for (const group of chunks) {
      const partial = await Promise.all(group.map(async m => {
        const name  = m.character.name;
        const realm = m.character.realm.slug;
        const base  = `https://us.api.blizzard.com/profile/wow/character/${realm}/${name.toLowerCase()}`;

        const [ach, media] = await Promise.all([
          fetch(base + '/achievements?namespace=profile-us&locale=en_US',
                { headers:{Authorization:`Bearer ${token}`} }).then(r => r.json()),
          fetch(base + '/character-media?namespace=profile-us&locale=en_US',
                { headers:{Authorization:`Bearer ${token}`} }).then(r => r.json())
        ]);

        const ces = (ach.achievements || [])
          .filter(a => a.achievement?.name?.startsWith('Cutting Edge:'))
          .map(a  => a.achievement.name.replace('Cutting Edge: ', ''));

        const avatar =
          media.assets?.find(a => a.key === 'avatar')?.value ||
          media.assets?.[0]?.value || '';

        return { name, ces, avatar };
      }));
      results.push(...partial);
    }

    results.sort((a, b) => b.ces.length - a.ces.length);
    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: 'ranking_failed', detail: err.message });
  }
}
