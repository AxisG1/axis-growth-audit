// ============================================================================
// AXIS GROWTH - Credit Report PDF Parser
// Automatically extracts tradelines, collections, and inquiries from 3-bureau reports
// ============================================================================

/**
 * Parses raw credit report text extracted from PDF
 * Extracts tradelines and public records for audit engine
 * Designed for SmartCredit, IdentityIQ, Credit Karma style multi-bureau reports
 */
export function parseCreditReport(rawText) {
  const accounts = [];
  const publicRecords = [];
  const inquiries = [];

  const lines = rawText.split('\n').map(line => line.trim());
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ===== Account Detection (Tradeline Headers) =====
    if (/^(Experian|TransUnion|Equifax)\s+Account/i.test(line)) {
      if (current) accounts.push(current);
      current = {
        bureau: line.match(/(Experian|TransUnion|Equifax)/i)[0],
        creditor: '',
        accountNumber: '',
        dateOpened: '',
        balance: '',
        status: '',
        paymentHistory: '',
        comments: '',
        raw: []
      };
    }

    if (current) {
      current.raw.push(line);

      // Extract key fields
      if (/Creditor Name:/i.test(line)) {
        current.creditor = line.replace('Creditor Name:', '').trim();
      }
      if (/Account Number:/i.test(line)) {
        current.accountNumber = line.replace('Account Number:', '').trim();
      }
      if (/Date Opened:/i.test(line)) {
        current.dateOpened = line.replace('Date Opened:', '').trim();
      }
      if (/Balance:/i.test(line)) {
        current.balance = line.replace('Balance:', '').replace('$', '').replace(/,/g, '').trim();
      }
      if (/Account Status:/i.test(line)) {
        current.status = line.replace('Account Status:', '').trim();
      }
      if (/Payment History:/i.test(line)) {
        current.paymentHistory += ' ' + line.replace('Payment History:', '').trim();
      }
      if (/Comments:/i.test(line)) {
        current.comments += ' ' + line.replace('Comments:', '').trim();
      }

      // Detect end of account block
      if (/^\*\*\*/.test(line) && current) {
        accounts.push(current);
        current = null;
      }
    }

    // ===== Public Record Section =====
    if (/Public Record:/i.test(line)) {
      const record = {
        type: '',
        court: '',
        caseNumber: '',
        dateFiled: '',
        amount: '',
        status: '',
        raw: []
      };
      while (i < lines.length && !/^\*\*\*/.test(lines[i])) {
        const l = lines[i].trim();
        record.raw.push(l);
        if (/Type:/i.test(l)) record.type = l.replace('Type:', '').trim();
        if (/Court:/i.test(l)) record.court = l.replace('Court:', '').trim();
        if (/Case Number:/i.test(l)) record.caseNumber = l.replace('Case Number:', '').trim();
        if (/Date Filed:/i.test(l)) record.dateFiled = l.replace('Date Filed:', '').trim();
        if (/Amount:/i.test(l)) record.amount = l.replace('Amount:', '').replace('$', '').replace(/,/g, '').trim();
        if (/Status:/i.test(l)) record.status = l.replace('Status:', '').trim();
        i++;
      }
      publicRecords.push(record);
    }

    // ===== Inquiry Section (optional) =====
    if (/Inquirer:/i.test(line)) {
      const inquiry = {
        inquirer: '',
        date: '',
        type: '',
        bureau: '',
        raw: []
      };
      while (i < lines.length && !/^\*\*\*/.test(lines[i])) {
        const l = lines[i].trim();
        inquiry.raw.push(l);
        if (/Inquirer:/i.test(l)) inquiry.inquirer = l.replace('Inquirer:', '').trim();
        if (/Date:/i.test(l)) inquiry.date = l.replace('Date:', '').trim();
        if (/Type:/i.test(l)) inquiry.type = l.replace('Type:', '').trim();
        i++;
      }
      inquiries.push(inquiry);
    }
  }

  // Final push if last account wasn't terminated properly
  if (current) accounts.push(current);

  return {
    meta: {
      totalCharacters: rawText.length,
      totalAccounts: accounts.length,
      totalPublicRecords: publicRecords.length,
      totalInquiries: inquiries.length
    },
    accounts,
    publicRecords,
    inquiries
  };
}
