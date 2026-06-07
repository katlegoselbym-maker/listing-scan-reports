export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { description, imageBase64, imageType } = req.body;

  if (!description && !imageBase64) {
    return res.status(400).json({ error: "No input provided." });
  }

  const systemPrompt = `You are a forensic listing diagnostic engine for real estate agents. Your job is to analyse a property listing — either a text description or a screenshot — and identify every conversion leak present.

A conversion leak is anything in the listing that causes a buyer to scroll past, lose urgency, or fail to book a showing. This includes: vague language, missing emotional triggers, weak headlines, absent social proof, no scarcity or urgency, poor feature sequencing, generic descriptions, missing lifestyle context, and copy that talks about the property instead of the buyer's life inside it.

Return your full diagnostic report in this exact structure:

LISTING HEALTH SCORE: [0-100]
GRADE: [F / D / C / B / A]
SUMMARY: [2-3 sentence plain-English verdict on the listing's current state]

CONVERSION LEAKS FOUND:
[Number each leak. Name it. Explain why it is leaking conversions. Be specific.]

WHAT IS WORKING:
[List anything in the listing that is genuinely strong - do not invent praise]

SELLER CONVERSATION SCRIPT:
[A word-for-word script the agent can use at their next seller meeting to explain what needs to change and why, without the seller feeling attacked. Conversational tone. No jargon.]

PRIORITY FIX LIST:
[Top 3 changes ranked by conversion impact, with a one-line rewrite example for each]`;

  let userContent;

  if (imageBase64) {
    userContent = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: imageType || "image/jpeg",
          data: imageBase64,
        },
      },
      {
        type: "text",
        text: "Analyse this listing screenshot and produce the full forensic diagnostic report as instructed.",
      },
    ];
  } else {
    userContent = [
      {
        type: "text",
        text: `Analyse this listing description and produce the full forensic diagnostic report as instructed.\n\n${description}`,
      },
    ];
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return res.status(500).json({ error: "API call failed.", detail: err });
    }

    const data = await response.json();
    const result = data.content?.[0]?.text || "";
    return res.status(200).json({ result });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ error: "Server error.", detail: error.message });
  }
    }
