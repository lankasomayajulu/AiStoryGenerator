import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import MainPage from './pages/MainPage';
import ProjectPage from './pages/ProjectPage';
import ProjectPlanningPageV2 from './pages/ProjectPlanningPageV2';
import PDFToTextPage from './pages/PDFToTextPage';
import PDFToJpegPage from './pages/PDFToJpegPage';
import ImageGeneratorPage from './pages/ImageGeneratorPage';
import AiLogsPage from './pages/AiLogsPage';
import LogSummaryPage from './pages/LogSummaryPage';
import './App.css';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/main" element={<MainPage />} />
          <Route path="/project/:projectId" element={<ProjectPage />} />
          <Route path="/project/:projectId/plan" element={<ProjectPlanningPageV2 />} />
          <Route path="/pdf-to-text" element={<PDFToTextPage />} />
          <Route path="/pdf-to-jpeg" element={<PDFToJpegPage />} />
          <Route path="/image-generator" element={<ImageGeneratorPage />} />
          <Route path="/logs" element={<AiLogsPage />} />
          <Route path="/log-summary" element={<LogSummaryPage />} />
          <Route path="/" element={<Navigate to="/main" replace />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
