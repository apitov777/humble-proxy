export default function handler(req, res) {
  res.json({
    BLIZZ_ID     : process.env.BLIZZ_ID     || '❌ NOT SET',
    BLIZZ_SECRET : process.env.BLIZZ_SECRET ? '✅ SET' : '❌ NOT SET'
  });
}
