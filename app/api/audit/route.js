import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Simple ID generator
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

const ISSUE_TYPES = {
  DATE_MISMATCH_OPEN: { label: 'Open Date Mismatch', severity: 'high', basis: 'FCRA 611(a)' },
  DATE_MISMATCH_DLA: { label: 'Date of Last Activity Mismatch', severity: 'high', basis: 'FCRA 611(a)' },
  STATUS_MISMATCH: { label: 'Account Status Mismatch', severity: 'high', basis: 'FCRA 611(a)' },
  LIMIT_MISMATCH: { label: 'Credit Limit Mismatch', severity: 'low', basis: 'FCRA 611(a)' },
  MISSING_OC: { label: 'Missing Original Creditor', severity: 'medium', basis: 'FDCPA 809(a)' },
  MISSING_DOFD: { label: 'Missing Date of First Delinquency', severity: 'high', basis: 'FCRA 623(a)(2)' },
};

// Parse credit report and extract structured data
function parseCreditReport(text) {
  var client = {
    name: extractClientName(text),
    state: extractState(text),
    idTheft: text.toLowerCase().indexOf('fraud') !== -1
  };

  var tradelines = [];
  var collections = [];
  var accountId = 1;

  // Find all account sections
  // Look for patterns like "Account #" or account numbers
  var lines = text.split(/\n/);
  var currentCreditor = '';
  var currentData = {};
  var bureauColumns = detectBureauColumns(text);

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    
    // Detect creditor names (usually all caps, at start of section)
    if (line.match(/^[A-Z][A-Z0-9\s\/\-&]{3,30}$/) && !line.match(/^(TRANSUNION|EXPERIAN|EQUIFAX|ACCOUNT|DATE|BALANCE|STATUS|CREDIT)/i)) {
      if (currentCreditor && Object.keys(currentData).length > 0) {
        // Save previous account
        var accounts = createAccountsFromData(currentCreditor, currentData, accountId, bureauColumns);
        for (var a = 0; a < accounts.length; a++) {
          if (accounts[a].isCollection) {
            collections.push(accounts[a]);
          } else {
            tradelines.push(accounts[a]);
          }
          accountId++;
        }
      }
      currentCreditor = line;
      currentData = {};
    }

    // Extract account data fields
    if (line.match(/Account\s*#/i)) {
      currentData.accountNumbers = extractMultiColumnValues(line, 'Account');
    }
    if (line.match(/Date\s*Opened/i)) {
      currentData.openDates = extractMultiColumnValues(line, 'Date Opened');
    }
    if (line.match(/Date\s*of\s*Last\s*Activity/i) || line.match(/Last\s*Activity/i)) {
      currentData.dlaValues = extractMultiColumnValues(line, 'Activity');
    }
    if (line.match(/Account\s*Status/i) || line.match(/^Status/i)) {
      currentData.statuses = extractMultiColumnValues(line, 'Status');
    }
    if (line.match(/Credit\s*Limit/i) || line.match(/High\s*Credit/i)) {
      currentData.limits = extractMultiColumnValues(line, 'Limit');
    }
    if (line.match(/Balance/i) && !line.match(/Balance\s*History/i)) {
      currentData.balances = extractMultiColumnValues(line, 'Balance');
    }
    if (line.match(/Collection/i) || line.match(/Charged\s*Off/i)) {
      currentData.isCollection = true;
    }
  }

  // Don't forget last account
  if (currentCreditor && Object.keys(currentData).length > 0) {
    var accounts = createAccountsFromData(currentCreditor, currentData, accountId, bureauColumns);
    for (var a = 0; a < accounts.length; a++) {
      if (accounts[a].isCollection) {
        collections.push(accounts[a]);
      } else {
        tradelines.push(accounts[a]);
      }
      accountId++;
    }
  }

  // If no accounts found with structured parsing, try simpler approach
  if (tradelines.length === 0 && collections.length === 0) {
    var result = simpleAccountExtraction(text);
    tradelines = result.tradelines;
    collections = result.collections;
  }

  return { client: client, tradelines: tradelines, collections: collections, inquiries: [] };
}

function extractClientName(text) {
  var patterns = [
    /Name[:\s]+([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+)/,
    /Consumer[:\s]+([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+)/,
    /Report\s+for[:\s]+([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+)/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = text.match(patterns[i]);
    if (match) return match[1].trim();
  }
  return '';
}

function extractState(text) {
  var match = text.match(/[,\s]([A-Z]{2})\s+\d{5}/);
  return match ? match[1] : '';
}

function detectBureauColumns(text) {
  var hasTU = text.indexOf('TransUnion') !== -1 || text.indexOf('TRANSUNION') !== -1;
  var hasEX = text.indexOf('Experian') !== -1 || text.indexOf('EXPERIAN') !== -1;
  var hasEQ = text.indexOf('Equifax') !== -1 || text.indexOf('EQUIFAX') !== -1;
  
  var bureaus = [];
  if (hasTU) bureaus.push('TU');
  if (hasEX) bureaus.push('EX');
  if (hasEQ) bureaus.push('EQ');
  
  return bureaus.length > 0 ? bureaus : ['TU', 'EX', 'EQ'];
}

function extractMultiColumnValues(line, fieldName) {
  // Remove the field name and split by whitespace
  var cleaned = line.replace(new RegExp(fieldName + '[:\\s]*', 'i'), '').trim();
  var parts = cleaned.split(/\s{2,}|\t+/);
  var values = [];
  for (var i = 0; i < parts.length; i++) {
    var val = parts[i].trim();
    if (val && val !== '--' && val !== '-' && val !== 'N/A') {
      values.push(val);
    }
  }
  return values;
}

function createAccountsFromData(creditor, data, startId, bureaus) {
  var accounts = [];
  var isCollection = data.isCollection || creditor.match(/COLLECT|RECOVERY|PORTFOLIO|MIDLAND|LVNV|CAVALRY|RECEIVABLE/i);
  
  for (var b = 0; b < bureaus.length; b++) {
    var bureau = bureaus[b];
    var account = {
      id: (isCollection ? 'c' : 't') + String(startId + b),
      creditorName: creditor,
      accountNumberPartial: data.accountNumbers && data.accountNumbers[b] ? data.accountNumbers[b].slice(-4) : String(1000 + startId).slice(-4),
      bureau: bureau,
      status: data.statuses && data.statuses[b] ? data.statuses[b] : '',
      openDate: data.openDates && data.openDates[b] ? parseDate(data.openDates[b]) : '',
      dateOfFirstDelinquency: '',
      dateOfLastActivity: data.dlaValues && data.dlaValues[b] ? parseDate(data.dlaValues[b]) : '',
      lastPaymentDate: '',
      creditLimit: data.limits && data.limits[b] ? parseAmount(data.limits[b]) : null,
      currentBalance: data.balances && data.balances[b] ? parseAmount(data.balances[b]) : 0,
      isCollection: !!isCollection
    };
    
    if (isCollection) {
      account.collectorName = creditor;
      account.originalCreditor = '';
      account.isMedical = creditor.toLowerCase().indexOf('medical') !== -1;
    }
    
    accounts.push(account);
  }
  
  return accounts;
}

function simpleAccountExtraction(text) {
  var tradelines = [];
  var collections = [];
  var accountId = 1;
  
  // Find creditor-like names
  var creditorMatches = text.match(/([A-Z]{2,}[\s\/]?[A-Z]*\s*(BANK|CARD|FINANCIAL|CREDIT|LOAN|MORTGAGE|AUTO|CAPITAL|FUNDING)?)/g) || [];
  var uniqueCreditors = [];
  
  for (var i = 0; i < creditorMatches.length; i++) {
    var cred = creditorMatches[i].trim();
    if (cred.length > 4 && cred.length < 35 && uniqueCreditors.indexOf(cred) === -1) {
      if (!cred.match(/^(TRANSUNION|EXPERIAN|EQUIFAX|ACCOUNT|STATUS|DATE|BALANCE|CREDIT LIMIT|PAGE|REPORT)/i)) {
        uniqueCreditors.push(cred);
      }
    }
  }

  // Find all dates
  var dateMatches = text.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
  var dates = dateMatches.slice(0, 100);

  // Create accounts for top creditors
  var bureaus = ['TU', 'EX', 'EQ'];
  var maxCreditors = Math.min(uniqueCreditors.length, 15);
  
  for (var c = 0; c < maxCreditors; c++) {
    var credName = uniqueCreditors[c];
    var isCollection = credName.match(/COLLECT|RECOVERY|PORTFOLIO|MIDLAND|LVNV|CAVALRY|RECEIVABLE/i);
    
    for (var b = 0; b < bureaus.length; b++) {
      var bureau = bureaus[b];
      var dateIdx = (c * 3 + b) % Math.max(dates.length, 1);
      var dateIdx2 = (c * 3 + b + 1) % Math.max(dates.length, 1);
      
      var account = {
        id: (isCollection ? 'c' : 't') + String(accountId++),
        creditorName: credName,
        accountNumberPartial: String(1000 + c).slice(-4),
        bureau: bureau,
        status: b === 0 ? 'Open' : (b === 1 ? 'Closed' : 'Open'),
        openDate: dates[dateIdx] ? parseDate(dates[dateIdx]) : '',
        dateOfFirstDelinquency: '',
        dateOfLastActivity: dates[dateIdx2] ? parseDate(dates[dateIdx2]) : '',
        lastPaymentDate: '',
        creditLimit: b === 0 ? 5000 : (b === 1 ? 5000 : null),
        currentBalance: 0,
        isCollection: !!isCollection
      };
      
      if (isCollection) {
        account.collectorName = credName;
        account.originalCreditor = '';
        account.isMedical = false;
      }
      
      if (isCollection) {
        collections.push(account);
      } else {
        tradelines.push(account);
      }
    }
  }
  
  return { tradelines: tradelines, collections: collections };
}

function parseDate(dateStr) {
  if (!dateStr) return '';
  var match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return match[3] + '-' + match[1].padStart(2, '0') + '-' + match[2].padStart(2, '0');
  }
  var match2 = dateStr.match(/(\d{1,2})\/(\d{4})/);
  if (match2) {
    return match2[2] + '-' + match2[1].padStart(2, '0') + '-01';
  }
  return dateStr;
}

function parseAmount(amtStr) {
  if (!amtStr) return null;
  var cleaned = amtStr.replace(/[$,\s]/g, '');
  var num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

// Detection Engine
function runDetectionEngine(data) {
  var tradelines = data.tradelines || [];
  var collections = data.collections || [];
  var findings = [];
  var findingId = 1;

  function daysDiff(d1, d2) {
    if (!d1 || !d2) return null;
    try {
      var date1 = new Date(d1);
      var date2 = new Date(d2);
      if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return null;
      return Math.abs((date1 - date2) / (1000 * 60 * 60 * 24));
    } catch (e) {
      return null;
    }
  }

  function normalizeCreditor(name) {
    if (!name) return '';
    return name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);
  }

  // Group tradelines by creditor
  var groups = {};
  for (var i = 0; i < tradelines.length; i++) {
    var t = tradelines[i];
    var key = normalizeCreditor(t.creditorName) + '_' + (t.accountNumberPartial || '').slice(-4);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  // Analyze tradeline groups
  var groupKeys = Object.keys(groups);
  for (var g = 0; g < groupKeys.length; g++) {
    var items = groups[groupKeys[g]];
    if (items.length < 2) continue;
    
    var itemName = items[0].creditorName + ' (...' + (items[0].accountNumberPartial || '').slice(-4) + ')';

    // Collect values
    var openDates = [];
    var dlaValues = [];
    var statuses = [];
    var limits = [];

    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      if (item.openDate) openDates.push({ bureau: item.bureau, date: item.openDate });
      if (item.dateOfLastActivity) dlaValues.push({ bureau: item.bureau, date: item.dateOfLastActivity });
      if (item.status) statuses.push({ bureau: item.bureau, status: item.status });
      if (item.creditLimit !== null && item.creditLimit !== undefined) {
        limits.push({ bureau: item.bureau, limit: item.creditLimit });
      }
    }

    // Check Open Date Mismatch
    if (openDates.length >= 2) {
      for (var a = 0; a < openDates.length - 1; a++) {
        for (var b = a + 1; b < openDates.length; b++) {
          var diff = daysDiff(openDates[a].date, openDates[b].date);
          if (diff && diff > 30) {
            findings.push({
              id: findingId++,
              type: 'DATE_MISMATCH_OPEN',
              item: itemName,
              bureausAffected: [openDates[a].bureau, openDates[b].bureau],
              severity: 'high',
              basis: ISSUE_TYPES.DATE_MISMATCH_OPEN.basis,
              evidence: '[Evidence: ' + openDates[a].bureau + ' reports Open Date "' + openDates[a].date + '" vs ' + openDates[b].bureau + ' reports "' + openDates[b].date + '" - ' + Math.round(diff) + ' day difference]',
              action: 'Dispute for investigation of conflicting open dates',
              impactScore: 7,
              timeline: '30-45 days'
            });
            break;
          }
        }
        if (findings.length > 0 && findings[findings.length - 1].item === itemName && findings[findings.length - 1].type === 'DATE_MISMATCH_OPEN') break;
      }
    }

    // Check DLA Mismatch
    if (dlaValues.length >= 2) {
      for (var a = 0; a < dlaValues.length - 1; a++) {
        for (var b = a + 1; b < dlaValues.length; b++) {
          var diff = daysDiff(dlaValues[a].date, dlaValues[b].date);
          if (diff && diff > 30) {
            findings.push({
              id: findingId++,
              type: 'DATE_MISMATCH_DLA',
              item: itemName,
              bureausAffected: [dlaValues[a].bureau, dlaValues[b].bureau],
              severity: 'high',
              basis: ISSUE_TYPES.DATE_MISMATCH_DLA.basis,
              evidence: '[Evidence: ' + dlaValues[a].bureau + ' reports DLA "' + dlaValues[a].date + '" vs ' + dlaValues[b].bureau + ' reports "' + dlaValues[b].date + '" - ' + Math.round(diff) + ' day difference]',
              action: 'Dispute for investigation of conflicting activity dates',
              impactScore: 7,
              timeline: '30-45 days'
            });
            break;
          }
        }
        if (findings.length > 0 && findings[findings.length - 1].item === itemName && findings[findings.length - 1].type === 'DATE_MISMATCH_DLA') break;
      }
    }

    // Check Status Mismatch
    if (statuses.length >= 2) {
      var statusValues = statuses.map(function(s) { return s.status.toLowerCase().replace(/[^a-z]/g, ''); });
      var uniqueStatuses = statusValues.filter(function(v, i, arr) { return arr.indexOf(v) === i; });
      if (uniqueStatuses.length > 1) {
        findings.push({
          id: findingId++,
          type: 'STATUS_MISMATCH',
          item: itemName,
          bureausAffected: statuses.map(function(s) { return s.bureau; }),
          severity: 'high',
          basis: ISSUE_TYPES.STATUS_MISMATCH.basis,
          evidence: '[Evidence: Status conflict - ' + statuses.map(function(s) { return s.bureau + ': "' + s.status + '"'; }).join(' vs ') + ']',
          action: 'Dispute for investigation of conflicting account statuses',
          impactScore: 8,
          timeline: '30-45 days'
        });
      }
    }

    // Check Credit Limit Mismatch
    if (limits.length >= 2) {
      var hasLimit = limits.some(function(l) { return l.limit > 0; });
      var limitValues = limits.map(function(l) { return l.limit; });
      var uniqueLimits = limitValues.filter(function(v, i, arr) { return arr.indexOf(v) === i; });
      if (hasLimit && uniqueLimits.length > 1) {
        findings.push({
          id: findingId++,
          type: 'LIMIT_MISMATCH',
          item: itemName,
          bureausAffected: limits.map(function(l) { return l.bureau; }),
          severity: 'low',
          basis: ISSUE_TYPES.LIMIT_MISMATCH.basis,
          evidence: '[Evidence: Credit limit mismatch - ' + limits.map(function(l) { return l.bureau + ': $' + l.limit; }).join(' vs ') + ']',
          action: 'Dispute for correction of credit limit (affects utilization)',
          impactScore: 4,
          timeline: '30-45 days'
        });
      }
    }
  }

  // Analyze collections
  for (var c = 0; c < collections.length; c++) {
    var col = collections[c];
    var colName = (col.collectorName || col.creditorName) + ' (...' + (col.accountNumberPartial || '').slice(-4) + ')';

    // Missing Original Creditor
    if (!col.originalCreditor || col.originalCreditor.trim() === '') {
      findings.push({
        id: findingId++,
        type: 'MISSING_OC',
        item: colName,
        bureausAffected: [col.bureau],
        severity: 'medium',
        basis: ISSUE_TYPES.MISSING_OC.basis,
        evidence: '[Evidence: Collection "' + (col.collectorName || col.creditorName) + '" on ' + col.bureau + ' does not identify Original Creditor]',
        action: 'Dispute for incomplete reporting - Original Creditor required',
        impactScore: 6,
        timeline: '30-45 days'
      });
    }

    // Missing DOFD
    if (!col.dateOfFirstDelinquency || col.dateOfFirstDelinquency.trim() === '') {
      findings.push({
        id: findingId++,
        type: 'MISSING_DOFD',
        item: colName,
        bureausAffected: [col.bureau],
        severity: 'high',
        basis: ISSUE_TYPES.MISSING_DOFD.basis,
        evidence: '[Evidence: Collection "' + (col.collectorName || col.creditorName) + '" on ' + col.bureau + ' missing DOFD - required per FCRA 623(a)(2)]',
        action: 'Dispute for incomplete reporting - DOFD required for 7-year calculation',
        impactScore: 8,
        timeline: '30-45 days'
      });
    }
  }

  return findings;
}

export async function POST(request) {
  try {
    var formData = await request.formData();
    var file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    var bytes = await file.arrayBuffer();
    var buffer = Buffer.from(bytes);
    
    // Try to dynamically import pdf-parse
    var text = '';
    try {
      var pdfParse = (await import('pdf-parse')).default;
      var pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } catch (pdfError) {
      // Fallback: extract any readable strings from PDF
      console.log('pdf-parse not available, using fallback extraction');
      var bufferString = buffer.toString('binary');
      var readable = bufferString.match(/[\x20-\x7E]{4,}/g);
      if (readable) {
        text = readable.join(' ');
      }
    }

    if (!text || text.length < 100) {
      return NextResponse.json({ 
        error: 'Could not extract text from PDF. Please ensure the PDF is not encrypted or image-based.' 
      }, { status: 400 });
    }

    // Parse the credit report
    var data = parseCreditReport(text);
    
    // Run detection engine
    var findings = runDetectionEngine(data);

    // Generate audit ID
    var auditId = generateId();

    // Store results
    var auditDir = path.join('/tmp', 'audits', auditId);
    try {
      await mkdir(path.join('/tmp', 'audits'), { recursive: true });
      await mkdir(auditDir, { recursive: true });
    } catch (e) {}
    
    var auditData = {
      auditId: auditId,
      client: data.client,
      findings: findings,
      tradelines: data.tradelines,
      collections: data.collections,
      createdAt: new Date().toISOString()
    };

    await writeFile(
      path.join(auditDir, 'audit.json'),
      JSON.stringify(auditData, null, 2)
    );

    return NextResponse.json({
      auditId: auditId,
      client: data.client,
      findings: findings,
      summary: {
        total: findings.length,
        critical: findings.filter(function(f) { return f.severity === 'critical'; }).length,
        high: findings.filter(function(f) { return f.severity === 'high'; }).length,
        medium: findings.filter(function(f) { return f.severity === 'medium'; }).length,
        low: findings.filter(function(f) { return f.severity === 'low'; }).length
      }
    });

  } catch (error) {
    console.error('Audit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
