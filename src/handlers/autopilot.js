import { respond } from '../utils/http.js';
import { autopilot } from '../services/autopilot.js';

export async function handleAutopilotStart(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const result = await autopilot.start();
    return respond(res, result.ok ? 200 : 400, result);
  } catch (err) {
    console.error('❌ [Handler] Start autopilot error:', err);
    return respond(res, 500, { ok: false, error: err.message });
  }
}

export async function handleAutopilotStop(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const result = await autopilot.stop();
    return respond(res, result.ok ? 200 : 400, result);
  } catch (err) {
    console.error('❌ [Handler] Stop autopilot error:', err);
    return respond(res, 500, { ok: false, error: err.message });
  }
}

export async function handleAutopilotStatus(req, res) {
  if (req.method !== 'GET') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const status = await autopilot.getStatus();
    return respond(res, 200, { ok: true, ...status });
  } catch (err) {
    console.error('❌ [Handler] Get status error:', err);
    return respond(res, 500, { ok: false, error: err.message });
  }
}

export async function handleAutopilotSetMax(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { maxParallel } = JSON.parse(body);
      const result = await autopilot.setMaxParallel(maxParallel);
      return respond(res, result.ok ? 200 : 400, result);
    } catch (err) {
      console.error('❌ [Handler] Set max error:', err);
      return respond(res, 500, { ok: false, error: err.message });
    }
  });
}
