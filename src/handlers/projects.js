import { respond } from '../utils/http.js';
import {
  listProjects,
  setActiveProject,
  scanAndMergeProjects,
  getActiveProject
} from '../services/projects.js';

/**
 * GET /api/projects - List all projects and active project
 */
export async function handleListProjects(req, res) {
  try {
    const projects = await listProjects();
    const active = await getActiveProject();

    return respond(res, 200, {
      ok: true,
      activeProject: active?.name || null,
      projects
    });
  } catch (err) {
    console.error('❌ [Projects] Error listing projects:', err);
    return respond(res, 500, { ok: false, error: err.message });
  }
}

/**
 * POST /api/projects/active - Set the active project
 * Body: { project: "project-name" }
 */
export async function handleSetActiveProject(req, res) {
  try {
    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const data = JSON.parse(body);

    if (!data.project) {
      return respond(res, 400, { ok: false, error: 'Missing "project" field' });
    }

    const project = await setActiveProject(data.project);
    return respond(res, 200, {
      ok: true,
      activeProject: project.name,
      project
    });
  } catch (err) {
    console.error('❌ [Projects] Error setting active project:', err);
    return respond(res, 400, { ok: false, error: err.message });
  }
}

/**
 * POST /api/projects/scan - Re-scan ~/src/ for git repositories
 * Body: { path?: "~/src" } (optional, defaults to ~/src)
 */
export async function handleScanProjects(req, res) {
  try {
    // Parse request body (optional)
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let scanPath = '~/src';
    if (body) {
      try {
        const data = JSON.parse(body);
        if (data.path) scanPath = data.path;
      } catch {
        // Ignore parse errors, use default path
      }
    }

    const config = await scanAndMergeProjects(scanPath);
    const projects = Object.values(config.projects);

    return respond(res, 200, {
      ok: true,
      found: projects.length,
      activeProject: config.activeProject,
      projects
    });
  } catch (err) {
    console.error('❌ [Projects] Error scanning projects:', err);
    return respond(res, 500, { ok: false, error: err.message });
  }
}
