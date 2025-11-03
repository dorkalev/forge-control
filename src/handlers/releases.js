/**
 * Handler for release notifications
 */
import { respond } from '../utils/http.js';
import { sendSlackReleaseNotification, sendReleaseEmail } from '../services/notifications.js';

/**
 * Parse JSON body from request
 */
async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handle POST /api/releases/notify
 * Sends release notifications via Slack and Email
 */
export async function handleReleaseNotify(req, res) {
  try {
    // Verify authorization
    const authHeader = req.headers['authorization'] || '';
    const expectedToken = process.env.SDLC_RELEASE_TOKEN;

    if (!expectedToken) {
      return respond(res, 500, {
        ok: false,
        error: 'Server not configured (missing SDLC_RELEASE_TOKEN)'
      });
    }

    if (!authHeader.startsWith('Bearer ') || authHeader.substring(7) !== expectedToken) {
      return respond(res, 401, {
        ok: false,
        error: 'Unauthorized'
      });
    }

    // Parse request body
    const data = await parseJsonBody(req);

    const { tag, release_notes, pr_number, pr_url } = data;

    if (!tag || !release_notes || !pr_number || !pr_url) {
      return respond(res, 400, {
        ok: false,
        error: 'Missing required fields: tag, release_notes, pr_number, pr_url'
      });
    }

    // Get a-team email list
    const aTeamEmails = (process.env.A_TEAM_EMAILS || '')
      .split(',')
      .map(email => email.trim())
      .filter(email => email);

    const results = {
      slack: null,
      emails: []
    };

    // Send Slack notification
    const slackResult = await sendSlackReleaseNotification({
      tag,
      releaseNotes: release_notes,
      prNumber: pr_number,
      prUrl: pr_url
    });

    if (slackResult.skipped) {
      results.slack = 'not_configured';
    } else if (slackResult.ok) {
      results.slack = 'sent';
    } else {
      results.slack = 'failed';
    }

    // Send email notifications
    if (aTeamEmails.length > 0) {
      for (const toEmail of aTeamEmails) {
        const emailResult = await sendReleaseEmail({
          toEmail,
          tag,
          releaseNotes: release_notes,
          prNumber: pr_number,
          prUrl: pr_url
        });

        results.emails.push({
          email: toEmail,
          status: emailResult.skipped ? 'not_configured' : (emailResult.ok ? 'sent' : 'failed')
        });
      }
    } else {
      results.email_service = 'no_recipients';
    }

    // Determine overall success
    const anySent = (
      results.slack === 'sent' ||
      results.emails.some(e => e.status === 'sent')
    );

    return respond(res, anySent ? 200 : 207, {
      ok: anySent,
      tag,
      notifications: results
    });
  } catch (err) {
    console.error('❌ Error in handleReleaseNotify:', err);
    return respond(res, 500, {
      ok: false,
      error: err.message
    });
  }
}
