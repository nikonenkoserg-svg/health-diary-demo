// Patient API — управление пациентом и его данными в Supabase
// POST /api/patient { action: 'init' } → создаёт patient, возвращает UUID
// POST /api/patient { action: 'context', patient_id, msg_count, glucose_count }
//   → возвращает {messages, glucose, profile, food} для системного промпта
// POST /api/patient { action: 'save_message', patient_id, role, content }
// POST /api/patient { action: 'save_glucose', patient_id, value, type, measured_at }
// POST /api/patient { action: 'save_profile', patient_id, profile }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function sb(method, path, body) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, patient_id, ...payload } = req.body || {};

  try {
    if (action === 'init') {
      const created = await sb('POST', 'patients', { country: payload.country || 'BR', language: payload.language || 'ru' });
      return res.status(200).json({ patient_id: created[0].id });
    }

    if (!patient_id) return res.status(400).json({ error: 'patient_id required' });

    if (action === 'context') {
      const msgLimit = payload.msg_count || 30;
      const glLimit = payload.glucose_count || 20;
      const [profileArr, messagesArr, glucoseArr, foodArr] = await Promise.all([
        sb('GET', `profiles?patient_id=eq.${patient_id}&select=*`),
        sb('GET', `messages?patient_id=eq.${patient_id}&order=created_at.desc&limit=${msgLimit}&select=role,content,created_at`),
        sb('GET', `glucose_log?patient_id=eq.${patient_id}&order=measured_at.desc&limit=${glLimit}&select=value,type,measured_at`),
        sb('GET', `food_log?patient_id=eq.${patient_id}&order=eaten_at.desc&limit=10&select=foods,eaten_at`)
      ]);
      return res.status(200).json({
        profile: profileArr[0] || null,
        messages: (messagesArr || []).reverse(),
        glucose: glucoseArr || [],
        food: foodArr || []
      });
    }

    if (action === 'save_message') {
      await sb('POST', 'messages', { patient_id, role: payload.role, content: payload.content });
      return res.status(200).json({ ok: true });
    }

    if (action === 'save_glucose') {
      await sb('POST', 'glucose_log', {
        patient_id,
        value: payload.value,
        type: payload.type || 'random',
        source: payload.source || 'manual',
        measured_at: payload.measured_at || new Date().toISOString()
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'save_profile') {
      const p = payload.profile || {};
      const row = {
        patient_id,
        sex: p.sex,
        age: p.age,
        weight_kg: p.weight,
        height_cm: p.height,
        bmi: p.bmi,
        raw: p,
        updated_at: new Date().toISOString()
      };
      await sb('POST', 'profiles?on_conflict=patient_id', row).catch(async (e) => {
        // upsert через PATCH если уже есть
        await sb('PATCH', `profiles?patient_id=eq.${patient_id}`, row);
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'save_food') {
      await sb('POST', 'food_log', {
        patient_id,
        foods: payload.foods,
        eaten_at: payload.eaten_at || new Date().toISOString(),
        estimated_peak: payload.peak,
        estimated_peak_time: payload.peak_time
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[patient]', action, e.message);
    return res.status(500).json({ error: e.message });
  }
}
