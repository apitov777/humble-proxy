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

    const rosterUrl = 'https://us.api.blizzard.com/data/wow/guild/azralon/humble/roster?namespace=profile-us&locale=pt_BR';
    const roster = await fetch(rosterUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(safeJson);

    const players = (roster.members || []).filter(m => m.rank <= 5);

    const results = await Promise.all(players.map(async (m) => {
      const name = m.character.name;
      const realm = m.character.realm.slug;
      const base = `https://us.api.blizzard.com/profile/wow/character/${realm}/${name.toLowerCase()}`;

      const [equipmentData, mediaData] = await Promise.all([
        fetch(`${base}/equipment?namespace=profile-us&locale=pt_BR`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(safeJson),
        fetch(`${base}/character-media?namespace=profile-us&locale=pt_BR`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(safeJson)
      ]);

      const ilvl = equipmentData.equipped_item_level || 0;
      const avatar = mediaData.assets?.find(a => a.key === 'avatar')?.value || '';

      return { name, ilvl, avatar };
    }));

    results.sort((a, b) => b.ilvl - a.ilvl);
    res.status(200).json(results);
  } catch (err) {
    console.error('ERRO:', err);
    res.status(500).json({ error: 'ilvl_failed', detail: err.message });
  }
}
