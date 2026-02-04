'use client';

import { useState, useRef } from 'react';

export default function Home() {
  const [stage, setStage] = useState('upload');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState({ step: 0, message: '' });
  const [auditResults, setAuditResults] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = function(selectedFile) {
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Please upload a PDF file');
    }
  };

  const handleStartAudit = async function() {
    if (!file) return;

    setStage('processing');
    setProgress({ step: 1, message: 'Uploading credit report...' });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const progressSteps = [
        { step: 1, message: 'Uploading credit report...' },
        { step: 2, message: 'Extracting account data...' },
        { step: 3, message: 'Analyzing tradelines across bureaus...' },
        { step: 4, message: 'Detecting FCRA violations...' },
        { step: 5, message: 'Generating dispute letters...' },
        { step: 6, message: 'Compiling audit report...' },
      ];

      let currentStep = 0;
      const progressInterval = setInterval(function() {
        if (currentStep < progressSteps.length) {
          setProgress(progressSteps[currentStep]);
          currentStep++;
        }
      }, 600);

      const response = await fetch('/api/audit', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Audit failed');
      }

      const results = await response.json();
      setAuditResults(results);
      setStage('results');

    } catch (err) {
      setError(err.message);
      setStage('upload');
    }
  };

  const handleReset = function() {
    setStage('upload');
    setFile(null);
    setProgress({ step: 0, message: '' });
    setAuditResults(null);
    setError(null);
  };

  const handleDragOver = function(e) {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = function(e) {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = function(e) {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileSelect(droppedFile);
  };

  const formatFileSize = function(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Download functions - generate files client-side
  const downloadFile = function(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateExecutiveSummary = function() {
    if (!auditResults) return;
    const findings = auditResults.findings || [];
    const client = auditResults.client || {};
    
    const critical = findings.filter(function(f) { return f.severity === 'critical'; }).length;
    const high = findings.filter(function(f) { return f.severity === 'high'; }).length;
    const medium = findings.filter(function(f) { return f.severity === 'medium'; }).length;
    const low = findings.filter(function(f) { return f.severity === 'low'; }).length;

    let content = '═══════════════════════════════════════════════════════════════\n';
    content += '                    AXIS GROWTH LLC\n';
    content += '           CREDIT FORENSIC AUDIT - EXECUTIVE SUMMARY\n';
    content += '═══════════════════════════════════════════════════════════════\n\n';
    content += 'Client: ' + (client.name || 'N/A') + '\n';
    content += 'State: ' + (client.state || 'N/A') + '\n';
    content += 'Date: ' + new Date().toLocaleDateString() + '\n\n';
    content += '───────────────────────────────────────────────────────────────\n';
    content += '                     FINDINGS SUMMARY\n';
    content += '───────────────────────────────────────────────────────────────\n\n';
    content += 'Total Issues Found: ' + findings.length + '\n\n';
    content += '  • Critical: ' + critical + '\n';
    content += '  • High: ' + high + '\n';
    content += '  • Medium: ' + medium + '\n';
    content += '  • Low: ' + low + '\n\n';
    content += '───────────────────────────────────────────────────────────────\n';
    content += '                   TOP PRIORITY FINDINGS\n';
    content += '───────────────────────────────────────────────────────────────\n\n';

    const topFindings = findings.slice(0, 5);
    for (let i = 0; i < topFindings.length; i++) {
      const f = topFindings[i];
      content += (i + 1) + '. [' + f.severity.toUpperCase() + '] ' + f.item + '\n';
      content += '   ' + f.evidence + '\n\n';
    }

    content += '───────────────────────────────────────────────────────────────\n';
    content += '                        DISCLAIMER\n';
    content += '───────────────────────────────────────────────────────────────\n\n';
    content += 'This audit is for informational purposes only. Axis Growth LLC\n';
    content += 'does not provide legal advice. Results vary by individual file.\n';
    content += 'No specific score increases or deletions are guaranteed.\n\n';
    content += '═══════════════════════════════════════════════════════════════\n';

    const clientName = (client.name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
    downloadFile(content, clientName + '_Executive_Summary.txt');
  };

  const generateDetailedReport = function() {
    if (!auditResults) return;
    const findings = auditResults.findings || [];
    const client = auditResults.client || {};

    let content = '═══════════════════════════════════════════════════════════════\n';
    content += '                    AXIS GROWTH LLC\n';
    content += '           CREDIT FORENSIC AUDIT - DETAILED REPORT\n';
    content += '═══════════════════════════════════════════════════════════════\n\n';
    content += 'Client: ' + (client.name || 'N/A') + '\n';
    content += 'Date: ' + new Date().toLocaleDateString() + '\n';
    content += 'Total Findings: ' + findings.length + '\n\n';

    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      content += '───────────────────────────────────────────────────────────────\n';
      content += 'FINDING #' + (i + 1) + '\n';
      content += '───────────────────────────────────────────────────────────────\n';
      content += 'Item: ' + f.item + '\n';
      content += 'Type: ' + f.type + '\n';
      content += 'Severity: ' + f.severity.toUpperCase() + '\n';
      content += 'Bureau(s): ' + (f.bureausAffected || []).join(', ') + '\n\n';
      content += 'Evidence:\n' + f.evidence + '\n\n';
      content += 'Action Required:\n' + f.action + '\n\n';
      content += 'Legal Basis: ' + f.basis + '\n';
      content += 'Timeline: ' + f.timeline + '\n\n';
    }

    const clientName = (client.name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
    downloadFile(content, clientName + '_Detailed_Report.txt');
  };

  const generateActionPlan = function() {
    if (!auditResults) return;
    const findings = auditResults.findings || [];
    const client = auditResults.client || {};

    const critical = findings.filter(function(f) { return f.severity === 'critical'; });
    const high = findings.filter(function(f) { return f.severity === 'high'; });
    const medium = findings.filter(function(f) { return f.severity === 'medium'; });
    const low = findings.filter(function(f) { return f.severity === 'low'; });

    let content = '═══════════════════════════════════════════════════════════════\n';
    content += '                    AXIS GROWTH LLC\n';
    content += '                 CREDIT REPAIR ACTION PLAN\n';
    content += '═══════════════════════════════════════════════════════════════\n\n';
    content += 'Client: ' + (client.name || 'N/A') + '\n';
    content += 'Date: ' + new Date().toLocaleDateString() + '\n';
    content += 'Total Findings: ' + findings.length + '\n\n';

    if (critical.length > 0) {
      content += '───────────────────────────────────────────────────────────────\n';
      content += 'PHASE 1: CRITICAL PRIORITY (Days 1-45)\n';
      content += '───────────────────────────────────────────────────────────────\n';
      for (let i = 0; i < critical.length; i++) {
        content += '☐ ' + critical[i].item + '\n';
        content += '  Action: ' + critical[i].action + '\n\n';
      }
    }

    if (high.length > 0) {
      content += '───────────────────────────────────────────────────────────────\n';
      content += 'PHASE 2: HIGH PRIORITY (Days 45-90)\n';
      content += '───────────────────────────────────────────────────────────────\n';
      for (let i = 0; i < high.length; i++) {
        content += '☐ ' + high[i].item + '\n';
        content += '  Action: ' + high[i].action + '\n\n';
      }
    }

    if (medium.length > 0) {
      content += '───────────────────────────────────────────────────────────────\n';
      content += 'PHASE 3: MEDIUM PRIORITY (Days 90-120)\n';
      content += '───────────────────────────────────────────────────────────────\n';
      for (let i = 0; i < medium.length; i++) {
        content += '☐ ' + medium[i].item + '\n';
        content += '  Action: ' + medium[i].action + '\n\n';
      }
    }

    if (low.length > 0) {
      content += '───────────────────────────────────────────────────────────────\n';
      content += 'PHASE 4: LOW PRIORITY (Days 120+)\n';
      content += '───────────────────────────────────────────────────────────────\n';
      for (let i = 0; i < low.length; i++) {
        content += '☐ ' + low[i].item + '\n';
        content += '  Action: ' + low[i].action + '\n\n';
      }
    }

    const clientName = (client.name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
    downloadFile(content, clientName + '_Action_Plan.txt');
  };

  const generateDisputeLetters = function() {
    if (!auditResults) return;
    const findings = auditResults.findings || [];
    const client = auditResults.client || {};

    const bureauInfo = {
      TU: { name: 'TransUnion', address: 'P.O. Box 2000, Chester, PA 19016' },
      EX: { name: 'Experian', address: 'P.O. Box 4500, Allen, TX 75013' },
      EQ: { name: 'Equifax', address: 'P.O. Box 740256, Atlanta, GA 30374' }
    };

    let content = '═══════════════════════════════════════════════════════════════\n';
    content += '                    AXIS GROWTH LLC\n';
    content += '                    DISPUTE LETTERS\n';
    content += '═══════════════════════════════════════════════════════════════\n\n';

    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      const bureaus = f.bureausAffected || [];

      for (let j = 0; j < bureaus.length; j++) {
        const bureau = bureaus[j];
        const info = bureauInfo[bureau] || { name: bureau, address: 'Address not available' };

        content += '═══════════════════════════════════════════════════════════════\n';
        content += 'DISPUTE LETTER - ' + info.name + ' - Finding #' + (i + 1) + '\n';
        content += '═══════════════════════════════════════════════════════════════\n\n';
        content += new Date().toLocaleDateString() + '\n\n';
        content += info.name + '\n';
        content += info.address + '\n\n';
        content += 'RE: Dispute of Inaccurate Credit Information\n';
        content += 'Account: ' + f.item + '\n\n';
        content += 'To Whom It May Concern:\n\n';
        content += 'I am writing to dispute inaccurate information appearing on my\n';
        content += info.name + ' credit report. Under the Fair Credit Reporting Act\n';
        content += '(FCRA), I have the right to dispute incomplete or inaccurate\n';
        content += 'information.\n\n';
        content += 'DISPUTED ITEM:\n';
        content += f.item + '\n\n';
        content += 'REASON FOR DISPUTE:\n';
        content += f.evidence + '\n\n';
        content += 'LEGAL BASIS:\n';
        content += f.basis + '\n\n';
        content += 'I request that you investigate this matter and either verify\n';
        content += 'the accuracy of this information or remove/correct it from my\n';
        content += 'credit file within 30 days as required by FCRA Section 611.\n\n';
        content += 'Sincerely,\n\n';
        content += '_______________________________\n';
        content += (client.name || '[Your Name]') + '\n\n\n';
      }
    }

    const clientName = (client.name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
    downloadFile(content, clientName + '_Dispute_Letters.txt');
  };

  const generateCompletePackage = function() {
    if (!auditResults) return;
    const findings = auditResults.findings || [];
    const client = auditResults.client || {};
    const clientName = (client.name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');

    // Generate all content
    let content = '';
    
    // Executive Summary
    const critical = findings.filter(function(f) { return f.severity === 'critical'; }).length;
    const high = findings.filter(function(f) { return f.severity === 'high'; }).length;
    const medium = findings.filter(function(f) { return f.severity === 'medium'; }).length;
    const low = findings.filter(function(f) { return f.severity === 'low'; }).length;

    content += '═══════════════════════════════════════════════════════════════\n';
    content += '                    AXIS GROWTH LLC\n';
    content += '              COMPLETE CREDIT AUDIT PACKAGE\n';
    content += '═══════════════════════════════════════════════════════════════\n\n';
    content += 'Client: ' + (client.name || 'N/A') + '\n';
    content += 'State: ' + (client.state || 'N/A') + '\n';
    content += 'Date: ' + new Date().toLocaleDateString() + '\n';
    content += 'Total Issues Found: ' + findings.length + '\n\n';
    content += 'Summary: Critical(' + critical + ') High(' + high + ') Medium(' + medium + ') Low(' + low + ')\n\n';

    // All Findings
    content += '\n═══════════════════════════════════════════════════════════════\n';
    content += '                       ALL FINDINGS\n';
    content += '═══════════════════════════════════════════════════════════════\n\n';

    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      content += '───────────────────────────────────────────────────────────────\n';
      content += 'FINDING #' + (i + 1) + ' [' + f.severity.toUpperCase() + ']\n';
      content += '───────────────────────────────────────────────────────────────\n';
      content += 'Item: ' + f.item + '\n';
      content += 'Bureau(s): ' + (f.bureausAffected || []).join(', ') + '\n';
      content += 'Evidence: ' + f.evidence + '\n';
      content += 'Action: ' + f.action + '\n';
      content += 'Legal Basis: ' + f.basis + '\n\n';
    }

    // Dispute Letters
    const bureauInfo = {
      TU: { name: 'TransUnion', address: 'P.O. Box 2000, Chester, PA 19016' },
      EX: { name: 'Experian', address: 'P.O. Box 4500, Allen, TX 75013' },
      EQ: { name: 'Equifax', address: 'P.O. Box 740256, Atlanta, GA 30374' }
    };

    content += '\n═══════════════════════════════════════════════════════════════\n';
    content += '                    DISPUTE LETTERS\n';
    content += '═══════════════════════════════════════════════════════════════\n\n';

    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      const bureaus = f.bureausAffected || [];

      for (let j = 0; j < bureaus.length; j++) {
        const bureau = bureaus[j];
        const info = bureauInfo[bureau] || { name: bureau, address: 'Address not available' };

        content += '--- LETTER TO ' + info.name.toUpperCase() + ' ---\n\n';
        content += new Date().toLocaleDateString() + '\n\n';
        content += info.name + '\n' + info.address + '\n\n';
        content += 'RE: Dispute - ' + f.item + '\n\n';
        content += 'To Whom It May Concern:\n\n';
        content += 'I dispute the following information: ' + f.item + '\n\n';
        content += 'Reason: ' + f.evidence + '\n\n';
        content += 'Legal Basis: ' + f.basis + '\n\n';
        content += 'Please investigate and correct within 30 days per FCRA Section 611.\n\n';
        content += 'Sincerely,\n' + (client.name || '[Your Name]') + '\n\n';
        content += '─────────────────────────────────────────────────\n\n';
      }
    }

    content += '\n═══════════════════════════════════════════════════════════════\n';
    content += '                        DISCLAIMER\n';
    content += '═══════════════════════════════════════════════════════════════\n\n';
    content += 'This audit is for informational purposes only. Axis Growth LLC\n';
    content += 'does not provide legal advice. Results vary by individual file.\n';
    content += 'No specific score increases or deletions are guaranteed.\n';

    downloadFile(content, clientName + '_Complete_Audit_Package.txt');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-blue-800 text-white shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                <span className="text-blue-800 font-bold text-lg">AG</span>
              </div>
              <div>
                <div className="font-bold text-lg tracking-tight">Axis Growth</div>
                <div className="text-xs text-blue-200 -mt-1">Credit Forensic Audit</div>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#" className="text-white/90 hover:text-white text-sm font-medium">Dashboard</a>
              <a href="#" className="text-white/90 hover:text-white text-sm font-medium">Audit History</a>
              <a href="#" className="text-white/90 hover:text-white text-sm font-medium">Pricing</a>
            </nav>
            <button className="bg-white text-blue-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-50">
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        {/* Upload Stage */}
        {stage === 'upload' && (
          <>
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                Credit Forensic <span className="text-blue-700">Audit</span>
              </h1>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Upload a 3-bureau credit report and get a complete forensic analysis 
                with dispute letters in under 30 seconds.
              </p>
            </div>

            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div
                  className={"p-12 border-2 border-dashed rounded-xl m-4 transition-all cursor-pointer " + 
                    (isDragging ? "border-blue-600 bg-blue-50" : 
                    file ? "border-green-400 bg-green-50" : 
                    "border-gray-300 hover:border-blue-600 hover:bg-gray-50")}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={function() { fileInputRef.current && fileInputRef.current.click(); }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={function(e) { handleFileSelect(e.target.files[0]); }}
                    className="hidden"
                  />

                  <div className="text-center">
                    {!file ? (
                      <>
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <p className="text-lg font-medium text-gray-700 mb-2">
                          Drop your credit report here
                        </p>
                        <p className="text-sm text-gray-500 mb-4">or click to browse</p>
                        <p className="text-xs text-gray-400">Supports PDF files from IdentityIQ, MyFreeScoreNow, SmartCredit, etc.</p>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-lg font-medium text-gray-700 mb-1">{file.name}</p>
                        <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                      </>
                    )}
                  </div>
                </div>

                {file && (
                  <div className="px-4 pb-4">
                    <button
                      onClick={handleStartAudit}
                      className="w-full bg-blue-700 text-white py-4 rounded-xl font-semibold text-lg hover:bg-blue-800 transition-colors"
                    >
                      🔍 Run Forensic Audit
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  <strong>Error:</strong> {error}
                </div>
              )}

              {/* Features */}
              <div className="mt-16 grid md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="text-3xl mb-3">🔍</div>
                  <h3 className="font-semibold text-gray-900 mb-2">17 Detection Rules</h3>
                  <p className="text-gray-600 text-sm">FCRA, FDCPA, and FCBA compliance checks across all three bureaus</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="text-3xl mb-3">📄</div>
                  <h3 className="font-semibold text-gray-900 mb-2">Auto-Generated Letters</h3>
                  <p className="text-gray-600 text-sm">Professional dispute letters with evidence citations for every finding</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="text-3xl mb-3">⚡</div>
                  <h3 className="font-semibold text-gray-900 mb-2">Instant Results</h3>
                  <p className="text-gray-600 text-sm">Complete audit package ready in under 30 seconds</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Processing Stage */}
        {stage === 'processing' && (
          <div className="max-w-xl mx-auto text-center py-20">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Analyzing Credit Report</h2>
            <p className="text-gray-600 mb-8">{progress.message}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-500"
                style={{ width: ((progress.step / 6) * 100) + '%' }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-4">Step {progress.step} of 6</p>
          </div>
        )}

        {/* Results Stage */}
        {stage === 'results' && auditResults && (
          <div className="max-w-4xl mx-auto">
            {/* Summary Header */}
            <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white rounded-2xl p-8 mb-8">
              <h1 className="text-3xl font-bold mb-2">Audit Complete</h1>
              <p className="text-blue-100 mb-6">
                {auditResults.client && auditResults.client.name ? auditResults.client.name : 'Client'} | {auditResults.findings ? auditResults.findings.length : 0} issues detected
              </p>
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold">{auditResults.findings ? auditResults.findings.length : 0}</div>
                  <div className="text-sm text-blue-200">Total Issues</div>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-purple-300">
                    {auditResults.findings ? auditResults.findings.filter(function(f) { return f.severity === 'critical'; }).length : 0}
                  </div>
                  <div className="text-sm text-blue-200">Critical</div>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-red-300">
                    {auditResults.findings ? auditResults.findings.filter(function(f) { return f.severity === 'high'; }).length : 0}
                  </div>
                  <div className="text-sm text-blue-200">High</div>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-yellow-300">
                    {auditResults.findings ? auditResults.findings.filter(function(f) { return f.severity === 'medium'; }).length : 0}
                  </div>
                  <div className="text-sm text-blue-200">Medium</div>
                </div>
              </div>
            </div>

            {/* Download Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">📦 Download Audit Package</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <button
                  onClick={generateExecutiveSummary}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📋</span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Executive Summary</div>
                    <div className="text-sm text-gray-500">1-page overview (TXT)</div>
                  </div>
                </button>
                <button
                  onClick={generateDetailedReport}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📑</span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Detailed Report</div>
                    <div className="text-sm text-gray-500">Full findings (TXT)</div>
                  </div>
                </button>
                <button
                  onClick={generateActionPlan}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📅</span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Action Plan</div>
                    <div className="text-sm text-gray-500">4-phase timeline (TXT)</div>
                  </div>
                </button>
                <button
                  onClick={generateDisputeLetters}
                  className="flex items-center gap-4 p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors border-2 border-green-200 text-left"
                >
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">✉️</span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Dispute Letters</div>
                    <div className="text-sm text-gray-500">All letters (TXT)</div>
                  </div>
                </button>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={generateCompletePackage}
                  className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-4 rounded-xl font-semibold hover:bg-blue-800 transition-colors"
                >
                  ⬇️ Download Complete Package
                </button>
              </div>
            </div>

            {/* Findings Preview */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">🔍 Top Findings</h2>
              <div className="space-y-3">
                {auditResults.findings && auditResults.findings.slice(0, 5).map(function(finding, i) {
                  return (
                    <div key={i} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                      <div className={"px-2 py-1 rounded text-xs font-bold uppercase " + 
                        (finding.severity === 'critical' ? 'bg-purple-100 text-purple-700' :
                        finding.severity === 'high' ? 'bg-red-100 text-red-700' :
                        finding.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700')}>
                        {finding.severity}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{finding.item}</div>
                        <div className="text-sm text-gray-600">{finding.evidence}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={handleReset}
                className="flex-1 bg-gray-100 text-gray-700 py-4 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                ← Run Another Audit
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          <p>© 2025 Axis Growth LLC. All rights reserved.</p>
          <p className="mt-1">This tool is for informational purposes only and does not constitute legal advice.</p>
        </div>
      </footer>
    </div>
  );
}
