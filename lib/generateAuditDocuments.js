/**
 * ============================================================================
 * AXIS GROWTH - CREDIT FORENSIC AUDIT DOCUMENT GENERATOR
 * ============================================================================
 * 
 * This module generates all client deliverables from audit findings:
 * 1. Executive Summary (1-page PDF)
 * 2. Detailed Audit Report (DOCX)
 * 3. Dispute Letters (per-bureau, per-finding)
 * 4. Action Plan with Timeline (DOCX)
 * 
 * Usage: node generateAuditDocuments.js <auditData.json> <outputDir>
 */

const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  PageNumber,
  PageBreak,
  LevelFormat,
} = require('docx');

// ============================================================================
// CONSTANTS
// ============================================================================
const COLORS = {
  primary: '1E40AF',      // Axis Growth Blue
  primaryDark: '1E3A8A',
  secondary: '6B7280',
  lightGray: 'F3F4F6',
  white: 'FFFFFF',
  black: '111827',
  critical: '7C3AED',
  high: 'DC2626',
  medium: 'F59E0B',
  low: '6B7280',
};

const BUREAU_INFO = {
  EX: {
    name: 'Experian',
    address: 'Experian\nP.O. Box 4500\nAllen, TX 75013',
    phone: '1-888-397-3742',
  },
  TU: {
    name: 'TransUnion',
    address: 'TransUnion LLC\nConsumer Dispute Center\nP.O. Box 2000\nChester, PA 19016',
    phone: '1-800-916-8800',
  },
  EQ: {
    name: 'Equifax',
    address: 'Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374',
    phone: '1-866-349-5191',
  },
};

const SEVERITY_ORDER = { critical: 1, high: 2, medium: 3, low: 4 };

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const formatDate = (date) => {
  const d = new Date(date || Date.now());
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const formatCurrency = (amount) => {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const getSeverityColor = (severity) => {
  return COLORS[severity] || COLORS.secondary;
};

// ============================================================================
// SHARED DOCUMENT STYLES
// ============================================================================
const getBaseStyles = () => ({
  default: {
    document: {
      run: { font: 'Arial', size: 22 }, // 11pt
    },
  },
  paragraphStyles: [
    {
      id: 'Heading1',
      name: 'Heading 1',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: { size: 32, bold: true, font: 'Arial', color: COLORS.primary },
      paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 },
    },
    {
      id: 'Heading2',
      name: 'Heading 2',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: { size: 26, bold: true, font: 'Arial', color: COLORS.primaryDark },
      paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 },
    },
    {
      id: 'Heading3',
      name: 'Heading 3',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: { size: 24, bold: true, font: 'Arial' },
      paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 },
    },
  ],
});

const getNumberingConfig = () => ({
  config: [
    {
      reference: 'bullets',
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: 'numbers',
      levels: [{
        level: 0,
        format: LevelFormat.DECIMAL,
        text: '%1.',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: 'actionSteps',
      levels: [{
        level: 0,
        format: LevelFormat.DECIMAL,
        text: 'Step %1:',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 720 } } },
      }],
    },
  ],
});

const getPageSettings = () => ({
  page: {
    size: { width: 12240, height: 15840 }, // US Letter
    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch margins
  },
});

// ============================================================================
// TABLE HELPERS
// ============================================================================
const createTableBorders = (color = 'CCCCCC') => {
  const border = { style: BorderStyle.SINGLE, size: 1, color };
  return { top: border, bottom: border, left: border, right: border };
};

const createHeaderCell = (text, width) => {
  return new TableCell({
    borders: createTableBorders(),
    width: { size: width, type: WidthType.DXA },
    shading: { fill: COLORS.primary, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: COLORS.white, size: 20 })],
      }),
    ],
  });
};

const createDataCell = (text, width, options = {}) => {
  const { bold = false, color = COLORS.black, shading = null } = options;
  return new TableCell({
    borders: createTableBorders(),
    width: { size: width, type: WidthType.DXA },
    shading: shading ? { fill: shading, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || '', bold, color, size: 20 })],
      }),
    ],
  });
};

// ============================================================================
// 1. EXECUTIVE SUMMARY DOCUMENT
// ============================================================================
const generateExecutiveSummary = (auditData) => {
  const { client, findings, generatedAt } = auditData;
  
  // Calculate stats
  const stats = {
    total: findings.length,
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  };
  
  const topFindings = findings.slice(0, 5);
  const claimIndicators = findings.filter(f => f.claimIndicator);
  
  // Build document
  const doc = new Document({
    styles: getBaseStyles(),
    numbering: getNumberingConfig(),
    sections: [{
      properties: getPageSettings(),
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: 'AXIS GROWTH LLC', bold: true, size: 18, color: COLORS.primary }),
                new TextRun({ text: ' | Credit Forensic Audit', size: 18, color: COLORS.secondary }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'CONFIDENTIAL | ', size: 16, color: COLORS.secondary }),
                new TextRun({ text: 'Page ', size: 16, color: COLORS.secondary }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLORS.secondary }),
              ],
            }),
          ],
        }),
      },
      children: [
        // Title
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: 'Credit Forensic Audit Summary', bold: true })],
        }),
        
        // Client Info
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'Prepared for: ', bold: true }),
            new TextRun({ text: client.name }),
            new TextRun({ text: '  |  ' }),
            new TextRun({ text: 'Goal: ', bold: true }),
            new TextRun({ text: (client.goal || '').replace('_', ' ') }),
            new TextRun({ text: '  |  ' }),
            new TextRun({ text: 'Date: ', bold: true }),
            new TextRun({ text: formatDate(generatedAt) }),
          ],
        }),
        
        // Summary Stats Section
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: 'Findings Overview' })],
        }),
        
        // Stats Table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [1872, 1872, 1872, 1872, 1872],
          rows: [
            new TableRow({
              children: [
                createHeaderCell('Total Issues', 1872),
                createHeaderCell('Critical', 1872),
                createHeaderCell('High', 1872),
                createHeaderCell('Medium', 1872),
                createHeaderCell('Low', 1872),
              ],
            }),
            new TableRow({
              children: [
                createDataCell(stats.total.toString(), 1872, { bold: true }),
                createDataCell(stats.critical.toString(), 1872, { color: COLORS.critical }),
                createDataCell(stats.high.toString(), 1872, { color: COLORS.high }),
                createDataCell(stats.medium.toString(), 1872, { color: COLORS.medium }),
                createDataCell(stats.low.toString(), 1872),
              ],
            }),
          ],
        }),
        
        new Paragraph({ spacing: { before: 200, after: 200 }, children: [] }),
        
        // Top Priority Findings
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: 'Top Priority Findings' })],
        }),
        
        ...topFindings.flatMap((finding, idx) => [
          new Paragraph({
            numbering: { reference: 'numbers', level: 0 },
            spacing: { before: 100, after: 60 },
            children: [
              new TextRun({ text: `[${finding.severity.toUpperCase()}] `, bold: true, color: getSeverityColor(finding.severity) }),
              new TextRun({ text: finding.item, bold: true }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            spacing: { after: 100 },
            children: [
              new TextRun({ text: 'Issue: ', bold: true, size: 20 }),
              new TextRun({ text: (finding.type || '').replace(/_/g, ' '), size: 20 }),
              new TextRun({ text: '  |  ', size: 20 }),
              new TextRun({ text: 'Bureau(s): ', bold: true, size: 20 }),
              new TextRun({ text: (finding.bureausAffected || []).map(b => BUREAU_INFO[b]?.name || b).join(', '), size: 20 }),
            ],
          }),
        ]),
        
        new Paragraph({ spacing: { before: 200 }, children: [] }),
        
        // Claim Indicators (if any)
        ...(claimIndicators.length > 0 ? [
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Possible Claim Indicators', color: COLORS.critical })],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: 'The following findings may indicate potential FCRA/FDCPA violations warranting attorney review:',
                size: 20,
                italics: true,
              }),
            ],
          }),
          ...claimIndicators.map(finding => 
            new Paragraph({
              numbering: { reference: 'bullets', level: 0 },
              children: [
                new TextRun({ text: finding.item, bold: true }),
                new TextRun({ text: ` — ${(finding.type || '').replace(/_/g, ' ')}` }),
              ],
            })
          ),
        ] : []),
        
        new Paragraph({ spacing: { before: 200 }, children: [] }),
        
        // Next Steps
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: 'Recommended Next Steps' })],
        }),
        
        new Paragraph({
          numbering: { reference: 'numbers', level: 0 },
          children: [new TextRun({ text: 'Review the detailed audit report for complete evidence citations' })],
        }),
        new Paragraph({
          numbering: { reference: 'numbers', level: 0 },
          children: [new TextRun({ text: 'Begin dispute process with highest-priority items first' })],
        }),
        new Paragraph({
          numbering: { reference: 'numbers', level: 0 },
          children: [new TextRun({ text: 'Use provided dispute letter templates for each bureau' })],
        }),
        new Paragraph({
          numbering: { reference: 'numbers', level: 0 },
          children: [new TextRun({ text: 'Track all correspondence with certified mail receipts' })],
        }),
        ...(claimIndicators.length > 0 ? [
          new Paragraph({
            numbering: { reference: 'numbers', level: 0 },
            children: [new TextRun({ text: 'Consult with a consumer law attorney regarding claim indicators', bold: true })],
          }),
        ] : []),
        
        new Paragraph({ spacing: { before: 300 }, children: [] }),
        
        // Disclaimer
        new Paragraph({
          shading: { fill: COLORS.lightGray, type: ShadingType.CLEAR },
          spacing: { before: 200 },
          children: [
            new TextRun({ text: 'DISCLAIMER: ', bold: true, size: 18 }),
            new TextRun({
              text: 'This audit is for informational purposes only. Axis Growth LLC does not provide legal advice. Results vary by individual file. No specific score increases or deletions are guaranteed. Consult a qualified consumer law attorney for legal matters.',
              size: 18,
              italics: true,
            }),
          ],
        }),
      ],
    }],
  });
  
  return doc;
};

// ============================================================================
// 2. DETAILED AUDIT REPORT DOCUMENT
// ============================================================================
const generateDetailedReport = (auditData) => {
  const { client, findings, generatedAt } = auditData;
  
  // Group findings by severity
  const groupedFindings = {
    critical: findings.filter(f => f.severity === 'critical'),
    high: findings.filter(f => f.severity === 'high'),
    medium: findings.filter(f => f.severity === 'medium'),
    low: findings.filter(f => f.severity === 'low'),
  };
  
  const buildFindingsSection = (severityFindings, severityLabel, severityColor) => {
    if (severityFindings.length === 0) return [];
    
    return [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: severityLabel === 'CRITICAL',
        children: [new TextRun({ text: `${severityLabel} Priority Findings (${severityFindings.length})`, color: severityColor })],
      }),
      
      ...severityFindings.flatMap((finding, idx) => [
        // Finding header
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200 },
          children: [
            new TextRun({ text: `Finding #${finding.id}: ` }),
            new TextRun({ text: finding.item }),
          ],
        }),
        
        // Finding details table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [2500, 6860],
          rows: [
            new TableRow({
              children: [
                createDataCell('Issue Type', 2500, { bold: true, shading: COLORS.lightGray }),
                createDataCell((finding.type || '').replace(/_/g, ' '), 6860),
              ],
            }),
            new TableRow({
              children: [
                createDataCell('Bureau(s)', 2500, { bold: true, shading: COLORS.lightGray }),
                createDataCell((finding.bureausAffected || []).map(b => BUREAU_INFO[b]?.name || b).join(', '), 6860),
              ],
            }),
            new TableRow({
              children: [
                createDataCell('Impact Score', 2500, { bold: true, shading: COLORS.lightGray }),
                createDataCell(`${finding.impactScore || 'N/A'}/10`, 6860),
              ],
            }),
            new TableRow({
              children: [
                createDataCell('Legal Basis', 2500, { bold: true, shading: COLORS.lightGray }),
                createDataCell(finding.basis || 'N/A', 6860),
              ],
            }),
            new TableRow({
              children: [
                createDataCell('Timeline', 2500, { bold: true, shading: COLORS.lightGray }),
                createDataCell(finding.timeline || '30-45 days', 6860),
              ],
            }),
          ],
        }),
        
        // Evidence
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [new TextRun({ text: 'Evidence:', bold: true })],
        }),
        new Paragraph({
          shading: { fill: 'F0F4F8', type: ShadingType.CLEAR },
          spacing: { after: 100 },
          children: [new TextRun({ text: finding.evidence || 'No evidence citation available', italics: true, size: 20 })],
        }),
        
        // Cannot Confirm (if present)
        ...(finding.cannotConfirm ? [
          new Paragraph({
            spacing: { before: 80 },
            children: [
              new TextRun({ text: '⚠ Cannot Confirm: ', bold: true, color: COLORS.medium }),
              new TextRun({ text: finding.cannotConfirm, size: 20 }),
            ],
          }),
        ] : []),
        
        // Recommended Action
        new Paragraph({
          spacing: { before: 120 },
          children: [
            new TextRun({ text: 'Recommended Action: ', bold: true }),
            new TextRun({ text: finding.action || 'Dispute with bureau(s)' }),
          ],
        }),
        
        // Dependencies (if any)
        ...(finding.dependencies && finding.dependencies.length > 0 ? [
          new Paragraph({
            spacing: { before: 80 },
            children: [
              new TextRun({ text: '⚠ Depends on: ', bold: true, color: COLORS.medium }),
              new TextRun({ text: `Finding #${finding.dependencies.join(', #')} should be resolved first`, size: 20 }),
            ],
          }),
        ] : []),
        
        // Claim Indicator (if flagged)
        ...(finding.claimIndicator ? [
          new Paragraph({
            spacing: { before: 80 },
            shading: { fill: 'FEF3C7', type: ShadingType.CLEAR },
            children: [
              new TextRun({ text: '★ CLAIM INDICATOR: ', bold: true, color: COLORS.critical }),
              new TextRun({ text: 'This finding may warrant attorney review for potential FCRA/FDCPA claims.', size: 20 }),
            ],
          }),
          ...(finding.documentationNeeded && finding.documentationNeeded.length > 0 ? [
            new Paragraph({
              indent: { left: 360 },
              children: [new TextRun({ text: 'Documentation needed: ' + finding.documentationNeeded.join('; '), size: 18, italics: true })],
            }),
          ] : []),
        ] : []),
        
        new Paragraph({ spacing: { after: 200 }, children: [] }),
      ]),
    ];
  };
  
  const doc = new Document({
    styles: getBaseStyles(),
    numbering: getNumberingConfig(),
    sections: [{
      properties: getPageSettings(),
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: 'AXIS GROWTH LLC', bold: true, size: 18, color: COLORS.primary }),
                new TextRun({ text: ' | Detailed Audit Report', size: 18, color: COLORS.secondary }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `${client.name} | `, size: 16, color: COLORS.secondary }),
                new TextRun({ text: 'Page ', size: 16, color: COLORS.secondary }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLORS.secondary }),
              ],
            }),
          ],
        }),
      },
      children: [
        // Title Page Content
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 1000 },
          children: [new TextRun({ text: 'Credit Forensic Audit Report' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: 'Detailed Findings & Evidence', size: 28, color: COLORS.secondary })],
        }),
        
        // Client Info Box
        new Table({
          width: { size: 70, type: WidthType.PERCENTAGE },
          alignment: AlignmentType.CENTER,
          columnWidths: [3000, 5000],
          rows: [
            new TableRow({
              children: [
                createDataCell('Client Name', 3000, { bold: true, shading: COLORS.lightGray }),
                createDataCell(client.name, 5000),
              ],
            }),
            new TableRow({
              children: [
                createDataCell('State', 3000, { bold: true, shading: COLORS.lightGray }),
                createDataCell(client.state || 'N/A', 5000),
              ],
            }),
            new TableRow({
              children: [
                createDataCell('Credit Goal', 3000, { bold: true, shading: COLORS.lightGray }),
                createDataCell((client.goal || '').replace('_', ' '), 5000),
              ],
            }),
            new TableRow({
              children: [
                createDataCell('Timeline', 3000, { bold: true, shading: COLORS.lightGray }),
                createDataCell(`${client.timeline || 'N/A'} months`, 5000),
              ],
            }),
            new TableRow({
              children: [
                createDataCell('Report Date', 3000, { bold: true, shading: COLORS.lightGray }),
                createDataCell(formatDate(generatedAt), 5000),
              ],
            }),
            new TableRow({
              children: [
                createDataCell('Total Findings', 3000, { bold: true, shading: COLORS.lightGray }),
                createDataCell(findings.length.toString(), 5000, { bold: true }),
              ],
            }),
          ],
        }),
        
        new Paragraph({ spacing: { before: 600 }, children: [] }),
        
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Prepared by Axis Growth LLC', size: 20, color: COLORS.secondary }),
          ],
        }),
        
        // Page break before findings
        new Paragraph({ children: [new PageBreak()] }),
        
        // Findings by severity
        ...buildFindingsSection(groupedFindings.critical, 'CRITICAL', COLORS.critical),
        ...buildFindingsSection(groupedFindings.high, 'HIGH', COLORS.high),
        ...buildFindingsSection(groupedFindings.medium, 'MEDIUM', COLORS.medium),
        ...buildFindingsSection(groupedFindings.low, 'LOW', COLORS.low),
        
        // Disclaimer
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: 'Important Disclaimers' })],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: 'This audit report is provided for informational purposes only. Axis Growth LLC is not a law firm and does not provide legal advice. The findings in this report are based on the data provided and standard FCRA/FDCPA guidelines.',
            }),
          ],
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'Results vary by individual credit file and cannot be guaranteed.' })],
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'No specific credit score increases or deletions are promised or implied.' })],
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'Items marked as "Claim Indicators" require attorney review before any legal action.' })],
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'Dispute timelines are estimates based on FCRA requirements (30-45 days typical).' })],
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'Consult a qualified consumer law attorney for legal matters.' })],
        }),
      ],
    }],
  });
  
  return doc;
};

// ============================================================================
// 3. DISPUTE LETTER GENERATOR
// ============================================================================
const generateDisputeLetter = (client, finding, bureau) => {
  const bureauInfo = BUREAU_INFO[bureau];
  const today = formatDate(new Date());
  
  const doc = new Document({
    styles: getBaseStyles(),
    sections: [{
      properties: getPageSettings(),
      children: [
        // Date
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 400 },
          children: [new TextRun({ text: today })],
        }),
        
        // Bureau Address
        new Paragraph({
          children: [new TextRun({ text: bureauInfo.address.split('\n')[0], bold: true })],
        }),
        ...bureauInfo.address.split('\n').slice(1).map(line =>
          new Paragraph({ children: [new TextRun({ text: line })] })
        ),
        
        new Paragraph({ spacing: { before: 400, after: 400 }, children: [] }),
        
        // Subject
        new Paragraph({
          children: [
            new TextRun({ text: 'RE: Dispute of Inaccurate Credit Information', bold: true }),
          ],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'Account: ', bold: true }),
            new TextRun({ text: finding.item }),
          ],
        }),
        
        // Salutation
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: 'To Whom It May Concern:' })],
        }),
        
        // Body - Paragraph 1
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: `I am writing to dispute inaccurate information appearing on my ${bureauInfo.name} credit report. Under the Fair Credit Reporting Act (FCRA), I have the right to dispute incomplete or inaccurate information, and you are required to investigate my dispute within 30 days.`,
            }),
          ],
        }),
        
        // Body - Disputed Item
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: 'DISPUTED ITEM:', bold: true })],
        }),
        new Paragraph({
          indent: { left: 720 },
          children: [
            new TextRun({ text: 'Account: ', bold: true }),
            new TextRun({ text: finding.item }),
          ],
        }),
        new Paragraph({
          indent: { left: 720 },
          children: [
            new TextRun({ text: 'Issue Type: ', bold: true }),
            new TextRun({ text: (finding.type || '').replace(/_/g, ' ') }),
          ],
        }),
        
        new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }),
        
        // Evidence Section
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: 'REASON FOR DISPUTE:', bold: true })],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: finding.evidence || 'The information reported is inaccurate and requires investigation.' })],
        }),
        
        // Legal Basis
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: 'LEGAL BASIS:', bold: true })],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: finding.basis || 'FCRA §611(a) - Accuracy requirement' })],
        }),
        
        // Request
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'REQUEST: ', bold: true }),
            new TextRun({ text: 'I request that you investigate this matter and either verify the accuracy of this information or remove/correct it from my credit file. Please provide me with the results of your investigation in writing, including the name, address, and telephone number of any furnisher contacted.' }),
          ],
        }),
        
        // FCRA Notice
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: 'Please be advised that under FCRA §611(a)(1)(A), you must conduct a reasonable investigation of this dispute. If you cannot verify the accuracy of this information within 30 days, it must be promptly deleted or modified pursuant to FCRA §611(a)(5).',
            }),
          ],
        }),
        
        // Closing
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: 'I have enclosed copies of my identification for your records.' })],
        }),
        
        new Paragraph({
          spacing: { before: 400 },
          children: [new TextRun({ text: 'Sincerely,' })],
        }),
        
        new Paragraph({ spacing: { before: 600 }, children: [] }),
        
        new Paragraph({
          children: [new TextRun({ text: client.name })],
        }),
        new Paragraph({
          children: [new TextRun({ text: `[Your Address]`, color: COLORS.secondary })],
        }),
        new Paragraph({
          children: [new TextRun({ text: `[City, State ZIP]`, color: COLORS.secondary })],
        }),
        new Paragraph({
          children: [new TextRun({ text: `[SSN Last 4: XXXX]`, color: COLORS.secondary })],
        }),
        new Paragraph({
          children: [new TextRun({ text: `[Date of Birth: XX/XX/XXXX]`, color: COLORS.secondary })],
        }),
        
        new Paragraph({ spacing: { before: 400 }, children: [] }),
        
        // Enclosures
        new Paragraph({
          children: [new TextRun({ text: 'Enclosures:', bold: true })],
        }),
        new Paragraph({
          indent: { left: 360 },
          children: [new TextRun({ text: '- Copy of government-issued ID', size: 20 })],
        }),
        new Paragraph({
          indent: { left: 360 },
          children: [new TextRun({ text: '- Copy of utility bill or other proof of address', size: 20 })],
        }),
        new Paragraph({
          indent: { left: 360 },
          children: [new TextRun({ text: '- Relevant credit report page(s) with disputed item highlighted', size: 20 })],
        }),
      ],
    }],
  });
  
  return doc;
};

// ============================================================================
// 4. ACTION PLAN DOCUMENT
// ============================================================================
const generateActionPlan = (auditData) => {
  const { client, findings, generatedAt } = auditData;
  
  // Group findings into phases based on priority and dependencies
  const phase1 = findings.filter(f => f.severity === 'critical' && (!f.dependencies || f.dependencies.length === 0));
  const phase2 = findings.filter(f => f.severity === 'high' || (f.severity === 'critical' && f.dependencies && f.dependencies.length > 0));
  const phase3 = findings.filter(f => f.severity === 'medium');
  const phase4 = findings.filter(f => f.severity === 'low');
  
  const buildPhaseSection = (phaseFindings, phaseNum, phaseTitle, timeframe) => {
    if (phaseFindings.length === 0) return [];
    
    return [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300 },
        children: [new TextRun({ text: `Phase ${phaseNum}: ${phaseTitle}` })],
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: 'Timeframe: ', bold: true }),
          new TextRun({ text: timeframe }),
          new TextRun({ text: '  |  ' }),
          new TextRun({ text: 'Items: ', bold: true }),
          new TextRun({ text: phaseFindings.length.toString() }),
        ],
      }),
      
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [500, 3500, 2500, 2860],
        rows: [
          new TableRow({
            children: [
              createHeaderCell('☐', 500),
              createHeaderCell('Item', 3500),
              createHeaderCell('Issue', 2500),
              createHeaderCell('Bureau(s)', 2860),
            ],
          }),
          ...phaseFindings.map(finding =>
            new TableRow({
              children: [
                createDataCell('☐', 500),
                createDataCell(finding.item, 3500),
                createDataCell((finding.type || '').replace(/_/g, ' ').substring(0, 25), 2500),
                createDataCell((finding.bureausAffected || []).map(b => BUREAU_INFO[b]?.name.substring(0, 3) || b).join(', '), 2860),
              ],
            })
          ),
        ],
      }),
      
      new Paragraph({ spacing: { after: 200 }, children: [] }),
    ];
  };
  
  const doc = new Document({
    styles: getBaseStyles(),
    numbering: getNumberingConfig(),
    sections: [{
      properties: getPageSettings(),
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: 'AXIS GROWTH LLC', bold: true, size: 18, color: COLORS.primary }),
                new TextRun({ text: ' | Action Plan', size: 18, color: COLORS.secondary }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `${client.name} | `, size: 16, color: COLORS.secondary }),
                new TextRun({ text: 'Page ', size: 16, color: COLORS.secondary }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLORS.secondary }),
              ],
            }),
          ],
        }),
      },
      children: [
        // Title
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: 'Credit Repair Action Plan' })],
        }),
        
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'Client: ', bold: true }),
            new TextRun({ text: client.name }),
            new TextRun({ text: '  |  ' }),
            new TextRun({ text: 'Target: ', bold: true }),
            new TextRun({ text: `${client.timeline || 'N/A'} months` }),
            new TextRun({ text: '  |  ' }),
            new TextRun({ text: 'Created: ', bold: true }),
            new TextRun({ text: formatDate(generatedAt) }),
          ],
        }),
        
        // Overview
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: 'Plan Overview' })],
        }),
        
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: `This action plan organizes your ${findings.length} findings into 4 phases based on priority and dependencies. Work through each phase sequentially, allowing 30-45 days for bureau responses before proceeding to dependent items.`,
            }),
          ],
        }),
        
        // Phase breakdown
        ...buildPhaseSection(phase1, 1, 'Critical Priority (No Dependencies)', 'Days 1-45'),
        ...buildPhaseSection(phase2, 2, 'High Priority', 'Days 45-90'),
        ...buildPhaseSection(phase3, 3, 'Medium Priority', 'Days 90-120'),
        ...buildPhaseSection(phase4, 4, 'Low Priority / Monitoring', 'Days 120+'),
        
        // Process Guide
        new Paragraph({ children: [new PageBreak()] }),
        
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: 'Dispute Process Guide' })],
        }),
        
        new Paragraph({
          numbering: { reference: 'actionSteps', level: 0 },
          spacing: { before: 100 },
          children: [new TextRun({ text: 'Gather Documentation', bold: true })],
        }),
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun({ text: 'Collect copies of your credit reports from all three bureaus, government-issued ID, and proof of address.', size: 20 })],
        }),
        
        new Paragraph({
          numbering: { reference: 'actionSteps', level: 0 },
          spacing: { before: 100 },
          children: [new TextRun({ text: 'Send Dispute Letters', bold: true })],
        }),
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun({ text: 'Use the provided dispute letter templates. Send via certified mail with return receipt requested.', size: 20 })],
        }),
        
        new Paragraph({
          numbering: { reference: 'actionSteps', level: 0 },
          spacing: { before: 100 },
          children: [new TextRun({ text: 'Track Everything', bold: true })],
        }),
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun({ text: 'Keep copies of all correspondence. Log dates sent and received. Save certified mail receipts.', size: 20 })],
        }),
        
        new Paragraph({
          numbering: { reference: 'actionSteps', level: 0 },
          spacing: { before: 100 },
          children: [new TextRun({ text: 'Wait for Response', bold: true })],
        }),
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun({ text: 'Bureaus have 30 days (45 if you provide additional info) to investigate and respond.', size: 20 })],
        }),
        
        new Paragraph({
          numbering: { reference: 'actionSteps', level: 0 },
          spacing: { before: 100 },
          children: [new TextRun({ text: 'Review Results', bold: true })],
        }),
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun({ text: 'Check updated credit reports. Items should be corrected, deleted, or verified. Move to next phase.', size: 20 })],
        }),
        
        new Paragraph({
          numbering: { reference: 'actionSteps', level: 0 },
          spacing: { before: 100 },
          children: [new TextRun({ text: 'Escalate if Needed', bold: true })],
        }),
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun({ text: 'If items are incorrectly verified, send follow-up disputes with additional evidence. Consider CFPB complaint if unresolved.', size: 20 })],
        }),
        
        // Bureau Contact Info
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400 },
          children: [new TextRun({ text: 'Bureau Contact Information' })],
        }),
        
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [2000, 4500, 2860],
          rows: [
            new TableRow({
              children: [
                createHeaderCell('Bureau', 2000),
                createHeaderCell('Mailing Address', 4500),
                createHeaderCell('Phone', 2860),
              ],
            }),
            ...Object.entries(BUREAU_INFO).map(([code, info]) =>
              new TableRow({
                children: [
                  createDataCell(info.name, 2000, { bold: true }),
                  createDataCell(info.address.replace(/\n/g, ', '), 4500),
                  createDataCell(info.phone, 2860),
                ],
              })
            ),
          ],
        }),
        
        // Notes section
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400 },
          children: [new TextRun({ text: 'Notes & Tracking' })],
        }),
        
        ...[1, 2, 3, 4, 5].map(() =>
          new Paragraph({
            spacing: { before: 200 },
            children: [new TextRun({ text: '_'.repeat(80), color: COLORS.secondary })],
          })
        ),
      ],
    }],
  });
  
  return doc;
};

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================
const generateAllDocuments = async (auditData, outputDir) => {
  const { client, findings } = auditData;
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const generatedFiles = [];
  const clientSlug = (client.name || 'client').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  
  console.log(`\n📄 Generating documents for ${client.name}...`);
  console.log(`   Output directory: ${outputDir}\n`);
  
  // 1. Executive Summary
  console.log('   [1/4] Generating Executive Summary...');
  const summaryDoc = generateExecutiveSummary(auditData);
  const summaryPath = path.join(outputDir, `${clientSlug}_Executive_Summary.docx`);
  const summaryBuffer = await Packer.toBuffer(summaryDoc);
  fs.writeFileSync(summaryPath, summaryBuffer);
  generatedFiles.push(summaryPath);
  console.log(`         ✓ ${path.basename(summaryPath)}`);
  
  // 2. Detailed Report
  console.log('   [2/4] Generating Detailed Audit Report...');
  const reportDoc = generateDetailedReport(auditData);
  const reportPath = path.join(outputDir, `${clientSlug}_Detailed_Audit_Report.docx`);
  const reportBuffer = await Packer.toBuffer(reportDoc);
  fs.writeFileSync(reportPath, reportBuffer);
  generatedFiles.push(reportPath);
  console.log(`         ✓ ${path.basename(reportPath)}`);
  
  // 3. Action Plan
  console.log('   [3/4] Generating Action Plan...');
  const planDoc = generateActionPlan(auditData);
  const planPath = path.join(outputDir, `${clientSlug}_Action_Plan.docx`);
  const planBuffer = await Packer.toBuffer(planDoc);
  fs.writeFileSync(planPath, planBuffer);
  generatedFiles.push(planPath);
  console.log(`         ✓ ${path.basename(planPath)}`);
  
  // 4. Dispute Letters (per bureau, per finding)
  console.log('   [4/4] Generating Dispute Letters...');
  const disputeDir = path.join(outputDir, 'Dispute_Letters');
  if (!fs.existsSync(disputeDir)) {
    fs.mkdirSync(disputeDir, { recursive: true });
  }
  
  let letterCount = 0;
  for (const finding of findings) {
    for (const bureau of (finding.bureausAffected || [])) {
      const letterDoc = generateDisputeLetter(client, finding, bureau);
      const letterFilename = `Dispute_${bureau}_Finding${finding.id}_${(finding.type || 'issue').substring(0, 15)}.docx`;
      const letterPath = path.join(disputeDir, letterFilename);
      const letterBuffer = await Packer.toBuffer(letterDoc);
      fs.writeFileSync(letterPath, letterBuffer);
      generatedFiles.push(letterPath);
      letterCount++;
    }
  }
  console.log(`         ✓ ${letterCount} dispute letters generated`);
  
  console.log(`\n✅ Document generation complete!`);
  console.log(`   Total files: ${generatedFiles.length}`);
  
  return generatedFiles;
};

// ============================================================================
// CLI EXECUTION
// ============================================================================
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node generateAuditDocuments.js <auditData.json> <outputDir>');
    console.log('\nExample: node generateAuditDocuments.js ./audit.json ./output');
    process.exit(1);
  }
  
  const [inputFile, outputDir] = args;
  
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
  }
  
  try {
    const auditData = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
    generateAllDocuments(auditData, outputDir)
      .then(files => {
        console.log('\nGenerated files:');
        files.forEach(f => console.log(`  - ${f}`));
      })
      .catch(err => {
        console.error('Error generating documents:', err);
        process.exit(1);
      });
  } catch (err) {
    console.error('Error reading input file:', err.message);
    process.exit(1);
  }
}

module.exports = {
  generateAllDocuments,
  generateExecutiveSummary,
  generateDetailedReport,
  generateDisputeLetter,
  generateActionPlan,
};
