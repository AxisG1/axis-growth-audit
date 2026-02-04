import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function GET(request) {
  try {
    var url = new URL(request.url);
    var auditId = url.searchParams.get('id');
    var type = url.searchParams.get('type');

    if (!auditId) {
      return NextResponse.json({ error: 'Missing audit ID' }, { status: 400 });
    }

    var auditDir = path.join('/tmp', 'audits', auditId);
    if (!existsSync(auditDir)) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    var auditJson = await readFile(path.join(auditDir, 'audit.json'), 'utf8');
    var auditData = JSON.parse(auditJson);
    var clientName = (auditData.client && auditData.client.name ? auditData.client.name : 'Client').replace(/[^a-zA-Z0-9]/g, '_');

    var content = '';
    var filename = '';

    if (type === 'summary') {
      content = generateSummary(auditData);
      filename = clientName + '_Executive_Summary.txt';
    } else if (type === 'report') {
      content = generateReport(auditData);
      filename = clientName + '_Detailed_Report.txt';
    } else if (type === 'plan') {
      content = generatePlan(auditData);
      filename = clientName + '_Action_Plan.txt';
    } else if (type === 'letters') {
      content = generateLetters(auditData);
      filename = clientName + '_Dispute_Letters.txt';
    } else if (type === 'all') {
      content = generateAll(auditData);
      filename = clientName + '_Complete_Package.txt';
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + filename + '"'
      }
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generateSummary(data) {
  var findings = data.findings || [];
  var client = data.client || {};
  var c = findings.filter(function(f){return f.severity==='critical';}).length;
  var h = findings.filter(function(f){return f.severity==='high';}).length;
  var m = findings.filter(function(f){return f.severity==='medium';}).length;
  var l = findings.filter(function(f){return f.severity==='low';}).length;

  var out = '';
  out += '================================================================\n';
  out += '                    AXIS GROWTH LLC\n';
  out += '           CREDIT FORENSIC AUDIT - EXECUTIVE SUMMARY\n';
  out += '================================================================\n\n';
  out += 'Client: ' + (client.name || 'N/A') + '\n';
  out += 'Date: ' + new Date().toLocaleDateString() + '\n\n';
  out += 'FINDINGS: ' + findings.length + ' total\n';
  out += '  Critical: ' + c + '\n';
  out += '  High: ' + h + '\n';
  out += '  Medium: ' + m + '\n';
  out += '  Low: ' + l + '\n\n';
  out += 'TOP FINDINGS:\n';
  for (var i = 0; i < Math.min(5, findings.length); i++) {
    out += (i+1) + '. [' + findings[i].severity.toUpperCase() + '] ' + findings[i].item + '\n';
  }
  return out;
}

function generateReport(data) {
  var findings = data.findings || [];
  var out = '';
  out += '================================================================\n';
  out += '                    AXIS GROWTH LLC\n';
  out += '                    DETAILED REPORT\n';
  out += '================================================================\n\n';
  for (var i = 0; i < findings.length; i++) {
    var f = findings[i];
    out += 'FINDING #' + (i+1) + '\n';
    out += 'Item: ' + f.item + '\n';
    out += 'Severity: ' + f.severity + '\n';
    out += 'Bureau(s): ' + (f.bureausAffected || []).join(', ') + '\n';
    out += 'Evidence: ' + f.evidence + '\n';
    out += 'Action: ' + f.action + '\n';
    out += 'Legal Basis: ' + f.basis + '\n\n';
  }
  return out;
}

function generatePlan(data) {
  var findings = data.findings || [];
  var out = '';
  out += '================================================================\n';
  out += '                    ACTION PLAN\n';
  out += '================================================================\n\n';
  var phases = ['critical', 'high', 'medium', 'low'];
  var labels = ['PHASE 1 (Days 1-45)', 'PHASE 2 (Days 45-90)', 'PHASE 3 (Days 90-120)', 'PHASE 4 (Days 120+)'];
  for (var p = 0; p < phases.length; p++) {
    var items = findings.filter(function(f){return f.severity === phases[p];});
    if (items.length > 0) {
      out += labels[p] + ':\n';
      for (var i = 0; i < items.length; i++) {
        out += '[ ] ' + items[i].item + '\n';
      }
      out += '\n';
    }
  }
  return out;
}

function generateLetters(data) {
  var findings = data.findings || [];
  var client = data.client || {};
  var bureaus = {
    TU: {name: 'TransUnion', addr: 'P.O. Box 2000, Chester, PA 19016'},
    EX: {name: 'Experian', addr: 'P.O. Box 4500, Allen, TX 75013'},
    EQ: {name: 'Equifax', addr: 'P.O. Box 740256, Atlanta, GA 30374'}
  };
  var out = '';
  for (var i = 0; i < findings.length; i++) {
    var f = findings[i];
    var bList = f.bureausAffected || [];
    for (var b = 0; b < bList.length; b++) {
      var bureau = bList[b];
      var info = bureaus[bureau] || {name: bureau, addr: ''};
      out += '================================================================\n';
      out += 'DISPUTE LETTER - ' + info.name + '\n';
      out += '================================================================\n\n';
      out += new Date().toLocaleDateString() + '\n\n';
      out += info.name + '\n' + info.addr + '\n\n';
      out += 'RE: Dispute - ' + f.item + '\n\n';
      out += 'To Whom It May Concern:\n\n';
      out += 'I dispute: ' + f.item + '\n';
      out += 'Reason: ' + f.evidence + '\n';
      out += 'Legal Basis: ' + f.basis + '\n\n';
      out += 'Please investigate within 30 days per FCRA Section 611.\n\n';
      out += 'Sincerely,\n' + (client.name || '[Your Name]') + '\n\n\n';
    }
  }
  return out;
}

function generateAll(data) {
  return generateSummary(data) + '\n\n' + generateReport(data) + '\n\n' + generatePlan(data) + '\n\n' + generateLetters(data);
}
