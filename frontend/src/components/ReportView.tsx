import type { HealthReport } from '../types';
import './ReportView.css';

interface ReportViewProps {
  report: HealthReport;
  onNewCall: () => void;
}

export function ReportView({ report, onNewCall }: ReportViewProps) {
  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-report-${report.reportId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCompletenessColor = () => {
    switch (report.completeness) {
      case 'complete':
        return '#22c55e';
      case 'partial':
        return '#f59e0b';
      case 'minimal':
        return '#ef4444';
    }
  };

  const getCompletenessLabel = () => {
    switch (report.completeness) {
      case 'complete':
        return 'Complete Screening';
      case 'partial':
        return 'Partial Screening';
      case 'minimal':
        return 'Minimal Data Collected';
    }
  };

  const getSeverityColor = (severity: string | null) => {
    switch (severity?.toLowerCase()) {
      case 'mild':
        return '#22c55e';
      case 'moderate':
        return '#f59e0b';
      case 'severe':
        return '#ef4444';
      default:
        return '#94a3b8';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'urgent':
        return '#ef4444';
      case 'soon':
        return '#f59e0b';
      case 'routine':
        return '#22c55e';
      default:
        return '#94a3b8';
    }
  };

  return (
    <div className="report-view">
      {/* Header */}
      <div className="report-header">
        <div className="report-header-top">
          <h1 className="report-title">
            <span>🏥</span> Health Screening Report
          </h1>
          <span
            className="completeness-badge"
            style={{ color: getCompletenessColor(), borderColor: getCompletenessColor() }}
          >
            {getCompletenessLabel()}
          </span>
        </div>
        <div className="report-meta">
          <span>📅 {new Date(report.generatedAt).toLocaleString()}</span>
          <span>⏱️ Duration: {report.callDuration}</span>
          <span>🌐 Language: {report.language === 'hi' ? 'Hindi' : report.language === 'en' ? 'English' : report.language || 'English'}</span>
        </div>
      </div>

      {/* Patient Info */}
      <section className="report-section">
        <h2 className="section-title">Patient Information</h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Name</span>
            <span className="info-value">{report.patientInfo.name || 'Not provided'}</span>
          </div>
        </div>
      </section>

      {/* Primary Concern */}
      <section className="report-section">
        <h2 className="section-title">Primary Concern</h2>
        {report.primaryConcern.complaint ? (
          <div className="concern-card">
            <h3 className="concern-complaint">{report.primaryConcern.complaint}</h3>
            {report.primaryConcern.description && (
              <p className="concern-description">{report.primaryConcern.description}</p>
            )}
          </div>
        ) : (
          <p className="no-data">No primary concern was identified during the screening.</p>
        )}
      </section>

      {/* Symptoms */}
      {report.symptoms.length > 0 && (
        <section className="report-section">
          <h2 className="section-title">Reported Symptoms</h2>
          <div className="symptoms-list">
            {report.symptoms.map((symptom, index) => (
              <div key={index} className="symptom-card">
                <div className="symptom-header">
                  <span className="symptom-name">{symptom.name}</span>
                  {symptom.severity && (
                    <span
                      className="severity-badge"
                      style={{ color: getSeverityColor(symptom.severity) }}
                    >
                      {symptom.severity}
                    </span>
                  )}
                </div>
                <div className="symptom-details">
                  {symptom.duration && (
                    <span className="symptom-detail">
                      <strong>Duration:</strong> {symptom.duration}
                    </span>
                  )}
                  {symptom.frequency && (
                    <span className="symptom-detail">
                      <strong>Frequency:</strong> {symptom.frequency}
                    </span>
                  )}
                  {symptom.notes && (
                    <span className="symptom-detail">
                      <strong>Notes:</strong> {symptom.notes}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Overall Severity */}
      {report.overallSeverity && (
        <section className="report-section">
          <h2 className="section-title">Overall Severity Assessment</h2>
          <div className="severity-display">
            <span
              className="severity-indicator"
              style={{
                color: getSeverityColor(report.overallSeverity),
                borderColor: getSeverityColor(report.overallSeverity),
              }}
            >
              {report.overallSeverity.charAt(0).toUpperCase() + report.overallSeverity.slice(1)}
            </span>
          </div>
        </section>
      )}

      {/* Follow-up Flags */}
      {report.followUpFlags.length > 0 && (
        <section className="report-section">
          <h2 className="section-title">⚠️ Follow-up Recommendations</h2>
          <div className="flags-list">
            {report.followUpFlags.map((flag, index) => (
              <div key={index} className="flag-card">
                <div className="flag-header">
                  <span className="flag-name">{flag.flag}</span>
                  <span
                    className="urgency-badge"
                    style={{
                      color: getUrgencyColor(flag.urgency),
                      borderColor: getUrgencyColor(flag.urgency),
                    }}
                  >
                    {flag.urgency}
                  </span>
                </div>
                <p className="flag-reason">{flag.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Summary */}
      <section className="report-section">
        <h2 className="section-title">Conversation Summary</h2>
        <p className="summary-text">{report.conversationSummary}</p>
      </section>

      {/* Missing Information */}
      {report.missingInformation.length > 0 && (
        <section className="report-section">
          <h2 className="section-title">Missing Information</h2>
          <ul className="missing-list">
            {report.missingInformation.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Transcript */}
      {report.transcript.length > 0 && (
        <section className="report-section">
          <h2 className="section-title">Full Transcript</h2>
          <div className="transcript-log">
            {report.transcript.map((entry, index) => (
              <div key={index} className={`transcript-entry ${entry.role}`}>
                <span className="transcript-role">
                  {entry.role === 'user' ? 'Patient' : 'Agent'}:
                </span>
                <span className="transcript-text">{entry.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Disclaimer */}
      <div className="disclaimer">
        <span className="disclaimer-icon">ℹ️</span>
        <p>{report.disclaimer}</p>
      </div>

      {/* Actions */}
      <div className="report-actions">
        <button className="btn btn-primary" onClick={onNewCall}>
          <span>📞</span> Start New Screening
        </button>
        <button className="btn btn-secondary" onClick={handleDownload}>
          <span>📥</span> Download Report (JSON)
        </button>
      </div>
    </div>
  );
}
