export function buildLlmPrompt(museumName) {
  return `⚠️ CRITICAL INSTRUCTION: You MUST include EVERY SINGLE artwork currently on display at "${museumName}" — not just highlights or famous pieces. A partial list will make the guide completely useless. DO NOT stop at 15–20 items.

💡 TIP: For the most accurate room/location information, you can share a photo of the museum's floor plan or layout map — I'll use it to correctly assign each artwork to its room.

Please generate a complete, valid JSON file for "${museumName}" following this EXACT format — no prose, no markdown fences, just raw JSON:

{
  "format": "museum-audio-guide/v1",
  "meta": {
    "name": "${museumName}",
    "city": "<City, Country>",
    "established": "<Year>",
    "description": "<One-sentence description>"
  },
  "floors": [
    { "id": 1, "name": "<Floor name>" }
  ],
  "artworks": [
    {
      "id": "<kebab-case-unique-id>",
      "title": "<Artwork title>",
      "artist": "<Artist full name>",
      "year": "<Year or circa>",
      "floor": 1,
      "room": "<Room number or name>",
      "wing": "<Wing or gallery name>",
      "medium": "<e.g. Oil on canvas>",
      "type": "<painting | sculpture | drawing | other>",
      "highlight": true,
      "tags": ["<tag1>", "<tag2>"],
      "imageUrl": "<valid image URL from Wikimedia Commons or official museum site, or null>",
      "audioDescription": "<Engaging 2–3 paragraph audio description (~150–200 words). Include visual details, historical context, artistic significance, and an interesting story or anecdote.>"
    }
  ]
}

MANDATORY REQUIREMENTS:
- ⚠️ Include ALL artworks currently on display — every room, every floor, every wing. Do NOT skip any.
- ⚠️ Do NOT arbitrarily limit to any number. The guide must be exhaustive and comprehensive.
- Mark the 4–6 most famous pieces with "highlight": true.
- Each audioDescription must be 150–200 words, written as if read aloud by a knowledgeable guide.
- Group artworks logically across floors, wings, and rooms.
- All "id" values must be unique and use kebab-case.
- Use only accurate, verified historical information.
- "type" must be one of: painting, sculpture, drawing, other.
- For "imageUrl": provide a direct image URL from Wikimedia Commons (https://upload.wikimedia.org/…) or the museum's official site. Use null only if truly no image is available.
- Output ONLY the raw JSON — no markdown, no explanation, no commentary.

This is a complete museum audio guide — thoroughness is everything.`;
}
