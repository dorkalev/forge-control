import { OPENROUTER_API_KEY } from '../config/env.js';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const MODEL = 'anthropic/claude-haiku-4.5';

const PROMPTS = {
  condensed: `You are a technical writer creating a concise changelog for a production release.

Given the following issue files in markdown format, create a ONE-PAGE executive summary changelog.

Requirements:
- Start with a 1-2 sentence executive summary
- Create bullet points for major changes (max 5-7 bullets)
- Each bullet must include the issue ID in format [A-XXX]
- Focus on user-facing changes and impact
- Keep it brief and scannable
- Use clear, non-technical language where possible

CRITICAL SECURITY & PRIVACY REQUIREMENTS:
- NEVER include API keys, tokens, passwords, credentials, or secrets
- REDACT specific vulnerability details that could be exploited
- REMOVE all filenames, file paths, and directory structures (e.g., /api/auth/login.php → "authentication endpoint")
- REMOVE specific library names and versions (e.g., "express 4.18" → "web framework")
- REMOVE class names, function names, and code structure details
- HIDE internal architecture details (database schemas, service structure, etc.)
- Replace technical implementation details with high-level descriptions
- Focus on WHAT was changed and WHY, not HOW it's implemented

Examples:
❌ BAD: "Fixed SQL injection in UserController.login() by sanitizing input using pg-escape library"
✅ GOOD: "Fixed authentication security vulnerability"

❌ BAD: "Refactored PaymentService class to use Stripe API v3.2"
✅ GOOD: "Updated payment processing integration"

❌ BAD: "Updated database/migrations/2024_add_users_table.sql"
✅ GOOD: "Updated database schema for user management"

Keep descriptions generic, user-focused, and business-oriented rather than technical.

Format:
## Release Summary
[1-2 sentence overview]

## Key Changes
- [A-XXX] Description of change and impact
- [A-XXX] Description of change and impact
...

Here are the issue files:

---

`,

  detailed: `You are a technical writer creating a detailed changelog for a production release.

Given the following issue files in markdown format, create a structured, comprehensive changelog.

Requirements:
- Create sections: Features, Improvements, Bug Fixes, Technical Changes
- Include ALL issues with their IDs in format [A-XXX]
- Provide context and impact for each change
- Maintain a professional, clear tone
- Include technical details where relevant

CRITICAL SECURITY & PRIVACY REQUIREMENTS:
- NEVER include API keys, tokens, passwords, credentials, or secrets
- REDACT specific vulnerability details that could be exploited
- REMOVE all filenames, file paths, and directory structures (e.g., /api/auth/login.php → "authentication endpoint")
- REMOVE specific library names and versions (e.g., "express 4.18" → "web framework")
- REMOVE class names, function names, and code structure details
- HIDE internal architecture details (database schemas, service structure, etc.)
- Replace technical implementation details with high-level descriptions
- Focus on WHAT was changed and WHY, not HOW it's implemented

Examples:
❌ BAD: "Fixed SQL injection in UserController.login() by sanitizing input using pg-escape library"
✅ GOOD: "Fixed authentication security vulnerability"

❌ BAD: "Refactored PaymentService class to use Stripe API v3.2"
✅ GOOD: "Updated payment processing integration"

❌ BAD: "Updated database/migrations/2024_add_users_table.sql"
✅ GOOD: "Updated database schema for user management"

❌ BAD: "Fixed memory leak in Redis cache using ioredis@5.3.0"
✅ GOOD: "Improved cache performance and stability"

Keep descriptions generic, user-focused, and business-oriented rather than technical.

Format:
## Release Changelog

### Features
- **[A-XXX] Title**: Description of the feature, what it does, and why it matters

### Improvements
- **[A-XXX] Title**: Description of the improvement

### Bug Fixes
- **[A-XXX] Title**: What was fixed and the impact

### Technical Changes
- **[A-XXX] Title**: Technical improvements, refactoring, etc.

Here are the issue files:

---

`
};

export async function generateChangelog(issuesMarkdown, type = 'condensed') {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const prompt = PROMPTS[type];
  if (!prompt) {
    throw new Error(`Invalid type: ${type}. Must be 'condensed' or 'detailed'`);
  }

  const fullPrompt = prompt + issuesMarkdown;

  try {
    const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.GITHUB_REPO_URL || 'https://github.com/your-org/your-repo',
        'X-Title': 'SDLC Local Agent'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: fullPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response from OpenRouter API');
    }

    return {
      changelog: data.choices[0].message.content,
      model: data.model || MODEL,
      usage: data.usage
    };
  } catch (err) {
    console.error('Error generating changelog:', err.message);
    throw err;
  }
}

export function isConfigured() {
  return !!OPENROUTER_API_KEY;
}
