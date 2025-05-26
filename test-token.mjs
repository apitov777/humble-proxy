import fetch from 'node-fetch';
import 'dotenv/config';

(async () => {
  const body  = new URLSearchParams({ grant_type: 'client_credentials' });
  const creds = Buffer
      .from(process.env.BLIZZ_ID + ':' + process.env.BLIZZ_SECRET)
      .toString('base64');

  const resp = await fetch('https://us.battle.net/oauth/token', {
    method : 'POST',
    headers: {
      Authorization : 'Basic ' + creds,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  console.log(await resp.text());
})();

