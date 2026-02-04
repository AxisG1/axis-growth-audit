import { NextResponse } from 'next/server';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, HeadingLevel } from 'docx';
import archiver from 'archiver';

const BUREAU_INFO = {
  TU: { name: 'TransUnion', address: 'P.O. Box 2000\nChester, PA 19016' },
  EX: { name: 'Experian', address: 'P.O. Box 4500\nAllen, TX 75013' },
  EQ: { name: 'Equifax', address: 'P.O. Box 740256\nAtlanta, GA 30374' },
};

async function generateExecutiveSummary(auditData) {
  const { client, findings } = auditData;
  const counts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  };

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'AXIS GROWTH LLC', bold: true, size: 32, color: '1E40AF' })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Credit Forensic Audit - Executive Summary', size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Client: ${client.name || 'N/A'}`, bold: true })],
        }),
        new Paragraph({
          children: [new TextRun({ text: `State: ${client.state || 'N/A'}` })],
        }),
        new Paragraph({
          children: [new TextRun({ text: `Date: ${new Date().toLocaleDateString()}` })],
          spacing: { after: 400 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'FINDINGS SUMMARY', bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          children: [new TextRun({ text: `Total Issues Found: ${findings.length}`, bold: true, size: 24 })],
          spacing: { after: 200 },
        }),
        new Paragraph({ children: [new TextRun({ text: `• Critical: ${counts.critical}`, color: '7C3AED' })] }),
        new Paragraph({ children: [new TextRun({ text: `• High: ${counts.high}`, color: 'DC2626' })] }),
        new Paragraph({ children: [new TextRun({ text: `• Medium: ${counts.medium}`, color: 'F59E0B' })] }),
        new Paragraph({ children: [new TextRun({ text: `• Low: ${counts.low}`, color: '6B7280' })] }),
        new Paragraph({ text: '', spacing: { after: 400 } }),
        new Paragraph({
          children: [new TextRun({ text: 'TOP PRIORITY FINDINGS', bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_1,
        }),
        ...findings.slice(0, 5).map((f, i) => new Paragraph({
          children: [
            new TextRun({ text: `${i + 1}. [${f.severity.toUpperCase()}] `, bold: true }),
            new TextRun({ text: f.item }),
            new TextRun({ text: `\n   ${f.evidence}`, italics: true, size: 20 }),
          ],
          spacing: { after: 200 },
        })),
        new Paragraph({ text: '', spacing: { after: 400 } }),
        new Paragraph({
          children: [new TextRun({ text: 'DISCLAIMER', bold: true, size: 24 })],
        }),
        new Paragraph({
          children: [new TextRun({ 
            text: 'This audit is for informational purposes only. Axis Growth LLC does not provide legal advice. Results vary by individual file. No specific score increases or deletions are guaranteed.',
            size: 18,
            italics: true,
          })],
        }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

async function generateDetailedReport(auditData) {
  const { client, findings } = auditData;

  const findingParagraphs = findings.flatMap((f, i) => [
    new Paragraph({
      children: [
        new TextRun({ text: `Finding #${i + 1}: `, bold: true }),
        new TextRun({ text: f.item }),
      ],
      spacing: { before: 300 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Severity: ', bold: true }),
        new TextRun({ text: f.severity.toUpperCase() }),
        new TextRun({ text: '  |  Bureau(s): ', bold: true }),
        new TextRun({ text: (f.bureausAffected || []).join(', ') }),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: f.evidence, italics: true })],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Action: ', bold: true }),
        new TextRun({ text: f.action }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Legal Basis: ', bold: true }),
        new TextRun({ text: f.basis }),
      ],
      spacing: { after: 200 },
    }),
  ]);

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'AXIS GROWTH LLC', bold: true, size: 32, color: '1E40AF' })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Credit Forensic Audit - Detailed Report', size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Client: ${client.name || 'N/A'}  |  Date: ${new Date().toLocaleDateString()}` })],
          spacing: { after: 400 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'ALL FINDINGS', bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_1,
        }),
        ...findingParagraphs,
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

async function generateActionPlan(auditData) {
  const { client, findings } = auditData;
  
  const phase1 = findings.filter(f => f.severity === 'critical');
  const phase2 = findings.filter(f => f.severity === 'high');
  const phase3 = findings.filter(f => f.severity === 'medium');
  const phase4 = findings.filter(f => f.severity === 'low');

  const createPhase = (title, items, timeline) => [
    new Paragraph({
      children: [new TextRun({ text: `${title} (${timeline})`, bold: true, size: 24 })],
      spacing: { before: 400 },
    }),
    ...items.map((f, i) => new Paragraph({
      children: [
        new TextRun({ text: `☐ ${f.item}` }),
        new TextRun({ text: ` - ${f.action}`, italics: true, size: 20 }),
      ],
    })),
  ];

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'AXIS GROWTH LLC', bold: true, size: 32, color: '1E40AF' })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Credit Repair Action Plan', size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Client: ${client.name || 'N/A'}  |  Total Findings: ${findings.length}` })],
          spacing: { after: 400 },
        }),
        ...(phase1.length ? createPhase('PHASE 1: CRITICAL PRIORITY', phase1, 'Days 1-45') : []),
        ...(phase2.length ? createPhase('PHASE 2: HIGH PRIORITY', phase2, 'Days 45-90') : []),
        ...(phase3.length ? createPhase('PHASE 3: MEDIUM PRIORITY', phase3, 'Days 90-120') : []),
        ...(phase4.length ? createPhase('PHASE 4: LOW PRIORITY', phase4, 'Days 120+') : []),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

async function generateDisputeLetter(finding, client, bureau) {
  const bureauInfo = BUREAU_INFO[bureau] || { name: bureau, address: 'Address not available' };
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: new Date().toLocaleDateString() })],
          spacing: { after: 400 },
        }),
        new Paragraph({ children: [new TextRun({ text: bureauInfo.name })] }),
        ...bureauInfo.address.split('\n').map(line => 
          new Paragraph({ children: [new TextRun({ text: line })] })
        ),
        new Paragraph({ text: '', spacing: { after: 400 } }),
        new Paragraph({
          children: [new TextRun({ text: 'RE: Dispute of Inaccurate Credit Information', bold: true })],
        }),
        new Paragraph({
          children: [new TextRun({ text: `Account: ${finding.item}` })],
          spacing: { after: 400 },
        }),
        new Paragraph({ children: [new TextRun({ text: 'To Whom It May Concern:' })] }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ 
            text: `I am writing to dispute inaccurate information appearing on my ${bureauInfo.name} credit report. Under the Fair Credit Reporting Act (FCRA), I have the right to dispute incomplete or inaccurate information.`
          })],
        }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ text: 'DISPUTED ITEM:', bold: true })],
        }),
        new Paragraph({
          children: [new TextRun({ text: finding.item })],
        }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ text: 'REASON FOR DISPUTE:', bold: true })],
        }),
        new Paragraph({
          children: [new TextRun({ text: finding.evidence })],
        }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ text: 'LEGAL BASIS:', bold: true })],
        }),
        new Paragraph({
          children: [new TextRun({ text: finding.basis })],
        }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ 
            text: 'I request that you investigate this matter and either verify the accuracy of this information or remove/correct it from my credit file within 30 days as required by FCRA §611(a)(1)(A).'
          })],
        }),
        new Paragraph({ text: '', spacing: { after: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'Sincerely,' })] }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: '_______________________________' })] }),
        new Paragraph({ children: [new TextRun({ text: client.name || '[Your Name]' })] }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const auditId = searchParams.get('id');
    const type = searchParams.get('type');

    if (!auditId) {
      return NextResponse.json({ error: 'Missing audit ID' }, { status: 400 });
    }

    const auditDir = path.join('/tmp', 'audits', auditId);
    if (!existsSync(auditDir)) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    const auditData = JSON.parse(await readFile(path.join(auditDir, 'audit.json'), 'utf8'));
    const clientName = (auditData.client?.name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');

    if (type === 'summary') {
      const buffer = await generateExecutiveSummary(auditData);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${clientName}_Executive_Summary.docx"`,
        },
      });
    }

    if (type === 'report') {
      const buffer = await generateDetailedReport(auditData);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${clientName}_Detailed_Report.docx"`,
        },
      });
    }

    if (type === 'plan') {
      const buffer = await generateActionPlan(auditData);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${clientName}_Action_Plan.docx"`,
        },
      });
    }

    if (type === 'letters' || type === 'all') {
      // Create ZIP with all letters
      const { Readable } = await import('stream');
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks = [];

      archive.on('data', chunk => chunks.push(chunk));

      // Add individual letters
      for (const finding of auditData.findings) {
        for (const bureau of (finding.bureausAffected || [])) {
          const letterBuffer = await generateDisputeLetter(finding, auditData.client, bureau);
          const filename = `Dispute_${bureau}_Finding${finding.id}_${finding.type.substring(0, 15)}.docx`;
          archive.append(letterBuffer, { name: `Dispute_Letters/${filename}` });
        }
      }

      // If type is 'all', also add summary, report, and plan
      if (type === 'all') {
        const summaryBuffer = await generateExecutiveSummary(auditData);
        archive.append(summaryBuffer, { name: `${clientName}_Executive_Summary.docx` });

        const reportBuffer = await generateDetailedReport(auditData);
        archive.append(reportBuffer, { name: `${clientName}_Detailed_Report.docx` });

        const planBuffer = await generateActionPlan(auditData);
        archive.append(planBuffer, { name: `${clientName}_Action_Plan.docx` });
      }

      await archive.finalize();

      // Wait for archive to complete
      await new Promise(resolve => archive.on('end', resolve));

      const zipBuffer = Buffer.concat(chunks);

      return new NextResponse(zipBuffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${clientName}_${type === 'all' ? 'Complete_Package' : 'Dispute_Letters'}.zip"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid download type' }, { status: 400 });

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
