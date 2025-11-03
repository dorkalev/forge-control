import { respond } from '../utils/http.js';
import { getEnvironmentHealth, isConfigured } from '../services/render.js';

export async function handleRenderStatus(req, res) {
  if (!isConfigured()) {
    return respond(res, 200, {
      success: true,
      environments: [],
      message: 'Render API not configured'
    });
  }

  try {
    const environments = await getEnvironmentHealth();
    return respond(res, 200, {
      success: true,
      environments,
      hasIssues: environments.length > 0
    });
  } catch (err) {
    console.error('Error fetching Render status:', err.message);
    return respond(res, 500, {
      success: false,
      error: err.message
    });
  }
}
