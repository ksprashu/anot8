import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Milestone M-Rel-1: Governance, Disclaimers & Documentation Test Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');

  it('verifies LICENSE file exists and contains full Apache 2.0 text and Copyright notice', () => {
    const licensePath = path.join(rootDir, 'LICENSE');
    expect(fs.existsSync(licensePath)).toBe(true);

    const licenseContent = fs.readFileSync(licensePath, 'utf-8');
    expect(licenseContent).toContain('Apache License');
    expect(licenseContent).toContain('Version 2.0, January 2004');
    expect(licenseContent).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION');
    expect(licenseContent).toContain('1. Definitions.');
    expect(licenseContent).toContain('7. Disclaimer of Warranty.');
    expect(licenseContent).toContain('8. Limitation of Liability.');
    expect(licenseContent).toContain('Copyright 2026 Prashanth Subrahmanyam');
  });

  it('verifies README.md exists and contains the mandatory non-affiliation disclaimer callout banner', () => {
    const readmePath = path.join(rootDir, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);

    const readmeContent = fs.readFileSync(readmePath, 'utf-8');
    // Verify exact non-affiliation text
    expect(readmeContent).toContain('Annot8 is an independent, personal open-source project created and maintained by Prashanth Subrahmanyam');
    expect(readmeContent).toContain('It is not an official Google project or product, and is not supported, certified, or endorsed by Google LLC in any capacity');
    expect(readmeContent).toContain('WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND');
    expect(readmeContent).toContain('Use at your own risk');

    // Verify badges
    expect(readmeContent).toContain('License: Apache 2.0');
    expect(readmeContent).toContain('TypeScript');
    expect(readmeContent).toContain('React');
    expect(readmeContent).toContain('Tailwind CSS');
    expect(readmeContent).toContain('Vitest');
    expect(readmeContent).toContain('GitHub Pages');

    // Verify key sections
    expect(readmeContent).toContain('Comprehensive Keyboard Shortcuts');
    expect(readmeContent).toContain('Getting Started & Local Development');
    expect(readmeContent).toContain('Production Deployment');
    expect(readmeContent).toContain('deploy-pages.yml');
  });

  it('verifies CONTRIBUTING.md exists with developer guidelines, code standards, and SLA notice', () => {
    const contributingPath = path.join(rootDir, 'CONTRIBUTING.md');
    expect(fs.existsSync(contributingPath)).toBe(true);

    const contributingContent = fs.readFileSync(contributingPath, 'utf-8');
    expect(contributingContent).toContain('Contributing to Annot8');
    expect(contributingContent).toContain('Project Scope & Support Disclaimer');
    expect(contributingContent).toContain('There is no Service Level Agreement (SLA)');
    expect(contributingContent).toContain('not an official Google project or product');
    expect(contributingContent).toContain('TypeScript Guidelines');
    expect(contributingContent).toContain('Testing & Quality Assurance');
    expect(contributingContent).toContain('Contribution Workflow');
  });

  it('verifies GitHub issue templates and PR template exist with non-affiliation disclaimers', () => {
    const bugReportPath = path.join(rootDir, '.github/ISSUE_TEMPLATE/bug_report.md');
    const featureReqPath = path.join(rootDir, '.github/ISSUE_TEMPLATE/feature_request.md');
    const prTemplatePath = path.join(rootDir, '.github/pull_request_template.md');

    expect(fs.existsSync(bugReportPath)).toBe(true);
    expect(fs.existsSync(featureReqPath)).toBe(true);
    expect(fs.existsSync(prTemplatePath)).toBe(true);

    const bugReportContent = fs.readFileSync(bugReportPath, 'utf-8');
    const featureReqContent = fs.readFileSync(featureReqPath, 'utf-8');
    const prTemplateContent = fs.readFileSync(prTemplatePath, 'utf-8');

    expect(bugReportContent).toContain('NOT an official Google project or product');
    expect(featureReqContent).toContain('NOT an official Google project or product');
    expect(prTemplateContent).toContain('not an official Google project or product');
  });

  it('verifies GitHub Actions CI workflow is configured properly', () => {
    const ciPath = path.join(rootDir, '.github/workflows/ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);

    const ciContent = fs.readFileSync(ciPath, 'utf-8');
    expect(ciContent).toContain('name: CI');
    expect(ciContent).toContain('npm run typecheck');
    expect(ciContent).toContain('npm run lint');
    expect(ciContent).toContain('npm test');
    expect(ciContent).toContain('npm run build');
  });
});
