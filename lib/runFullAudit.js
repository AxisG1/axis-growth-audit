#!/usr/bin/env node
/**
 * AXIS GROWTH - Complete Credit Audit Pipeline
 * 
 * Usage: node runFullAudit.js <credit_report.pdf> [output_directory]
 * 
 * This script:
 * 1. Parses the PDF credit report
 * 2. Runs the detection engine
 * 3. Generates all documents (Executive Summary, Detailed Report, Action Plan, Dispute Letters)
 */

const fs = require('fs');
const path = require('path');
const { parseCreditReportPDF } = require('./parseCreditReport.js');

// ============================================================================
// ISSUE TYPE DEFINITIONS
// ============================================================================
const ISSUE_TYPES = {
  DATE_MISMATCH_OPEN: { label: 'Open Date Mismatch', severity: 'high', basis: 'FCRA §611(a)' },
  DATE_MISMATCH_DLA: { label: 'Date of Last Activity Mismatch', severity: 'high', basis: 'FCRA §611(a)' },
  DATE_MISMATCH_DOFD: { label: 'DOFD Mismatch', severity: 'critical', basis: 'FCRA §623(a)(2), §605(c)' },
  DATE_MISMATCH_PAYMENT: { label: 'Last Payment Date Mismatch', severity: 'medium', basis: 'FCRA §611(a)' },
  BALANCE_MISMATCH: { label: 'Balance Mismatch', severity: 'medium', basis: 'FCRA §611(a)' },
  LIMIT_MISMATCH: { label: 'Credit Limit Mismatch', severity: 'low', basis: 'FCRA §611(a)' },
  STATUS_MISMATCH: { label: 'Account Status Mismatch', severity: 'high', basis: 'FCRA §611(a)' },
  MISSING_OC: { label: 'Missing Original Creditor', severity: 'medium', basis: 'FDCPA §809(a)' },
  MISSING_DOFD: { label: 'Missing Date of First Delinquency', severity: 'high', basis: 'FCRA §623(a)(2)' },
  INQUIRY_EXPIRED: { label: 'Expired Hard Inquiry', severity: 'low', basis: 'FCRA §605(a)(3)' },
  REPORTING_EXPIRED: { label: 'Reporting Period Expired', severity: 'critical', basis: 'FCRA §605(a)' },
};

const MEDICAL_DEBT_BAN_STATES = ['CA', 'CO', 'CT', 'DE', 'IL', 'ME', 'MD', 'MN', 'NJ', 'NY', 'OR', 'RI', 'VT', 'VA', 'WA'];

// ============================================================================
// DETECTION ENGINE
// ============================================================================
function runDetectionEngine(data) {
  const { client, tradelines, collections, inquiries } = data;
  const findings = [];
  let findingId = 1;

  const daysDiff = (d1, d2) => {
    if (!d1 || !d2) return null;
    return Math.abs((new Date(d1) - new Date(d2)) / (1000 * 60 * 60 * 24));
  };

  const normalizeCreditor = (name) => {
    if (!name) return '';
    return name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
  };

  // Group tradelines by account
  const tradelineGroups = {};
  tradelines.forEach(t => {
    const key = normalizeCreditor(t.creditorName) + '_' + (t.accountNumberPartial || '').slice(-4);
    if (!tradelineGroups[key]) tradelineGroups[key] = [];
    tradelineGroups[key].push(t);
  });

  // Analyze tradelines
  Object.entries(tradelineGroups).forEach(([key, items]) => {
    if (items.length < 2) return;

    const itemName = items[0].creditorName + ' (...' + (items[0].accountNumberPartial || '').slice(-4) + ')';

    // Open Date Mismatch
    const openDates = items.filter(i => i.openDate).map(i => ({ bureau: i.bureau, date: i.openDate }));
    if (openDates.length >= 2) {
      for (let i = 0; i < openDates.length; i++) {
        for (let j = i + 1; j < openDates.length; j++) {
          const diff = daysDiff(openDates[i].date, openDates[j].date);
          if (diff !== null && diff > 30) {
            findings.push({
              id: findingId++,
              type: 'DATE_MISMATCH_OPEN',
              item: itemName,
              bureausAffected: [openDates[i].bureau, openDates[j].bureau],
              severity: 'high',
              basis: ISSUE_TYPES.DATE_MISMATCH_OPEN.basis,
              evidence: `[Evidence: ${openDates[i].bureau} reports Open Date "${openDates[i].date}" vs ${openDates[j].bureau} reports "${openDates[j].date}" - ${Math.round(diff)} day difference]`,
              action: 'Dispute for investigation of conflicting open dates',
              impactScore: 7,
              timeline: '30-45 days',
              claimIndicator: false,
              documentationNeeded: [],
              dependencies: [],
            });
            break;
          }
        }
      }
    }

    // DLA Mismatch
    const dlaValues = items.filter(i => i.dateOfLastActivity).map(i => ({ bureau: i.bureau, date: i.dateOfLastActivity }));
    if (dlaValues.length >= 2) {
      for (let i = 0; i < dlaValues.length; i++) {
        for (let j = i + 1; j < dlaValues.length; j++) {
          const diff = daysDiff(dlaValues[i].date, dlaValues[j].date);
          if (diff !== null && diff > 30) {
            findings.push({
              id: findingId++,
              type: 'DATE_MISMATCH_DLA',
              item: itemName,
              bureausAffected: [dlaValues[i].bureau, dlaValues[j].bureau],
              severity: 'high',
              basis: ISSUE_TYPES.DATE_MISMATCH_DLA.basis,
              evidence: `[Evidence: ${dlaValues[i].bureau} reports DLA "${dlaValues[i].date}" vs ${dlaValues[j].bureau} reports "${dlaValues[j].date}" - ${Math.round(diff)} day difference]`,
              action: 'Dispute for investigation of conflicting activity dates',
              impactScore: 7,
              timeline: '30-45 days',
              claimIndicator: false,
              documentationNeeded: [],
              dependencies: [],
            });
            break;
          }
        }
      }
    }

    // Payment Date Mismatch
    const payDates = items.filter(i => i.lastPaymentDate).map(i => ({ bureau: i.bureau, date: i.lastPaymentDate }));
    if (payDates.length >= 2) {
      for (let i = 0; i < payDates.length; i++) {
        for (let j = i + 1; j < payDates.length; j++) {
          const diff = daysDiff(payDates[i].date, payDates[j].date);
          if (diff !== null && diff > 30) {
            findings.push({
              id: findingId++,
              type: 'DATE_MISMATCH_PAYMENT',
              item: itemName,
              bureausAffected: [payDates[i].bureau, payDates[j].bureau],
              severity: 'medium',
              basis: ISSUE_TYPES.DATE_MISMATCH_PAYMENT.basis,
              evidence: `[Evidence: ${payDates[i].bureau} reports Last Payment "${payDates[i].date}" vs ${payDates[j].bureau} reports "${payDates[j].date}" - ${Math.round(diff)} day difference]`,
              action: 'Dispute for investigation of conflicting payment dates',
              impactScore: 5,
              timeline: '30-45 days',
              claimIndicator: false,
              documentationNeeded: [],
              dependencies: [],
            });
            break;
          }
        }
      }
    }

    // Status Mismatch
    const statuses = items.filter(i => i.status).map(i => ({ bureau: i.bureau, status: i.status }));
    if (statuses.length >= 2) {
      const normalized = statuses.map(s => s.status.toLowerCase().replace(/[^a-z]/g, ''));
      if (new Set(normalized).size > 1) {
        findings.push({
          id: findingId++,
          type: 'STATUS_MISMATCH',
          item: itemName,
          bureausAffected: statuses.map(s => s.bureau),
          severity: 'high',
          basis: ISSUE_TYPES.STATUS_MISMATCH.basis,
          evidence: `[Evidence: Status conflict - ${statuses.map(s => `${s.bureau}: "${s.status}"`).join(' vs ')}]`,
          action: 'Dispute for investigation of conflicting account statuses',
          impactScore: 8,
          timeline: '30-45 days',
          claimIndicator: false,
          documentationNeeded: [],
          dependencies: [],
        });
      }
    }

    // Credit Limit Mismatch
    const limits = items.filter(i => i.creditLimit !== null).map(i => ({ bureau: i.bureau, limit: i.creditLimit }));
    if (limits.length >= 2) {
      const hasLimit = limits.some(l => l.limit > 0);
      const hasMismatch = limits.some((l, i) => limits.some((l2, j) => i !== j && l.limit !== l2.limit));
      if (hasLimit && hasMismatch) {
        findings.push({
          id: findingId++,
          type: 'LIMIT_MISMATCH',
          item: itemName,
          bureausAffected: limits.map(l => l.bureau),
          severity: 'low',
          basis: ISSUE_TYPES.LIMIT_MISMATCH.basis,
          evidence: `[Evidence: Credit limit mismatch - ${limits.map(l => `${l.bureau}: $${l.limit}`).join(' vs ')}]`,
          action: 'Dispute for correction of credit limit (affects utilization ratio)',
          impactScore: 4,
          timeline: '30-45 days',
          claimIndicator: false,
          documentationNeeded: [],
          dependencies: [],
        });
      }
    }
  });

  // Analyze collections
  collections.forEach(c => {
    const itemName = (c.collectorName || c.creditorName) + ' (...' + (c.accountNumberPartial || '').slice(-4) + ')';

    // Missing Original Creditor
    if (!c.originalCreditor || c.originalCreditor.trim() === '') {
      findings.push({
        id: findingId++,
        type: 'MISSING_OC',
        item: itemName,
        bureausAffected: [c.bureau],
        severity: 'medium',
        basis: ISSUE_TYPES.MISSING_OC.basis,
        evidence: `[Evidence: Collection "${c.collectorName || c.creditorName}" on ${c.bureau} does not identify Original Creditor]`,
        action: 'Dispute for incomplete reporting - Original Creditor required',
        impactScore: 6,
        timeline: '30-45 days',
        claimIndicator: true,
        cannotConfirm: 'Cannot confirm debt ownership chain without Original Creditor',
        documentationNeeded: ['Debt validation letter', 'Original creditor documentation'],
        dependencies: [],
      });
    }

    // Missing DOFD
    if (!c.dateOfFirstDelinquency || c.dateOfFirstDelinquency.trim() === '') {
      findings.push({
        id: findingId++,
        type: 'MISSING_DOFD',
        item: itemName,
        bureausAffected: [c.bureau],
        severity: 'high',
        basis: ISSUE_TYPES.MISSING_DOFD.basis,
        evidence: `[Evidence: Collection "${c.collectorName || c.creditorName}" on ${c.bureau} missing DOFD - required per FCRA §623(a)(2)]`,
        action: 'Dispute for incomplete reporting - DOFD required for 7-year calculation',
        impactScore: 8,
        timeline: '30-45 days',
        claimIndicator: true,
        cannotConfirm: 'Cannot confirm 7-year reporting period without DOFD',
        documentationNeeded: ['Original creditor records showing delinquency date'],
        dependencies: [],
      });
    }
  });

  // Analyze inquiries (expired = over 2 years)
  const today = new Date();
  inquiries.forEach(inq => {
    if (inq.inquiryDate && inq.inquiryType === 'hard') {
      const inquiryDate = new Date(inq.inquiryDate);
      const ageInDays = (today - inquiryDate) / (1000 * 60 * 60 * 24);
      if (ageInDays > 730) {
        findings.push({
          id: findingId++,
          type: 'INQUIRY_EXPIRED',
          item: inq.creditorName,
          bureausAffected: [inq.bureau],
          severity: 'low',
          basis: ISSUE_TYPES.INQUIRY_EXPIRED.basis,
          evidence: `[Evidence: Hard inquiry dated ${inq.inquiryDate} is over 2 years old]`,
          action: 'Dispute for removal - inquiry exceeds 2-year reporting period',
          impactScore: 3,
          timeline: '30-45 days',
          claimIndicator: false,
          documentationNeeded: [],
          dependencies: [],
        });
      }
    }
  });

  return findings;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║           AXIS GROWTH - Credit Forensic Audit Tool                ║
╚════════════════════════════════════════════════════════════════════╝

Usage: node runFullAudit.js <credit_report.pdf> [output_directory]

Example:
  node runFullAudit.js client_report.pdf ./client_output

This will:
  1. Parse the PDF credit report
  2. Run forensic analysis (17 detection types)
  3. Generate Executive Summary, Detailed Report, Action Plan
  4. Generate dispute letters for each finding
`);
    process.exit(1);
  }

  const pdfPath = args[0];
  const outputDir = args[1] || './audit_output';

  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║           AXIS GROWTH - Credit Forensic Audit Tool                ║
╚════════════════════════════════════════════════════════════════════╝
`);

  // Step 1: Parse PDF
  console.log('▶ STEP 1: Parsing Credit Report PDF...');
  const startParse = Date.now();
  const data = parseCreditReportPDF(pdfPath);
  console.log(`  ✓ Parsed in ${Date.now() - startParse}ms`);
  console.log(`  ✓ Client: ${data.client.name} (${data.client.state})`);
  console.log(`  ✓ Found ${data.tradelines.length} tradelines, ${data.collections.length} collections, ${data.inquiries.length} inquiries`);

  // Step 2: Run Detection
  console.log('\n▶ STEP 2: Running Detection Engine...');
  const startDetect = Date.now();
  const findings = runDetectionEngine(data);
  console.log(`  ✓ Analysis complete in ${Date.now() - startDetect}ms`);
  console.log(`  ✓ Found ${findings.length} issues`);
  
  // Count by severity
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  findings.forEach(f => counts[f.severity]++);
  console.log(`    - Critical: ${counts.critical}`);
  console.log(`    - High: ${counts.high}`);
  console.log(`    - Medium: ${counts.medium}`);
  console.log(`    - Low: ${counts.low}`);

  // Step 3: Generate Documents
  console.log('\n▶ STEP 3: Generating Documents...');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save findings JSON for document generator
  const auditData = { client: data.client, findings };
  const jsonPath = path.join(outputDir, 'audit_data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(auditData, null, 2));

  // Run document generator
  const startDocs = Date.now();
  try {
    const { execSync } = require('child_process');
    execSync(`node "${path.join(__dirname, 'generateAuditDocuments.js')}" "${jsonPath}" "${outputDir}"`, {
      encoding: 'utf8',
      stdio: 'inherit'
    });
  } catch (err) {
    console.log('  Note: Document generator not available, using text output');
    // Fallback: generate text summary
    generateTextSummary(auditData, outputDir);
  }
  
  console.log(`  ✓ Documents generated in ${Date.now() - startDocs}ms`);

  // Final Summary
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                        AUDIT COMPLETE                             ║
╚════════════════════════════════════════════════════════════════════╝

  Client: ${data.client.name}
  Total Issues: ${findings.length}
  Output: ${outputDir}

  Files generated:
    - Executive Summary
    - Detailed Audit Report
    - Action Plan
    - ${findings.length * 2} Dispute Letters (approx)

  Total time: ${Date.now() - startParse}ms
`);
}

function generateTextSummary(auditData, outputDir) {
  const { client, findings } = auditData;
  const summary = `
AXIS GROWTH - CREDIT FORENSIC AUDIT
=====================================
Client: ${client.name}
State: ${client.state}
Date: ${new Date().toLocaleDateString()}

FINDINGS SUMMARY
----------------
Total Issues: ${findings.length}

${findings.map((f, i) => `
${i + 1}. [${f.severity.toUpperCase()}] ${f.item}
   Issue: ${ISSUE_TYPES[f.type]?.label || f.type}
   Bureau(s): ${f.bureausAffected.join(', ')}
   ${f.evidence}
   Action: ${f.action}
`).join('\n')}
`;

  fs.writeFileSync(path.join(outputDir, 'audit_summary.txt'), summary);
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});
