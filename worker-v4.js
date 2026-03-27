// Vid2Quiz - Cloudflare Worker v4
// Supports: quiz generation + video summary with translation

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    try {
      const { text, mode, language } = await request.json();

      if (!text || text.trim().length < 50) {
        return jsonResponse({ error: 'Please paste at least a few sentences of content.' }, 400);
      }

      let content = text.trim();
      const words = content.split(/\s+/);
      if (words.length > 3500) {
        content = words.slice(0, 3500).join(' ');
      }

      if (mode === 'summary') {
        const summary = await generateSummary(content, language || 'English', env.DEEPSEEK_API_KEY);
        return jsonResponse({ success: true, summary });
      } else {
        const quiz = await generateQuiz(content, env.DEEPSEEK_API_KEY);
        return jsonResponse({ success: true, quiz });
      }

    } catch (err) {
      console.error('Error:', err.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
    }
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function generateSummary(text, language, apiKey) {
  const prompt = `You are a video content summarizer. Analyze the following video transcript and create a structured summary.

Transcript:
${text}

Create a summary in the following JSON format. The output language should be: ${language}

Respond ONLY with valid JSON, no markdown:
{
  "title": "Video title or topic",
  "tldr": "A 1-2 sentence summary of the entire video",
  "keyPoints": [
    {"emoji": "relevant emoji", "point": "Key point 1 explained clearly"},
    {"emoji": "relevant emoji", "point": "Key point 2 explained clearly"},
    {"emoji": "relevant emoji", "point": "Key point 3 explained clearly"},
    {"emoji": "relevant emoji", "point": "Key point 4 explained clearly"},
    {"emoji": "relevant emoji", "point": "Key point 5 explained clearly"}
  ],
  "concepts": [
    {"term": "Important term 1", "definition": "Brief explanation"},
    {"term": "Important term 2", "definition": "Brief explanation"},
    {"term": "Important term 3", "definition": "Brief explanation"}
  ],
  "takeaway": "The most important thing to remember from this video"
}

Requirements:
- Extract 5-7 key points that capture the main ideas
- Identify 3-5 important concepts or terms mentioned
- Write in ${language}
- Keep explanations clear and concise
- The tldr should be understandable without watching the video`;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a helpful video summarizer. Always respond with valid JSON only, no markdown.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) throw new Error('AI service error');
  const data = await response.json();
  if (!data.choices || !data.choices[0]) throw new Error('AI returned empty response');

  let content = data.choices[0].message.content.trim();
  content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(content);
}

async function generateQuiz(text, apiKey) {
  const prompt = `You are a quiz generator for educational content. Based on the following text, create exactly 5 multiple-choice quiz questions.

Text:
${text}

Requirements:
- Generate exactly 5 questions
- Each question has exactly 4 options (A, B, C, D)
- Only one correct answer per question
- Questions should test understanding of key concepts
- Make wrong options plausible but clearly incorrect
- Include a brief explanation for the correct answer
- Questions should go from easier to harder
- Detect the topic automatically and use it as the title

Respond ONLY with valid JSON in this exact format, no other text, no markdown:
{
  "title": "Topic title here",
  "questions": [
    {
      "q": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "explanation": "Brief explanation."
    }
  ]
}

The "correct" field is the 0-based index of the correct option.`;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a helpful quiz generator. Always respond with valid JSON only, no markdown.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) throw new Error('AI service error');
  const data = await response.json();
  if (!data.choices || !data.choices[0]) throw new Error('AI returned empty response');

  let content = data.choices[0].message.content.trim();
  content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(content);
}
