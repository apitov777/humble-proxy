import cors from 'cors';

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

const safeJson = async (resp) => {
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const txt = await resp.text();
  return txt ? JSON.parse(txt) : {};
};

let tokenCache = { value: null, exp: 0 };

async function getToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;

  const creds = Buffer.from(
    `${process.env.BLIZZ_ID}:${process.env.BLIZZ_SECRET}`
  ).toString('base64');

  const body = new URLSearchParams({ grant_type: 'client_credentials' });

  const json = await fetch('https://us.battle.net/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  }).then(safeJson);

  tokenCache = {
    value: json.access_token,
    exp: Date.now() + json.expires_in * 1000 - 60_000
  };
  return tokenCache.value;
}

export default async function handler(req, res) {
  try {
    await runCors(req, res);
    const token = await getToken();

    const rosterUrl =
      'https://us.api.blizzard.com/data/wow/guild/azralon/humble/roster?namespace=profile-us&locale=en_US';

    const roster = await fetch(rosterUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(safeJson);

    const players = (roster.members || []).filter(m => m.rank <= 5);

    const LIMIT = 6;
    const chunks = players.reduce((acc, cur, i) => {
      (acc[i % LIMIT] ??= []).push(cur);
      return acc;
    }, []);

    const results = [];
    for (const group of chunks) {
      const partial = await Promise.all(group.map(async (m) => {
        const name = m.character.name;
        const realm = m.character.realm.slug;
        const base =
          `https://us.api.blizzard.com/profile/wow/character/${realm}/${name.toLowerCase()}`;

        const [ach, media] = await Promise.all([
          fetch(
            `${base}/achievements?namespace=profile-us&locale=en_US`,
            { headers: { Authorization: `Bearer ${token}` } }
          ).then(safeJson),
          fetch(
            `${base}/character-media?namespace=profile-us&locale=en_US`,
            { headers: { Authorization: `Bearer ${token}` } }
          ).then(safeJson)
        ]);

        const ces = (ach.achievements || [])
          .filter(a => a.achievement?.name?.startsWith('Cutting Edge:'))
          .map(a => a.achievement.name.replace('Cutting Edge: ', ''));

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
    console.error(err);
    res.status(500).json({ error: 'ranking_failed', detail: err.message });
  }
}
