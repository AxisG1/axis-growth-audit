// ============================================================================
// AXIS GROWTH - Credit Report Parser (CORRECTED VERSION)
// Compatible with runFullAudit.js detection engine
// ============================================================================

const fs = require('fs');
const pdfParse = require('pdf-parse');

/**
 * Main PDF parsing function
 */
async function parseCreditReportPDF(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdfParse(dataBuffer);
  const rawText = pdfData.text;
  
  console.log(`✓ Extracted ${rawText.length} characters from PDF`);
  return parseCreditReportText(rawText);
}

/**
 * Parse raw text - returns structure matching detection engine expectations
 */
function parseCreditReportText(rawText) {
  const tradelines = [];
  const collections = [];
  const inquiries = [];
  
  // Extract client info
  const clientMatch = rawText.match(/Name[:\s]+([A-Z\s]+)/i);
  const stateMatch = rawText.match(/State[:\s]+([A-Z]{2})/i);
  
  const client = {
    name: clientMatch ? clientMatch[1].trim() : 'Unknown Client',
    state: stateMatch ? stateMatch[1] : 'XX'
  };
  
  const lines = rawText.split('\n').map(l => l.trim());
  let currentAccount = null;
  let currentBureau = 'EX'; // default
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect bureau
    if (/EXPERIAN|EQUIFAX|TRANSUNION|TU|EX|EQ/i.test(line)) {
      if (/EXPERIAN|EX/i.test(line)) currentBureau = 'EX';
      if (/EQUIFAX|EQ/i.test(line)) currentBureau = 'EQ';
      if (/TRANSUNION|TU/i.test(line)) currentBureau = 'TU';
    }
    
    // Detect new account
    if (/Account|Creditor/i.test(line) && /Name|Number/i.test(line)) {
      if (currentAccount && currentAccount.creditorName) {
        if (/Collection|Debt/i.test(currentAccount.status) || /Collection|Debt/i.test(currentAccount.creditorName)) {
          collections.push(currentAccount);
        } else {
          tradelines.push(currentAccount);
        }
      }
      
      currentAccount = {
        bureau: currentBureau,
        creditorName: '',
        accountNumberPartial: '',
        accountType: '',
        openDate: null,
        currentBalance: 0,
        creditLimit: null,
        status: '',
        dateOfLastActivity: null,
        lastPaymentDate: null,
        dateOfFirstDelinquency: null,
        originalCreditor: '',
        collectorName: ''
      };
    }
    
    if (currentAccount) {
      // Extract creditor name
      const credMatch = line.match(/(?:Creditor|Company)(?:\s+Name)?[:\s]+(.+)/i);
      if (credMatch && credMatch[1] && !currentAccount.creditorName) {
        currentAccount.creditorName = credMatch[1].trim();
      }
      
      // Account number
      const acctMatch = line.match(/Account[\s#]*[:\s]*([\dX\*]+)/i);
      if (acctMatch && acctMatch[1]) {
        currentAccount.accountNumberPartial = acctMatch[1].replace(/[X\*]/g, '').slice(-4);
      }
      
      // Open Date
      if (/Opened|Open\s+Date/i.test(line)) {
        const dateMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        if (dateMatch) currentAccount.openDate = dateMatch[1];
      }
      
      // Balance
      if (/Balance|Amount/i.test(line) && !/High|Original/i.test(line)) {
        const balMatch = line.match(/\$?([\d,]+)/);
        if (balMatch) {
          currentAccount.currentBalance = parseInt(balMatch[1].replace(/,/g, ''));
        }
      }
      
      // Credit Limit
      if (/Limit|High\s+Balance/i.test(line)) {
        const limMatch = line.match(/\$?([\d,]+)/);
        if (limMatch) {
          currentAccount.creditLimit = parseInt(limMatch[1].replace(/,/g, ''));
        }
      }
      
      // Status
      if (/Status/i.test(line)) {
        const statMatch = line.match(/Status[:\s]+(.+)/i);
        if (statMatch) currentAccount.status = statMatch[1].trim();
      }
      
      // Date of Last Activity
      if (/Last\s+Activity|DLA/i.test(line)) {
        const dlaMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        if (dlaMatch) currentAccount.dateOfLastActivity = dlaMatch[1];
      }
      
      // Last Payment Date
      if (/Last\s+Payment/i.test(line)) {
        const payMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        if (payMatch) currentAccount.lastPaymentDate = payMatch[1];
      }
      
      // Date of First Delinquency
      if (/First\s+Delinq|DOFD/i.test(line)) {
        const dofdMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        if (dofdMatch) currentAccount.dateOfFirstDelinquency = dofdMatch[1];
      }
      
      // Original Creditor
      if (/Original\s+Creditor/i.test(line)) {
        const ocMatch = line.match(/Original\s+Creditor[:\s]+(.+)/i);
        if (ocMatch) currentAccount.originalCreditor = ocMatch[1].trim();
      }
    }
    
    // Detect inquiries
    if (/Inquiry|Inquirer/i.test(line)) {
      const inqMatch = line.match(/(?:Inquiry|Inquirer)[:\s]+(.+)/i);
      if (inqMatch) {
        inquiries.push({
          bureau: currentBureau,
          creditorName: inqMatch[1].trim(),
          inquiryDate: null,
          inquiryType: 'hard'
        });
      }
    }
  }
  
  // Push last account
  if (currentAccount && currentAccount.creditorName) {
    if (/Collection|Debt/i.test(currentAccount.status)) {
      collections.push(currentAccount);
    } else {
      tradelines.push(currentAccount);
    }
  }
  
  console.log(`✓ Parsed: ${tradelines.length} tradelines, ${collections.length} collections, ${inquiries.length} inquiries`);
  
  return {
    client,
    tradelines,
    collections,
    inquiries
  };
}

module.exports = {
  parseCreditReportPDF,
  parseCreditReportText
};