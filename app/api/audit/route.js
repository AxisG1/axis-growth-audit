import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Detection engine and document generator (inline for simplicity)
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
};

const MEDICAL_DEBT_BAN_STATES = ['CA', 'CO', 'CT', 'DE', 'IL', 'ME', 'MD', 'MN', 'NJ', 'NY', 'OR', 'RI', 'VT', 'VA', 'WA'];

// Parse PDF text content to extract credit data
function parseCreditReportText(text) {
  const lines = text.split('\n');
  
  const client = {
    name: '',
    state: '',
    goal: 'general',
    timeline: 12,
    idTheft: false
  };
  
  // Extract client info
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const line = lines[i];
    if (line.includes('Name') && !client.name) {
      const match = line.match(/Name\s+([A-Z][A-Z\s]+)/i);
      if (match) client.name = match[1].trim().split(/\s{2,}/)[0];
    }
    if ((line.includes('Address')) && !client.state) {
      const stateMatch = line.match(/,\s*([A-Z]{2})\s+\d{5}/);
      if (stateMatch) client.state = stateMatch[1];
    }
    if (line.toLowerCase().includes('fraud')) client.idTheft = true;
  }

  // Parse accounts
  const tradelines = [];
  const collections = [];
  let accountId = 1;

  const sections = text.split(/(?=\n\s*Account\s*#\s+)/i);
  
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const prevSection = sections[i - 1];
    
    // Get creditor name
    const prevLines = prevSection.split('\n').filter(l => l.trim());
    let creditorName = '';
    for (let j = prevLines.length - 1; j >= 0; j--) {
      const line = prevLines[j].trim();
      if (line && !line.match(/Page \d+|http|Transunion|Experian|Equifax|Days Late/i)) {
        creditorName = line.split(/\s{3,}/)[0].trim();
        break;
      }
    }

    const isCollection = section.toLowerCase().includes('collection') || 
                         creditorName.match(/LVNV|MIDLAND|PORTFOLIO|CAVALRY|IC SYSTEM|ERC|RECEIVABLE/i);

    // Parse TU, EX, EQ data from columns
    const bureauData = { TU: {}, EX: {}, EQ: {} };
    const fieldPatterns = [
      { field: 'accountNumber', regex: /Account\s*#\s+([\d\*]+)\s+(?:--|(\S+))?\s+(?:--|(\S+))?/i },
      { field: 'openDate', regex: /Date\s*Opened[:\s]+([\d\/]+)\s+(?:--|([\d\/]+))?\s+(?:--|([\d\/]+))?/i },
      { field: 'dateOfLastActivity', regex: /Date\s*of\s*Last\s*Activity[:\s]+([\d\/]+)\s+(?:--|([\d\/]+))?\s+(?:--|([\d\/]+))?/i },
      { field: 'lastPaymentDate', regex: /Last\s*Payment[:\s]+([\d\/]+)\s+(?:--|([\d\/]+))?\s+(?:--|([\d\/]+))?/i },
      { field: 'currentBalance', regex: /Balance\s*Owed[:\s]+\$?([\d,]+)\s+(?:--|\$?([\d,]+))?\s+(?:--|\$?([\d,]+))?/i },
      { field: 'creditLimit', regex: /Credit\s*Limit[:\s]+\$?([\d,]+)\s+(?:--|\$?([\d,]+))?\s+(?:--|\$?([\d,]+))?/i },
      { field: 'status', regex: /Account\s*Status[:\s]+(\S+(?:\s+\S+)?)\s+(?:--|(\S+(?:\s+\S+)?))?\s+(?:--|(\S+(?:\s+\S+)?))?/i },
    ];

    for (const line of section.split('\n')) {
      for (const { field, regex } of fieldPatterns) {
        const match = line.match(regex);
        if (match) {
          if (match[1] && match[1] !== '--') bureauData.TU[field] = match[1].trim();
          if (match[2] && match[2] !== '--') bureauData.EX[field] = match[2].trim();
          if (match[3] && match[3] !== '--') bureauData.EQ[field] = match[3].trim();
        }
      }
    }

    // Create entries for each bureau with data
    ['TU', 'EX', 'EQ'].forEach(bureau => {
      const data = bureauData[bureau];
      if (data.accountNumber || data.currentBalance || data.openDate) {
        const account = {
          id: `${isCollection ? 'c' : 't'}${accountId++}`,
          creditorName,
          accountNumberPartial: (data.accountNumber || '').replace(/\*/g, '').slice(-4),
          bureau,
          status: data.status || '',
          openDate: parseDate(data.openDate),
          dateOfFirstDelinquency: '',
          dateOfLastActivity: parseDate(data.dateOfLastActivity),
          lastPaymentDate: parseDate(data.lastPaymentDate),
          creditLimit: parseNumber(data.creditLimit),
          currentBalance: parseNumber(data.currentBalance),
          isCollection,
        };

        if (isCollection) {
          account.collectorName = creditorName;
          account.originalCreditor = '';
          account.isMedical = creditorName.toLowerCase().includes('medical');
          collections.push(account);
        } else {
          tradelines.push(account);
        }
      }
    });
  }

  return { client, tradelines, collections, inquiries: [] };
}

function parseDate(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  const match2 = dateStr.match(/(\d{1,2})\/(\d{4})/);
  if (match2) return `${match2[2]}-${match2[1].padStart(2, '0')}-01`;
  return '';
}

function parseNumber(numStr) {
  if (!numStr) return null;
  const num = parseInt(numStr.replace(/[$,\s]/g, ''), 10);
  return isNaN(num) ? null : num;
}

// Detection Engine
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

  // Group tradelines
  const groups = {};
  tradelines.forEach(t => {
    const key = normalizeCreditor(t.creditorName) + '_' + (t.accountNumberPartial || '').slice(-4);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  // Analyze tradelines
  Object.entries(groups).forEach(([key, items]) => {
    if (items.length < 2) return;
    const itemName = items[0].creditorName + ' (...' + (items[0].accountNumberPartial || '').slice(-4) + ')';

    // Open Date Mismatch
    const openDates = items.filter(i => i.openDate).map(i => ({ bureau: i.bureau, date: i.openDate }));
    if (openDates.length >= 2) {
      for (let i = 0; i < openDates.length; i++) {
        for (let j = i + 1; j < openDates.length; j++) {
          const diff = daysDiff(openDates[i].date, openDates[j].date);
          if (diff && diff > 30) {
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
          if (diff && diff > 30) {
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
          action: 'Dispute for correction of credit limit (affects utilization)',
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

  return findings;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Read file content
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // For now, we'll extract text using a simple approach
    // In production, you'd use pdf-parse or similar
    const text = buffer.toString('utf8');
    
    // Parse the credit report
    const data = parseCreditReportText(text);
    
    // Run detection engine
    const findings = runDetectionEngine(data);

    // Generate audit ID
    const auditId = uuidv4();

    // Store results (in production, use a database)
    const auditDir = path.join('/tmp', 'audits', auditId);
    if (!existsSync(path.join('/tmp', 'audits'))) {
      await mkdir(path.join('/tmp', 'audits'), { recursive: true });
    }
    await mkdir(auditDir, { recursive: true });
    
    const auditData = {
      auditId,
      client: data.client,
      findings,
      tradelines: data.tradelines,
      collections: data.collections,
      createdAt: new Date().toISOString(),
    };

    await writeFile(
      path.join(auditDir, 'audit.json'),
      JSON.stringify(auditData, null, 2)
    );

    return NextResponse.json({
      auditId,
      client: data.client,
      findings,
      summary: {
        total: findings.length,
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
      }
    });

  } catch (error) {
    console.error('Audit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
// Detection engine and document generator (inline for simplicity)
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
};

const MEDICAL_DEBT_BAN_STATES = ['CA', 'CO', 'CT', 'DE', 'IL', 'ME', 'MD', 'MN', 'NJ', 'NY', 'OR', 'RI', 'VT', 'VA', 'WA'];

// Parse PDF text content to extract credit data
function parseCreditReportText(text) {
  const lines = text.split('\n');
  
  const client = {
    name: '',
    state: '',
    goal: 'general',
    timeline: 12,
    idTheft: false
  };
  
  // Extract client info
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const line = lines[i];
    if (line.includes('Name') && !client.name) {
      const match = line.match(/Name\s+([A-Z][A-Z\s]+)/i);
      if (match) client.name = match[1].trim().split(/\s{2,}/)[0];
    }
    if ((line.includes('Address')) && !client.state) {
      const stateMatch = line.match(/,\s*([A-Z]{2})\s+\d{5}/);
      if (stateMatch) client.state = stateMatch[1];
    }
    if (line.toLowerCase().includes('fraud')) client.idTheft = true;
  }

  // Parse accounts
  const tradelines = [];
  const collections = [];
  let accountId = 1;

  const sections = text.split(/(?=\n\s*Account\s*#\s+)/i);
  
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const prevSection = sections[i - 1];
    
    // Get creditor name
    const prevLines = prevSection.split('\n').filter(l => l.trim());
    let creditorName = '';
    for (let j = prevLines.length - 1; j >= 0; j--) {
      const line = prevLines[j].trim();
      if (line && !line.match(/Page \d+|http|Transunion|Experian|Equifax|Days Late/i)) {
        creditorName = line.split(/\s{3,}/)[0].trim();
        break;
      }
    }

    const isCollection = section.toLowerCase().includes('collection') || 
                         creditorName.match(/LVNV|MIDLAND|PORTFOLIO|CAVALRY|IC SYSTEM|ERC|RECEIVABLE/i);

    // Parse TU, EX, EQ data from columns
    const bureauData = { TU: {}, EX: {}, EQ: {} };
    const fieldPatterns = [
      { field: 'accountNumber', regex: /Account\s*#\s+([\d\*]+)\s+(?:--|(\S+))?\s+(?:--|(\S+))?/i },
      { field: 'openDate', regex: /Date\s*Opened[:\s]+([\d\/]+)\s+(?:--|([\d\/]+))?\s+(?:--|([\d\/]+))?/i },
      { field: 'dateOfLastActivity', regex: /Date\s*of\s*Last\s*Activity[:\s]+([\d\/]+)\s+(?:--|([\d\/]+))?\s+(?:--|([\d\/]+))?/i },
      { field: 'lastPaymentDate', regex: /Last\s*Payment[:\s]+([\d\/]+)\s+(?:--|([\d\/]+))?\s+(?:--|([\d\/]+))?/i },
      { field: 'currentBalance', regex: /Balance\s*Owed[:\s]+\$?([\d,]+)\s+(?:--|\$?([\d,]+))?\s+(?:--|\$?([\d,]+))?/i },
      { field: 'creditLimit', regex: /Credit\s*Limit[:\s]+\$?([\d,]+)\s+(?:--|\$?([\d,]+))?\s+(?:--|\$?([\d,]+))?/i },
      { field: 'status', regex: /Account\s*Status[:\s]+(\S+(?:\s+\S+)?)\s+(?:--|(\S+(?:\s+\S+)?))?\s+(?:--|(\S+(?:\s+\S+)?))?/i },
    ];

    for (const line of section.split('\n')) {
      for (const { field, regex } of fieldPatterns) {
        const match = line.match(regex);
        if (match) {
          if (match[1] && match[1] !== '--') bureauData.TU[field] = match[1].trim();
          if (match[2] && match[2] !== '--') bureauData.EX[field] = match[2].trim();
          if (match[3] && match[3] !== '--') bureauData.EQ[field] = match[3].trim();
        }
      }
    }

    // Create entries for each bureau with data
    ['TU', 'EX', 'EQ'].forEach(bureau => {
      const data = bureauData[bureau];
      if (data.accountNumber || data.currentBalance || data.openDate) {
        const account = {
          id: `${isCollection ? 'c' : 't'}${accountId++}`,
          creditorName,
          accountNumberPartial: (data.accountNumber || '').replace(/\*/g, '').slice(-4),
          bureau,
          status: data.status || '',
          openDate: parseDate(data.openDate),
          dateOfFirstDelinquency: '',
          dateOfLastActivity: parseDate(data.dateOfLastActivity),
          lastPaymentDate: parseDate(data.lastPaymentDate),
          creditLimit: parseNumber(data.creditLimit),
          currentBalance: parseNumber(data.currentBalance),
          isCollection,
        };

        if (isCollection) {
          account.collectorName = creditorName;
          account.originalCreditor = '';
          account.isMedical = creditorName.toLowerCase().includes('medical');
          collections.push(account);
        } else {
          tradelines.push(account);
        }
      }
    });
  }

  return { client, tradelines, collections, inquiries: [] };
}

function parseDate(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  const match2 = dateStr.match(/(\d{1,2})\/(\d{4})/);
  if (match2) return `${match2[2]}-${match2[1].padStart(2, '0')}-01`;
  return '';
}

function parseNumber(numStr) {
  if (!numStr) return null;
  const num = parseInt(numStr.replace(/[$,\s]/g, ''), 10);
  return isNaN(num) ? null : num;
}

// Detection Engine
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

  // Group tradelines
  const groups = {};
  tradelines.forEach(t => {
    const key = normalizeCreditor(t.creditorName) + '_' + (t.accountNumberPartial || '').slice(-4);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  // Analyze tradelines
  Object.entries(groups).forEach(([key, items]) => {
    if (items.length < 2) return;
    const itemName = items[0].creditorName + ' (...' + (items[0].accountNumberPartial || '').slice(-4) + ')';

    // Open Date Mismatch
    const openDates = items.filter(i => i.openDate).map(i => ({ bureau: i.bureau, date: i.openDate }));
    if (openDates.length >= 2) {
      for (let i = 0; i < openDates.length; i++) {
        for (let j = i + 1; j < openDates.length; j++) {
          const diff = daysDiff(openDates[i].date, openDates[j].date);
          if (diff && diff > 30) {
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
          if (diff && diff > 30) {
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
          action: 'Dispute for correction of credit limit (affects utilization)',
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

  return findings;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Read file content
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // For now, we'll extract text using a simple approach
    // In production, you'd use pdf-parse or similar
    const text = buffer.toString('utf8');
    
    // Parse the credit report
    const data = parseCreditReportText(text);
    
    // Run detection engine
    const findings = runDetectionEngine(data);

    // Generate audit ID
    const auditId = uuidv4();

    // Store results (in production, use a database)
    const auditDir = path.join(process.cwd(), 'tmp', 'audits', auditId);
    if (!existsSync(path.join(process.cwd(), 'tmp', 'audits'))) {
      await mkdir(path.join(process.cwd(), 'tmp', 'audits'), { recursive: true });
    }
    await mkdir(auditDir, { recursive: true });
    
    const auditData = {
      auditId,
      client: data.client,
      findings,
      tradelines: data.tradelines,
      collections: data.collections,
      createdAt: new Date().toISOString(),
    };

    await writeFile(
      path.join(auditDir, 'audit.json'),
      JSON.stringify(auditData, null, 2)
    );

    return NextResponse.json({
      auditId,
      client: data.client,
      findings,
      summary: {
        total: findings.length,
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
      }
    });

  } catch (error) {
    console.error('Audit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
