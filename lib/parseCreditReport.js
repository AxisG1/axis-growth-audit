/**
 * AXIS GROWTH - Credit Report PDF Parser
 * Automatically extracts tradelines, collections, and inquiries from 3-bureau reports
 */

const fs = require('fs');
const { execSync } = require('child_process');

// Bureau name mappings
const BUREAU_MAP = {
  'transunion': 'TU',
  'experian': 'EX', 
  'equifax': 'EQ',
  'tu': 'TU',
  'ex': 'EX',
  'eq': 'EQ'
};

/**
 * Parse a credit report PDF and extract structured data
 */
function parseCreditReportPDF(pdfPath) {
  console.log(`\n📄 Parsing credit report: ${pdfPath}`);
  
  // Extract text from PDF
  const textPath = '/tmp/credit_report_text.txt';
  try {
    execSync(`pdftotext -layout "${pdfPath}" "${textPath}"`, { encoding: 'utf8' });
  } catch (err) {
    throw new Error(`Failed to extract PDF text: ${err.message}`);
  }
  
  const content = fs.readFileSync(textPath, 'utf8');
  const lines = content.split('\n');
  
  console.log(`   Extracted ${lines.length} lines of text`);
  
  // Initialize data structures
  const result = {
    client: {
      name: '',
      state: '',
      goal: 'general',
      timeline: 12,
      idTheft: false
    },
    tradelines: [],
    collections: [],
    inquiries: [],
    rawAccountCount: 0
  };
  
  // Extract client info
  result.client = extractClientInfo(lines);
  
  // Parse accounts section by section
  const accounts = parseAccounts(content);
  
  // Separate into tradelines and collections
  accounts.forEach(account => {
    if (account.isCollection) {
      result.collections.push(account);
    } else {
      result.tradelines.push(account);
    }
  });
  
  // Parse inquiries
  result.inquiries = parseInquiries(content);
  
  result.rawAccountCount = accounts.length;
  
  console.log(`   Found: ${result.tradelines.length} tradelines, ${result.collections.length} collections, ${result.inquiries.length} inquiries`);
  
  return result;
}

/**
 * Extract client information from report header
 */
function extractClientInfo(lines) {
  const client = {
    name: '',
    state: '',
    goal: 'general',
    timeline: 12,
    idTheft: false
  };
  
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const line = lines[i];
    
    // Look for name
    if (line.includes('Name') && !client.name) {
      const match = line.match(/Name\s+([A-Z][A-Z\s]+)/i);
      if (match) {
        client.name = match[1].trim().split(/\s{2,}/)[0];
      }
    }
    
    // Look for address to get state
    if ((line.includes('Current Address') || line.includes('Address')) && !client.state) {
      // State is usually on same or next line
      const stateMatch = line.match(/,\s*([A-Z]{2})\s+\d{5}/);
      if (stateMatch) {
        client.state = stateMatch[1];
      } else if (i + 1 < lines.length) {
        const nextMatch = lines[i + 1].match(/,\s*([A-Z]{2})\s+\d{5}/);
        if (nextMatch) {
          client.state = nextMatch[1];
        }
      }
    }
    
    // Check for fraud alert
    if (line.toLowerCase().includes('fraud') || line.toLowerCase().includes('identity theft')) {
      client.idTheft = true;
    }
  }
  
  return client;
}

/**
 * Parse all accounts from the report
 */
function parseAccounts(content) {
  const accounts = [];
  let accountId = 1;
  
  // Split content into account blocks
  // Accounts typically start with creditor name and have "Account #" field
  const accountPattern = /([A-Z][A-Z0-9\/\s\-]+)\n\s*\n\s*Transunion[®]?\s+Experian[®]?\s+Equifax[®]?\s*\n\s*Account\s*#/gi;
  
  // Alternative: split by "Account #" lines
  const sections = content.split(/(?=\n\s*Account\s*#\s+)/i);
  
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const prevSection = sections[i - 1];
    
    // Get creditor name from previous section (last non-empty line before Account #)
    const prevLines = prevSection.split('\n').filter(l => l.trim());
    let creditorName = '';
    for (let j = prevLines.length - 1; j >= 0; j--) {
      const line = prevLines[j].trim();
      if (line && !line.match(/Page \d+|http|Transunion|Experian|Equifax|Days Late/i)) {
        creditorName = line.split(/\s{3,}/)[0].trim();
        break;
      }
    }
    
    // Parse the three-column data
    const tuData = { bureau: 'TU' };
    const exData = { bureau: 'EX' };
    const eqData = { bureau: 'EQ' };
    
    const fieldLines = section.split('\n');
    
    for (const line of fieldLines) {
      // Parse field: value patterns across columns
      const patterns = [
        { field: 'accountNumber', regex: /Account\s*#\s+([\d\*]+)\s+(?:--|(\S+))?\s+(?:--|(\S+))?/i },
        { field: 'highBalance', regex: /High\s*Balance[:\s]+\$?([\d,]+)\s+(?:--|\$?([\d,]+))?\s+(?:--|\$?([\d,]+))?/i },
        { field: 'currentBalance', regex: /Balance\s*Owed[:\s]+\$?([\d,]+)\s+(?:--|\$?([\d,]+))?\s+(?:--|\$?([\d,]+))?/i },
        { field: 'creditLimit', regex: /Credit\s*Limit[:\s]+\$?([\d,]+)\s+(?:--|\$?([\d,]+))?\s+(?:--|\$?([\d,]+))?/i },
        { field: 'openDate', regex: /Date\s*Opened[:\s]+([\d\/]+)\s+(?:--|([\d\/]+))?\s+(?:--|([\d\/]+))?/i },
        { field: 'dateOfLastActivity', regex: /Date\s*of\s*Last\s*Activity[:\s]+([\d\/]+)\s+(?:--|([\d\/]+))?\s+(?:--|([\d\/]+))?/i },
        { field: 'lastPaymentDate', regex: /Last\s*Payment[:\s]+([\d\/]+)\s+(?:--|([\d\/]+))?\s+(?:--|([\d\/]+))?/i },
        { field: 'status', regex: /Account\s*Status[:\s]+(\S+(?:\s+\S+)?)\s+(?:--|(\S+(?:\s+\S+)?))?\s+(?:--|(\S+(?:\s+\S+)?))?/i },
        { field: 'paymentStatus', regex: /Payment\s*Status[:\s]+(.+?)\s{2,}(?:--|(.+?))?\s{2,}(?:--|(.+?))?$/i },
        { field: 'accountType', regex: /Account\s*Type[:\s]+(.+?)\s{2,}(?:--|(.+?))?\s{2,}(?:--|(.+?))?$/i },
        { field: 'pastDue', regex: /Past\s*Due\s*Amount[:\s]+\$?([\d,]+)\s+(?:--|\$?([\d,]+))?\s+(?:--|\$?([\d,]+))?/i },
      ];
      
      for (const { field, regex } of patterns) {
        const match = line.match(regex);
        if (match) {
          if (match[1] && match[1] !== '--') tuData[field] = cleanValue(match[1], field);
          if (match[2] && match[2] !== '--') exData[field] = cleanValue(match[2], field);
          if (match[3] && match[3] !== '--') eqData[field] = cleanValue(match[3], field);
        }
      }
    }
    
    // Check if this is a collection
    const isCollection = section.toLowerCase().includes('collection') || 
                         creditorName.toLowerCase().includes('collection') ||
                         creditorName.match(/LVNV|MIDLAND|PORTFOLIO|CAVALRY|IC SYSTEM|ERC|RECEIVABLE/i);
    
    // Create account entries for each bureau that has data
    [tuData, exData, eqData].forEach(data => {
      if (data.accountNumber || data.currentBalance || data.openDate) {
        const account = {
          id: `${isCollection ? 'c' : 't'}${accountId++}`,
          creditorName: creditorName,
          accountNumberPartial: (data.accountNumber || '').replace(/\*/g, '').slice(-4),
          bureau: data.bureau,
          accountType: data.accountType || '',
          status: combineStatus(data.status, data.paymentStatus),
          openDate: parseDate(data.openDate),
          dateOfFirstDelinquency: '',
          dateOfLastActivity: parseDate(data.dateOfLastActivity),
          lastPaymentDate: parseDate(data.lastPaymentDate),
          creditLimit: parseNumber(data.creditLimit),
          currentBalance: parseNumber(data.currentBalance) || parseNumber(data.pastDue),
          isCollection: isCollection
        };
        
        if (isCollection) {
          account.collectorName = creditorName;
          account.originalCreditor = ''; // Will need to extract this
          account.isMedical = creditorName.toLowerCase().includes('medical') || 
                             creditorName.toLowerCase().includes('health');
        }
        
        accounts.push(account);
      }
    });
  }
  
  return accounts;
}

/**
 * Parse inquiries section
 */
function parseInquiries(content) {
  const inquiries = [];
  let inquiryId = 1;
  
  // Find inquiries section
  const inquirySection = content.match(/Inquiries.*?(?=Public Records|$)/is);
  if (!inquirySection) return inquiries;
  
  const lines = inquirySection[0].split('\n');
  
  for (const line of lines) {
    // Pattern: Creditor Name    Date    Bureau
    const match = line.match(/([A-Z][A-Z0-9\s\/\-]+)\s+([\d\/]+)\s+(TransUnion|Experian|Equifax)/i);
    if (match) {
      inquiries.push({
        id: `inq${inquiryId++}`,
        creditorName: match[1].trim(),
        inquiryDate: parseDate(match[2]),
        bureau: BUREAU_MAP[match[3].toLowerCase()] || match[3],
        inquiryType: 'hard'
      });
    }
  }
  
  return inquiries;
}

// Helper functions
function cleanValue(val, field) {
  if (!val) return '';
  return val.trim().replace(/\s+/g, ' ');
}

function parseDate(dateStr) {
  if (!dateStr) return '';
  // Handle various formats: MM/DD/YYYY, M/D/YYYY, MM/YYYY, etc.
  const cleaned = dateStr.replace(/\s+/g, '');
  
  // Try MM/DD/YYYY or M/D/YYYY
  let match = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  
  // Try MM/YYYY
  match = cleaned.match(/(\d{1,2})\/(\d{4})/);
  if (match) {
    return `${match[2]}-${match[1].padStart(2, '0')}-01`;
  }
  
  return '';
}

function parseNumber(numStr) {
  if (!numStr) return null;
  const cleaned = numStr.replace(/[$,\s]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

function combineStatus(status, paymentStatus) {
  const parts = [];
  if (status) parts.push(status);
  if (paymentStatus && paymentStatus !== status) parts.push(paymentStatus);
  return parts.join(' - ') || '';
}

// Export for use as module
module.exports = { parseCreditReportPDF };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: node parseCreditReport.js <pdf_path> [output_json_path]');
    process.exit(1);
  }
  
  const pdfPath = args[0];
  const outputPath = args[1] || pdfPath.replace('.pdf', '_parsed.json');
  
  try {
    const data = parseCreditReportPDF(pdfPath);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`\n✅ Parsed data saved to: ${outputPath}`);
    console.log(`\nClient: ${data.client.name} (${data.client.state})`);
    console.log(`Tradelines: ${data.tradelines.length}`);
    console.log(`Collections: ${data.collections.length}`);
    console.log(`Inquiries: ${data.inquiries.length}`);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}
