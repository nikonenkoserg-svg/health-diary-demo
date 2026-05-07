export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const lang = req.headers['x-language'] || 'ru';
    const langMap = { ru: 'ru', en: 'en-US', fr: 'fr' };
    const dgLang = langMap[lang] || 'ru';

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const response = await fetch(
      `https://api.deepgram.com/v1/listen?language=${dgLang}&model=nova-2&smart_format=true`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': req.headers['content-type'] || 'audio/webm'
        },
        body
      }
    );

    const data = await response.json();
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    res.status(200).json({ transcript });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
