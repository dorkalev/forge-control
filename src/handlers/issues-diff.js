import { respond } from '../utils/http.js';
import { getNewIssuesSinceLastRelease, formatIssuesDiff } from '../services/issues-diff.js';
import { generateChangelog, isConfigured as isOpenRouterConfigured } from '../services/openrouter.js';

export async function handleIssuesDiff(req, res) {
  try {
    const diffData = await getNewIssuesSinceLastRelease();
    const markdown = formatIssuesDiff(diffData);

    return respond(res, 200, {
      success: true,
      ...diffData,
      markdown
    });
  } catch (err) {
    console.error('Error getting issues diff:', err.message);
    return respond(res, 500, {
      success: false,
      error: err.message
    });
  }
}

export async function handleGenerateChangelog(req, res, query) {
  if (!isOpenRouterConfigured()) {
    return respond(res, 200, {
      success: false,
      error: 'OpenRouter API not configured'
    });
  }

  const type = query.type || 'condensed';

  if (!['condensed', 'detailed'].includes(type)) {
    return respond(res, 400, {
      success: false,
      error: 'Invalid type parameter. Must be "condensed" or "detailed"'
    });
  }

  try {
    // Get the raw issues diff
    const diffData = await getNewIssuesSinceLastRelease();
    const markdown = formatIssuesDiff(diffData);

    if (!diffData.hasNewIssues) {
      return respond(res, 200, {
        success: true,
        changelog: markdown,
        message: 'No new issues to generate changelog from'
      });
    }

    // Generate AI changelog
    const result = await generateChangelog(markdown, type);

    return respond(res, 200, {
      success: true,
      changelog: result.changelog,
      type,
      model: result.model,
      usage: result.usage,
      issuesCount: diffData.issuesCount
    });
  } catch (err) {
    console.error('Error generating changelog:', err.message);
    return respond(res, 500, {
      success: false,
      error: err.message
    });
  }
}
