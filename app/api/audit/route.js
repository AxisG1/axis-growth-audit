import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
  var lines = text.split(/\n/);
  var currentCreditor = '';
  var currentData = {};
  var bureauColumns = detectBureauColumns(text);

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    
    // Detect creditor name lines
    if (isCreditorLine(line)) {
      if (currentCreditor && Object.keys(currentData).length > 0) {
        var account = createAccountFromData(currentCreditor, currentData, bureauColumns);
        if (account) {
          if (account.type === 'collection') {
            collections.push(account);
          } else {
            tradelines.push(account);
          }
        }
      }
      currentCreditor = line.trim();
      currentData = {};
    } else {
      extractMultiColumnValues(line, currentData, bureauColumns);
    }
  }

  if (currentCreditor && Object.keys(currentData).length > 0) {
    var account = createAccountFromData(currentCreditor, currentData, bureauColumns);
    if (account) {
      if (account.type === 'collection') {
        collections.push(account);
      } else {
        tradelines.push(account);
      }
    }
  }

  return { client, tradelines, collections };
}

function simpleAccountExtraction(text) {
  var lines = text.split('\n');
  var accounts = [];
  var currentAccount = null;
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    if (line.match(/account|credit card|loan|mortgage/i)) {
      if (currentAccount) accounts.push(currentAccount);
      currentAccount = { name: line, bureaus: {} };
    } else if (currentAccount && line.match(/transunion|equifax|experian/i)) {
      var bureau = line.match(/(transunion|equifax|experian)/i)[1].toLowerCase();
      currentAccount.bureaus[bureau] = { dateOpened: parseDate(line), lastActivityDate: parseDate(line) };
    }
  }
  
  if (currentAccount) accounts.push(currentAccount);
  return accounts;
}

function parseDate(str) {
  var dateMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  return dateMatch ? dateMatch[0] : null;
}

function parseAmount(str) {
  var amountMatch = str.match(/\$?([\d,]+)/);
  return amountMatch ? amountMatch[1].replace(/,/g, '') : null;
}

// Run detection engine
function runDetectionEngine(data) {
  const issues = [];

  // Process each tradeline
  data.tradelines.forEach(account => {
    const daysDiff = (date1, date2) => {
      if (!date1 || !date2) return 0;
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      return Math.abs(Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
    };

    const normalizeCreditor = (name) => {
      return (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    };

    // Check date mismatches between bureaus
    const bureaus = ['transunion', 'equifax', 'experian'];
    
    // Open date mismatch check
    for (let i = 0; i < bureaus.length; i++) {
      for (let j = i + 1; j < bureaus.length; j++) {
        const bureau1 = bureaus[i];
        const bureau2 = bureaus[j];
        
        const date1 = account.bureaus?.[bureau1]?.dateOpened;
        const date2 = account.bureaus?.[bureau2]?.dateOpened;
        
        if (date1 && date2 && daysDiff(date1, date2) > 30) {
          issues.push({
            id: generateId(),
            type: 'DATE_MISMATCH_OPEN',
            ...ISSUE_TYPES.DATE_MISMATCH_OPEN,
            account: account.name,
            bureau1,
            bureau2,
            date1,
            date2,
            description: `Open date differs by ${daysDiff(date1, date2)} days between ${bureau1} and ${bureau2}`
          });
        }
      }
    }

    // Last activity date mismatch
    for (let i = 0; i < bureaus.length; i++) {
      for (let j = i + 1; j < bureaus.length; j++) {
        const bureau1 = bureaus[i];
        const bureau2 = bureaus[j];
        
        const dla1 = account.bureaus?.[bureau1]?.lastActivityDate;
        const dla2 = account.bureaus?.[bureau2]?.lastActivityDate;
        
        if (dla1 && dla2 && daysDiff(dla1, dla2) > 30) {
          issues.push({
            id: generateId(),
            type: 'DATE_MISMATCH_DLA',
            ...ISSUE_TYPES.DATE_MISMATCH_DLA,
            account: account.name,
            bureau1,
            bureau2,
            date1: dla1,
            date2: dla2,
            description: `Last activity date differs by ${daysDiff(dla1, dla2)} days between ${bureau1} and ${bureau2}`
          });
        }
      }
    }

    // Status mismatch
    for (let i = 0; i < bureaus.length; i++) {
      for (let j = i + 1; j < bureaus.length; j++) {
        const bureau1 = bureaus[i];
        const bureau2 = bureaus[j];
        
        const status1 = account.bureaus?.[bureau1]?.status;
        const status2 = account.bureaus?.[bureau2]?.status;
        
        if (status1 && status2 && status1 !== status2) {
          issues.push({
            id: generateId(),
            type: 'STATUS_MISMATCH',
            ...ISSUE_TYPES.STATUS_MISMATCH,
            account: account.name,
            bureau1,
            bureau2,
            status1,
            status2,
            description: `Account status differs: ${status1} vs ${status2}`
          });
        }
      }
    }

    // Credit limit mismatch
    for (let i = 0; i < bureaus.length; i++) {
      for (let j = i + 1; j < bureaus.length; j++) {
        const bureau1 = bureaus[i];
        const bureau2 = bureaus[j];
        
        const limit1 = account.bureaus?.[bureau1]?.creditLimit;
        const limit2 = account.bureaus?.[bureau2]?.creditLimit;
        
        if (limit1 && limit2 && Math.abs(limit1 - limit2) > 0) {
          issues.push({
            id: generateId(),
            type: 'LIMIT_MISMATCH',
            ...ISSUE_TYPES.LIMIT_MISMATCH,
            account: account.name,
            bureau1,
            bureau2,
            limit1,
            limit2,
            description: `Credit limit differs: $${limit1} vs $${limit2}`
          });
        }
      }
    }
  });

  // Check collection accounts
  data.collections.forEach(account => {
    bureaus = ['transunion', 'equifax', 'experian'];
    bureaus.forEach(bureau => {
      const bureauData = account.bureaus?.[bureau];
      if (bureauData) {
        // Missing original creditor
        if (!bureauData.originalCreditor || bureauData.originalCreditor.trim() === '') {
          issues.push({
            id: generateId(),
            type: 'MISSING_OC',
            ...ISSUE_TYPES.MISSING_OC,
            account: account.name,
            bureau,
            description: `Missing original creditor on ${bureau}`
          });
        }

        // Missing DOFD
        if (!bureauData.dofd) {
          issues.push({
            id: generateId(),
            type: 'MISSING_DOFD',
            ...ISSUE_TYPES.MISSING_DOFD,
            account: account.name,
            bureau,
            description: `Missing date of first delinquency on ${bureau}`
          });
        }
      }
    });
  });

  return issues;
}

function extractClientName(text) {
  return 'Client Name';
}

function extractState(text) {
  return 'State';
}

function isCreditorLine(line) {
  return false;
}

function detectBureauColumns(text) {
  return {};
}

function extractMultiColumnValues(line, data, columns) {
  // Extract values
}

function createAccountFromData(creditor, data, columns) {
  return null;
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'Missing file upload. Expected form field name: "file".' },
        { status: 400 }
      );
    }

    // Convert uploaded File -> Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Safer pdf-parse import in Next server context
    const pdfParse = (await import('pdf-parse/lib/pdf-parse')).default;
    const pdfData = await pdfParse(buffer);
    const text = (pdfData?.text || '').trim();

    // TEMP DEBUG: This tells you instantly if extraction is failing
    const debug = {
      pdfByteLength: buffer.length,
      textLength: text.length,
      numpages: pdfData?.numpages,
      first400: text.slice(0, 400),
    };

    // Fail hard instead of returning empty findings
    if (text.length < 300) {
      return NextResponse.json(
        {
          error: 'No readable text extracted from PDF. Likely image-based PDF or pdf-parse failed in this runtime.',
          debug,
        },
        { status: 422 }
      );
    }

    // Your existing pipeline
    const data = parseCreditReport(text);
    const findings = runDetectionEngine(data);

    console.log('[PDF Debug]', debug);
    return NextResponse.json(findings);  } catch (err) {
    return NextResponse.json(
      {
        error: 'Audit route failed',
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
