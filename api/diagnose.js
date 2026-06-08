const SYSTEM = `You are a forensic real estate listing analyst. Identify all conversion leaks and give the agent the intelligence to fix the problem without immediately reducing the price.

Return ONLY valid JSON. No preamble, no markdown, no backticks. Exactly this structure:
{"primary_leak":{"phrase":"exact phrase quoted from listing","damage":"two sentences on the precise psychological response this triggers in a buyer","replacement":"exact surgical replacement phrase","severity":8},"secondary_leaks":[{"type":"Buyer Hesitation Trigger","finding":"specific issue found in the listing","fix":"specific action to address it"},{"type":"Seller Positioning Gap","finding":"specific pattern in the copy or presentation","fix":"specific change to make"}],"overall_score":65,"action_today":"The single most impactful action the agent should take before the next showing","seller_script":"Three to four sentences the agent can say verbatim to their seller, backed by what the data shows, without recommending a price reduction","verdict":"REWRITE BEFORE REDUCING"}

Verdict options: REWRITE BEFORE REDUCING | REDUCE AND REWRITE | STRONG WITH FIXABLE LEAKS
overall_score: 0 to 100. Below 50 critical. 50 to 74 moderate. 75 plus strong.
Quote exact phrases. Be clinical, direct, and specific.`;

function normalizeMessages(body) {
  if (Array.isArray(body.messages)) {
    return body.messages;
  }

  const mode = body.mode || 'text';
  if (mode === 'text') {
    const listingText = String(body.listingText || body.description || body.text || '').trim();
    if (listingText.length < 60) {
      const err = new Error('Paste the full listing description before scanning.');
      err.statusCode = 400;
      throw err;
    }
    return [{ role: 'user', content: `Diagnose this real estate listing:\n\n${listingText}` }];
  }

  if (mode === 'image') {
    const image = body.image || body.imgData;
    if (!image?.base64 || !image?.mediaType) {
      const err = new Error('Upload a valid listing screenshot before scanning.');
      err.statusCode = 400;
      throw err;
    }
    return [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
        { type: 'text', text: 'Diagnose this real estate listing screenshot. Read all visible text and identify every conversion leak.' }
      ]
    }];
  }

  const err = new Error('Invalid scan mode.');
  err.statusCode = 400;
  throw err;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'The scan engine is missing ANTHROPIC_API_KEY in Vercel environment variables.'
      });
    }

    const body = req.body || {};
    const messages = normalizeMessages(body);

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: body.model || 'claude-sonnet-4-6',
        max_tokens: Number(body.max_tokens || 1500),
        system: body.system || SYSTEM,
        messages
      })
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const providerMessage = data?.error?.message || data?.message || 'AI provider rejected the request.';
      const isBillingOrKey = /credit|billing|balance|quota|api key|authentication|unauthorized/i.test(providerMessage);

      return res.status(upstream.status).json({
        error: isBillingOrKey
          ? 'The scan engine is not configured correctly. The Anthropic API key has no available credits, billing is disabled, or the key is invalid. Update ANTHROPIC_API_KEY in Vercel and redeploy.'
          : providerMessage,
        providerError: data?.error || data
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Internal scan error'
    });
  }
};
