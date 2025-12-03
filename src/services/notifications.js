/**
 * Notification services for Slack and Email
 */
import fetch from 'node-fetch';

/**
 * Send Slack notification to release channel
 */
export async function sendSlackReleaseNotification({ tag, releaseNotes, prNumber, prUrl }) {
  const webhookUrl = process.env.SLACK_RELEASE_CHANNEL;

  if (!webhookUrl) {
    console.log('⚠️ SLACK_RELEASE_CHANNEL not set; skipping Slack notification');
    return { skipped: true };
  }

  try {
    // Convert markdown to Slack mrkdwn format
    const slackText = markdownToSlack(releaseNotes);

    const payload = {
      text: `🚀 New Release: ${tag}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚀 New Release: ${tag}`,
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: slackText
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `<${prUrl}|View Pull Request #${prNumber}>`
            }
          ]
        }
      ]
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Slack webhook failed: ${res.status} ${res.statusText} ${text}`);
    }

    console.log('✅ Posted Slack release notification');
    return { ok: true };
  } catch (err) {
    console.error('❌ Error posting to Slack:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Send email notification about release using Resend
 */
export async function sendReleaseEmail({ toEmail, tag, releaseNotes, prNumber, prUrl }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('⚠️ RESEND_API_KEY not set; skipping email notification');
    return { skipped: true };
  }

  try {
    // Convert markdown to HTML for email
    const htmlContent = markdownToHtml(releaseNotes);

    const emailPayload = {
      from: process.env.EMAIL_SENDER || 'Forge System <releases@resend.dev>',
      to: toEmail,
      subject: `🚀 New Release: ${tag}`,
      html: `
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">🚀 New Release: ${tag}</h2>

          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
            ${htmlContent}
          </div>

          <p style="text-align: center; margin: 30px 0;">
            <a href="${prUrl}"
               style="background-color: #007cba; color: white; padding: 12px 25px;
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
                View Pull Request #${prNumber}
            </a>
          </p>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

          <p style="color: #666; font-size: 14px;">
            This is an automated release notification from the Forge system.
          </p>
        </body>
        </html>
      `
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Resend API failed: ${res.status} ${res.statusText} ${text}`);
    }

    const result = await res.json();
    console.log(`✅ Sent release email to ${toEmail}`);
    return { ok: true, id: result.id };
  } catch (err) {
    console.error(`❌ Error sending email to ${toEmail}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Convert GitHub markdown to Slack mrkdwn format
 */
function markdownToSlack(markdown) {
  let text = markdown || '';

  // Convert markdown links [text](url) to Slack <url|text>
  text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<$2|$1>');

  // Truncate if too long (Slack has limits)
  if (text.length > 3000) {
    text = text.substring(0, 2950) + '\n\n_... (truncated)_';
  }

  return text;
}

/**
 * Convert GitHub markdown to basic HTML
 */
function markdownToHtml(markdown) {
  let html = markdown || '';

  // Convert headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Convert bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Convert links
  html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>');

  // Convert line breaks
  html = html.replace(/\n/g, '<br>');

  // Convert horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  return html;
}
