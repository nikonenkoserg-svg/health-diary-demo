// /api/sync — серверная память пациента поверх Supabase Storage (бакет patient-backups).
// GET  ?id=<hash>  → JSON-снимок пациента, или 204 если бэкапа нет.
// POST { id, data } → upsert снимка.
// service_role-ключ живёт ТОЛЬКО здесь (Vercel env), клиент его не видит.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BUCKET = 'patient-backups';

function safeId(id) {
  return (typeof id === 'string' && /^[a-zA-Z0-9_-]{4,128}$/.test(id)) ? id : null;
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'supabase env missing' });
  }
  const base = `${SUPABASE_URL}/storage/v1/object/${BUCKET}`;
  const auth = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

  try {
    if (req.method === 'GET') {
      const id = safeId(req.query && req.query.id);
      if (!id) return res.status(400).json({ error: 'bad id' });
      const r = await fetch(`${base}/${id}.json`, { headers: auth });
      if (r.status === 404 || r.status === 400) return res.status(204).end();
      if (!r.ok) return res.status(502).json({ error: 'storage get failed', status: r.status });
      const text = await r.text();
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(text);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      body = body || {};
      const id = safeId(body.id);
      if (!id) return res.status(400).json({ error: 'bad id' });
      const payload = JSON.stringify(body.data || {});
      if (payload.length > 4000000) return res.status(413).json({ error: 'too large' });
      const r = await fetch(`${base}/${id}.json`, {
        method: 'POST',
        headers: Object.assign({}, auth, { 'Content-Type': 'application/json', 'x-upsert': 'true' }),
        body: payload
      });
      if (!r.ok) return res.status(502).json({ error: 'storage put failed', status: r.status });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'sync failed', detail: String(e && e.message || e) });
  }
}
