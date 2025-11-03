import { RENDER_API_KEY } from '../config/env.js';

const RENDER_API_BASE = 'https://api.render.com/v1';

async function renderApiRequest(endpoint) {
  if (!RENDER_API_KEY) {
    throw new Error('RENDER_API_KEY not configured');
  }

  const response = await fetch(`${RENDER_API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${RENDER_API_KEY}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Render API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function listServices() {
  const data = await renderApiRequest('/services');
  return data.map(item => item.service);
}

export async function getLatestDeploy(serviceId) {
  try {
    const data = await renderApiRequest(`/services/${serviceId}/deploys?limit=1`);
    return data.length > 0 ? data[0].deploy : null;
  } catch (err) {
    console.error(`Error fetching deploy for ${serviceId}:`, err.message);
    return null;
  }
}

export async function getProjects() {
  const data = await renderApiRequest('/projects');
  return data.map(item => item.project);
}

export async function getEnvironments(projectId) {
  const data = await renderApiRequest(`/environments?projectId=${projectId}`);
  return data.map(item => item.environment);
}

export async function getEnvironmentHealth() {
  try {
    // Get all services
    const services = await listServices();

    // Get all projects and their environments
    const projects = await getProjects();
    const environmentsMap = new Map();

    for (const project of projects) {
      const environments = await getEnvironments(project.id);
      for (const env of environments) {
        environmentsMap.set(env.id, {
          id: env.id,
          name: env.name,
          projectName: project.name,
          services: []
        });
      }
    }

    // Process each service and get its latest deploy
    const servicePromises = services.map(async (service) => {
      const deploy = await getLatestDeploy(service.id);

      // Determine if service is unhealthy
      const isUnhealthy =
        service.suspended !== 'not_suspended' ||
        (deploy && deploy.status && !['live', 'deactivated'].includes(deploy.status));

      return {
        service,
        deploy,
        isUnhealthy,
        environmentId: service.environmentId
      };
    });

    const servicesWithDeploys = await Promise.all(servicePromises);

    // Group services by environment
    for (const item of servicesWithDeploys) {
      const env = environmentsMap.get(item.environmentId);
      if (env) {
        env.services.push({
          id: item.service.id,
          name: item.service.name,
          type: item.service.type,
          branch: item.service.branch,
          suspended: item.service.suspended,
          url: item.service.serviceDetails?.url || item.service.dashboardUrl,
          dashboardUrl: item.service.dashboardUrl,
          deploy: item.deploy ? {
            status: item.deploy.status,
            createdAt: item.deploy.createdAt,
            finishedAt: item.deploy.finishedAt,
            commitMessage: item.deploy.commit?.message?.split('\n')[0] || 'No message'
          } : null,
          isUnhealthy: item.isUnhealthy
        });
      }
    }

    // Filter to only environments with unhealthy services
    const unhealthyEnvironments = Array.from(environmentsMap.values())
      .filter(env => env.services.some(s => s.isUnhealthy))
      .map(env => ({
        ...env,
        services: env.services.filter(s => s.isUnhealthy)
      }));

    return unhealthyEnvironments;
  } catch (err) {
    console.error('Error getting environment health:', err.message);
    throw err;
  }
}

export function isConfigured() {
  return !!RENDER_API_KEY;
}
