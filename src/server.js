import http from 'http';
import url from 'url';
import { respond } from './utils/http.js';
import { routeRequest } from './routes/index.js';
import { PORT, TOKEN } from './config/env.js';

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname || '/';

    // Allow API endpoints from external sources (like GitHub Actions)
    // Other endpoints are localhost-only
    const isApiEndpoint = pathname.startsWith('/api/');
    const host = req.headers['host'] || '';

    if (!isApiEndpoint) {
      // Only allow localhost access for non-API routes
      if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
        return respond(res, 403, { ok: false, error: 'Forbidden' });
      }

      // Optional token check for local routes
      if (TOKEN) {
        const token = parsed.query.token || '';
        if (token !== TOKEN) {
          return respond(res, 401, { ok: false, error: 'Unauthorized' });
        }
      }
    }

    // Route the request
    return await routeRequest(req, res, pathname, parsed.query);
  } catch (err) {
    return respond(res, 500, { ok: false, error: err.message });
  }
});

export function startServer() {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Local agent listening on http://localhost:${PORT}`);
  });
}
