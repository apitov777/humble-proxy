import express from 'express';
import cors from 'cors';
import 'dotenv/config';              // lê o .env

const app  = express();
const PORT = process.env.PORT || 3000;

/* -------- 1. Libera CORS só para seu site local -------- */
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'] // porta padrão do Live Server
}));

/* -------- 2. Função para pegar/cachar o token -------- */
let cachedToken = null;
let tokenExpires = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpires) return cachedToken;

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const auth = Buffer.from(
    process.env.BLIZZ_ID + ':' + process.env.BLIZZ_SECRET
  ).toString('base64');

  const res = await fetch('https://us.battle.net/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const json = await res.json();

  cachedToken  = json.access_token;
  tokenExpires = Date.now() + json.expires_in * 1000 - 60_000; // 1 min de folga
  return cachedToken;
}

/* -------- 3. Rota que devolve o token (simples) -------- */
app.get('/api/token', async (_, res) => {
  try {
    const token = await getToken();
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'token_failed', detail: err.message });
  }
});

/* -------- 4. (Opcional) Rota que devolve ranking pronto -------- */
app.get('/api/ranking', async (_, res) => {
  try {
    const token = await getToken();

    const rosterURL = 'https://us.api.blizzard.com/data/wow/guild/azralon/humble/roster?namespace=profile-us&locale=en_US';
    const roster    = await fetch(rosterURL, { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json());

    const filtered  = roster.members.filter(m => m.rank <= 5);
    const results   = await Promise.all(filtered.map(async m=>{
      const name  = m.character.name;
      const realm = m.character.realm.slug;
      const base  = `https://us.api.blizzard.com/profile/wow/character/${realm}/${name.toLowerCase()}`;

      const [achievements, media] = await Promise.all([
        fetch(base + '/achievements?namespace=profile-us&locale=en_US', { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json()),
        fetch(base + '/character-media?namespace=profile-us&locale=en_US', { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json())
      ]);

      const ces = (achievements.achievements || [])
                  .filter(a => a.achievement?.name?.startsWith('Cutting Edge:'))
                  .map(a => a.achievement.name.replace('Cutting Edge: ', ''));

      const avatar = media.assets?.find(a=>a.key==='avatar')?.value || '';

      return { name, ces, avatar };
    }));

    results.sort((a,b)=>b.ces.length - a.ces.length);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error:'ranking_failed', detail:err.message });
  }
});

app.listen(PORT, () =>
  console.log(`Proxy Blizzard rodando em   http://localhost:${PORT}`)
);
