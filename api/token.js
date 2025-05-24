import 'dotenv/config';

const safeJson = async (resp) => {
  const txt = await resp.text();
  return txt ? JSON.parse(txt) : {};
};

export default async function handler(req, res) {
  try {
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

    res.status(200).json(json);
  } catch (err) {
    res.status(500).json({ error: 'token_failed', detail: err.message });
  }
}
