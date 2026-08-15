import { useState } from 'react';
import { CallView } from './components/CallView';
import { ReportView } from './components/ReportView';
import type { AppView, HealthReport } from './types';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('call');
  const [report, setReport] = useState<HealthReport | null>(null);

  const handleReportReady = (newReport: HealthReport) => {
    setReport(newReport);
    setCurrentView('report');
  };

  const handleNewCall = () => {
    setReport(null);
    setCurrentView('call');
  };

  return (
    <div className="app">
      <div className="app-bg">
        <div className="bg-gradient bg-1"></div>
        <div className="bg-gradient bg-2"></div>
        <div className="bg-gradient bg-3"></div>
      </div>
      <main className="app-main">
        {currentView === 'call' && <CallView onReportReady={handleReportReady} />}
        {currentView === 'report' && report && (
          <ReportView report={report} onNewCall={handleNewCall} />
        )}
      </main>
    </div>
  );
}

export default App;
