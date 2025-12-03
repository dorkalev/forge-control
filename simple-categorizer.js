import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs/promises';

dotenv.config();

const LINEAR_API_KEY = process.env.LINEAR_APP;

class SimpleCategorizer {
  constructor() {
    this.linearHeaders = {
      'Authorization': LINEAR_API_KEY,
      'Content-Type': 'application/json'
    };
  }

  async fetchLinearIssues() {
    const query = `
      query {
        issues(first: 100) {
          nodes {
            id
            title
            description
            priority
            state {
              name
              type
            }
            assignee {
              name
            }
            labels {
              nodes {
                name
              }
            }
            createdAt
            updatedAt
          }
        }
      }
    `;

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: this.linearHeaders,
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.data.issues.nodes;
    } catch (error) {
      console.error('Error fetching Linear issues:', error);
      return [];
    }
  }

  categorizeIssues(issues) {
    const forgeKeywords = [
      'document', 'spec', 'requirement', 'design', 'architecture', 'plan',
      'documentation', 'wireframe', 'mockup', 'user story', 'acceptance criteria',
      'test plan', 'strategy', 'proposal', 'rfc', 'adr', 'policy', 'procedure',
      'process', 'workflow', 'template', 'standard', 'guideline', 'manual',
      'runbook', 'playbook', 'sop', 'compliance', 'audit', 'review',
      'disaster recovery', 'business continuity', 'incident response',
      'change management', 'rollback', 'deployment guide', 'configuration',
      'setup', 'installation', 'training', 'onboarding', 'knowledge base',
      'wiki', 'readme', 'changelog', 'release notes', 'roadmap',
      'backlog grooming', 'sprint planning', 'retrospective', 'post-mortem',
      'risk assessment', 'threat model', 'security policy', 'privacy policy',
      'terms of service', 'sla', 'service level', 'monitoring', 'alerting',
      'logging', 'metrics', 'dashboard', 'reporting', 'analytics', 'create',
      'write', 'draft', 'define', 'establish', 'formalize', 'qa', 'testing'
    ];

    const forgeTasks = [];
    const otherTasks = [];

    issues.forEach(issue => {
      const text = `${issue.title} ${issue.description || ''}`.toLowerCase();
      const isForgeTask = forgeKeywords.some(keyword => text.includes(keyword));

      if (isForgeTask) {
        let suggestedDocument = 'General Documentation';

        // Suggest specific document types based on content
        if (text.includes('qa') || text.includes('test')) {
          suggestedDocument = 'QA/Test Plan Document';
        } else if (text.includes('architecture') || text.includes('design')) {
          suggestedDocument = 'Architecture/Design Document';
        } else if (text.includes('policy') || text.includes('procedure')) {
          suggestedDocument = 'Policy/Procedure Document';
        } else if (text.includes('disaster') || text.includes('recovery')) {
          suggestedDocument = 'Disaster Recovery Plan';
        } else if (text.includes('change management')) {
          suggestedDocument = 'Change Management Document';
        } else if (text.includes('forge') || text.includes('development life cycle')) {
          suggestedDocument = 'Forge Process Document';
        } else if (text.includes('security') || text.includes('compliance')) {
          suggestedDocument = 'Security/Compliance Document';
        } else if (text.includes('requirement')) {
          suggestedDocument = 'Requirements Document';
        }

        forgeTasks.push({
          id: issue.id,
          title: issue.title,
          description: issue.description || '',
          priority: issue.priority,
          state: issue.state?.name,
          suggested_document: suggestedDocument,
          reason: 'Contains keywords related to documentation/planning'
        });
      } else {
        let category = 'implementation';

        if (text.includes('bug') || text.includes('fix') || text.includes('error')) {
          category = 'bug_fix';
        } else if (text.includes('security') || text.includes('vulnerability')) {
          category = 'security_fix';
        } else if (text.includes('upgrade') || text.includes('update') || text.includes('dependency')) {
          category = 'dependency_update';
        } else if (text.includes('infrastructure') || text.includes('deployment') || text.includes('server')) {
          category = 'infrastructure';
        } else if (text.includes('feature') || text.includes('add') || text.includes('new')) {
          category = 'feature_implementation';
        }

        otherTasks.push({
          id: issue.id,
          title: issue.title,
          description: issue.description || '',
          priority: issue.priority,
          state: issue.state?.name,
          category: category,
          reason: 'Requires implementation/technical work'
        });
      }
    });

    return {
      forge_document_tasks: forgeTasks,
      other_tasks: otherTasks
    };
  }

  async generateReport(categorizedTasks, allIssues) {
    const timestamp = new Date().toISOString();

    let report = `LINEAR TASK CATEGORIZATION REPORT
Generated: ${timestamp}
Total Issues Analyzed: ${allIssues.length}

========================================
FORGE DOCUMENT CREATION TASKS (${categorizedTasks.forge_document_tasks.length})
========================================

These tasks can be completed or started by creating FORGE documents:

`;

    categorizedTasks.forge_document_tasks.forEach((task, index) => {
      report += `${index + 1}. ${task.title}
   ID: ${task.id}
   Suggested Document: ${task.suggested_document}
   Priority: ${task.priority || 'Not set'}
   Status: ${task.state || 'Unknown'}
   Description: ${task.description ? task.description.substring(0, 150) + '...' : 'No description'}

`;
    });

    report += `
========================================
OTHER TASKS (${categorizedTasks.other_tasks.length})
========================================

These tasks require implementation, bug fixes, or other non-document work:

`;

    // Group other tasks by category
    const categorizedOther = {};
    categorizedTasks.other_tasks.forEach(task => {
      const category = task.category || 'uncategorized';
      if (!categorizedOther[category]) {
        categorizedOther[category] = [];
      }
      categorizedOther[category].push(task);
    });

    Object.keys(categorizedOther).forEach(category => {
      report += `\n--- ${category.toUpperCase().replace('_', ' ')} (${categorizedOther[category].length}) ---\n\n`;

      categorizedOther[category].forEach((task, index) => {
        report += `${index + 1}. ${task.title}
   ID: ${task.id}
   Category: ${task.category}
   Priority: ${task.priority || 'Not set'}
   Status: ${task.state || 'Unknown'}
   Description: ${task.description ? task.description.substring(0, 150) + '...' : 'No description'}

`;
      });
    });

    report += `
========================================
SUMMARY
========================================

📋 FORGE Document Tasks: ${categorizedTasks.forge_document_tasks.length} tasks can be completed by creating documents
🔧 Implementation Tasks: ${categorizedTasks.other_tasks.length} tasks require development work

NEXT STEPS:
1. Review the FORGE document tasks above
2. Let me know which documents you'd like me to create
3. I can help generate templates and content for any of these documents

`;

    return report;
  }

  async run() {
    console.log('🔄 Fetching Linear issues...');
    const issues = await this.fetchLinearIssues();

    if (issues.length === 0) {
      console.log('❌ No issues found or error fetching issues');
      return;
    }

    console.log(`✅ Found ${issues.length} issues`);
    console.log('📊 Categorizing all tasks...');

    const categorizedTasks = this.categorizeIssues(issues);

    console.log('📝 Generating comprehensive report...');
    const report = await this.generateReport(categorizedTasks, issues);

    await fs.writeFile('linear_task_analysis_complete.txt', report);
    console.log('✅ Complete report saved to linear_task_analysis_complete.txt');

    // Also log summary to console
    console.log(`\n📊 COMPLETE SUMMARY:`);
    console.log(`   FORGE Document Tasks: ${categorizedTasks.forge_document_tasks.length}`);
    console.log(`   Other Tasks: ${categorizedTasks.other_tasks.length}`);
    console.log(`   Total: ${issues.length}`);
  }
}

// Run the categorizer
const categorizer = new SimpleCategorizer();
categorizer.run().catch(console.error);