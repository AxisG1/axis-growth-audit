'use client';

import { useState, useCallback, useRef } from 'react';

export default function Home() {
  const [stage, setStage] = useState('upload');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState({ step: 0, message: '' });
  const [auditResults, setAuditResults] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (selectedFile) => {
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Please upload a PDF file');
    }
  };

  const handleStartAudit = async () => {
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
      const progressInterval = setInterval(() => {
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

  const handleReset = () => {
    setStage('upload');
    setFile(null);
    setProgress({ step: 0, message: '' });
    setAuditResults(null);
    setError(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileSelect(droppedFile);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-axis-blue text-white shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                <span className="text-axis-blue font-bold text-lg">AG</span>
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
            <button className="bg-white text-axis-blue px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-50">
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
                Credit Forensic <span className="text-axis-blue">Audit</span>
              </h1>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Upload a 3-bureau credit report and get a complete forensic analysis 
                with dispute letters in under 30 seconds.
              </p>
            </div>

            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div
                  className={`p-12 border-2 border-dashed rounded-xl m-4 transition-all cursor-pointer ${
                    isDragging
                      ? 'border-axis-blue bg-blue-50 dropzone-active'
                      : file
                      ? 'border-green-400 bg-green-50'
                      : 'border-gray-300 hover:border-axis-blue hover:bg-gray-50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handleFileSelect(e.target.files[0])}
                    className="hidden"
                  />

                  <div className="text-center">
                    {!file ? (
                      <>
                        <div className="w-16 h-16 bg-axis-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-axis-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      className="w-full bg-axis-blue text-white py-4 rounded-xl font-semibold text-lg hover:bg-axis-blue-dark transition-colors"
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
            <div className="w-20 h-20 bg-axis-blue/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <div className="w-12 h-12 border-4 border-axis-blue border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Analyzing Credit Report</h2>
            <p className="text-gray-600 mb-8">{progress.message}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div 
                className="progress-bar h-full rounded-full transition-all duration-500"
                style={{ width: `${(progress.step / 6) * 100}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-4">Step {progress.step} of 6</p>
          </div>
        )}

        {/* Results Stage */}
        {stage === 'results' && auditResults && (
          <div className="max-w-4xl mx-auto">
            {/* Summary Header */}
            <div className="bg-gradient-to-r from-axis-blue to-axis-blue-dark text-white rounded-2xl p-8 mb-8">
              <h1 className="text-3xl font-bold mb-2">Audit Complete</h1>
              <p className="text-blue-100 mb-6">
                {auditResults.client?.name || 'Client'} | {auditResults.findings?.length || 0} issues detected
              </p>
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold">{auditResults.findings?.length || 0}</div>
                  <div className="text-sm text-blue-200">Total Issues</div>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-purple-300">
                    {auditResults.findings?.filter(f => f.severity === 'critical').length || 0}
                  </div>
                  <div className="text-sm text-blue-200">Critical</div>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-red-300">
                    {auditResults.findings?.filter(f => f.severity === 'high').length || 0}
                  </div>
                  <div className="text-sm text-blue-200">High</div>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-yellow-300">
                    {auditResults.findings?.filter(f => f.severity === 'medium').length || 0}
                  </div>
                  <div className="text-sm text-blue-200">Medium</div>
                </div>
              </div>
            </div>

            {/* Download Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">📦 Download Audit Package</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <a
                  href={`/api/download?id=${auditResults.auditId}&type=summary`}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="w-12 h-12 bg-axis-blue/10 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📋</span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Executive Summary</div>
                    <div className="text-sm text-gray-500">1-page overview (DOCX)</div>
                  </div>
                </a>
                <a
                  href={`/api/download?id=${auditResults.auditId}&type=report`}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="w-12 h-12 bg-axis-blue/10 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📑</span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Detailed Report</div>
                    <div className="text-sm text-gray-500">Full findings (DOCX)</div>
                  </div>
                </a>
                <a
                  href={`/api/download?id=${auditResults.auditId}&type=plan`}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="w-12 h-12 bg-axis-blue/10 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📅</span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Action Plan</div>
                    <div className="text-sm text-gray-500">4-phase timeline (DOCX)</div>
                  </div>
                </a>
                <a
                  href={`/api/download?id=${auditResults.auditId}&type=letters`}
                  className="flex items-center gap-4 p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors border-2 border-green-200"
                >
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">✉️</span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Dispute Letters</div>
                    <div className="text-sm text-gray-500">All letters (ZIP)</div>
                  </div>
                </a>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <a
                  href={`/api/download?id=${auditResults.auditId}&type=all`}
                  className="w-full flex items-center justify-center gap-2 bg-axis-blue text-white py-4 rounded-xl font-semibold hover:bg-axis-blue-dark transition-colors"
                >
                  ⬇️ Download Complete Package (ZIP)
                </a>
              </div>
            </div>

            {/* Findings Preview */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">🔍 Top Findings</h2>
              <div className="space-y-3">
                {auditResults.findings?.slice(0, 5).map((finding, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                    <div className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                      finding.severity === 'critical' ? 'bg-purple-100 text-purple-700' :
                      finding.severity === 'high' ? 'bg-red-100 text-red-700' :
                      finding.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {finding.severity}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{finding.item}</div>
                      <div className="text-sm text-gray-600">{finding.evidence}</div>
                    </div>
                  </div>
                ))}
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
