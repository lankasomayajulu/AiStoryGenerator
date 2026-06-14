import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiLogsApi } from '../services/api';
import { formatCell, formatCost } from '../utils/logFormat';
import {
  createWorkbookFromSheets,
  downloadWorkbook,
  formatExportDate,
  formatExportNumber,
} from '../utils/excelExport';
import { useStatusBar } from '../context/StatusBarContext';
import './LogSummaryPage.css';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const LogSummaryPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { showStatus, clearStatus } = useStatusBar();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [paginated, setPaginated] = useState({
    items: [],
    total: 0,
    totalPages: 1,
  });

  const [dailyCosts, setDailyCosts] = useState([]);

  const loadPaginated = useCallback(async () => {
    const response = await aiLogsApi.listPaginated(page, pageSize);
    setPaginated({
      items: response.data.items || [],
      total: response.data.total || 0,
      totalPages: response.data.totalPages || 1,
    });
  }, [page, pageSize]);

  const loadDailyCosts = useCallback(async () => {
    const response = await aiLogsApi.getDailyCosts();
    setDailyCosts(response.data.items || []);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      clearStatus();
      showStatus('Loading log summary…', 'info', { persist: true });
      await Promise.all([loadPaginated(), loadDailyCosts()]);
      clearStatus();
    } catch (err) {
      showStatus(err.response?.data?.error || err.message || 'Failed to load log summary', 'error');
    } finally {
      setLoading(false);
    }
  }, [loadPaginated, loadDailyCosts, clearStatus, showStatus]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      clearStatus();
      showStatus('Exporting log summary…', 'info', { persist: true });

      const [listResponse, dailyResponse] = await Promise.all([
        aiLogsApi.list(),
        aiLogsApi.getDailyCosts(),
      ]);

      const allItems = listResponse.data.items || [];
      const dailyItems = dailyResponse.data.items || [];

      const detailsHeader = [
        'Date & Time',
        'Input Tokens',
        'Output Tokens',
        'Cost (USD)',
        'Finish Reason',
      ];

      const detailsRows = allItems.map((row) => [
        formatExportDate(row.createdAt),
        formatExportNumber(row.inputTokens),
        formatExportNumber(row.outputTokens),
        formatExportNumber(row.costUsd),
        row.finishReason ?? '',
      ]);

      detailsRows.push(['Count', '', '', '', allItems.length]);

      const dailyHeader = ['Date', 'Request Count', 'Total Cost (USD)'];
      const dailyRows = dailyItems.map((row) => [
        row.date,
        row.requestCount,
        formatExportNumber(row.totalCostUsd),
      ]);

      const workbook = createWorkbookFromSheets([
        { name: 'Log Details', data: [detailsHeader, ...detailsRows] },
        { name: 'Daily Summary', data: [dailyHeader, ...dailyRows] },
      ]);

      const stamp = new Date().toISOString().slice(0, 10);
      downloadWorkbook(workbook, `ai-log-summary-${stamp}.xlsx`);
      showStatus('Excel export downloaded', 'success');
    } catch (err) {
      showStatus(err.response?.data?.error || err.message || 'Failed to export Excel', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handlePageSizeChange = (event) => {
    setPageSize(Number(event.target.value));
    setPage(1);
  };

  return (
    <div className="ai-log-summary-page">
      <div className="ai-log-summary-toolbar">
        <button type="button" className="btn-back-summary" onClick={() => navigate('/main')}>
          ← Back to main
        </button>
        <h1>AI Log Summary</h1>
        <button type="button" className="btn-nav-logs" onClick={() => navigate('/logs')}>
          View full logs
        </button>
        <button type="button" className="btn-refresh-summary" onClick={loadAll} disabled={loading}>
          Refresh
        </button>
        <button
          type="button"
          className="btn-export-summary"
          onClick={handleExportExcel}
          disabled={exporting || loading}
        >
          {exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
      </div>

      <p className="ai-log-summary-intro">
        Paginated overview of stored AI request metrics. Export includes all log entries (not just the current page)
        plus a daily cost breakdown on a second sheet.
      </p>

      <div className="ai-log-summary-tabs">
        <button
          type="button"
          className={activeTab === 'details' ? 'ai-log-summary-tab ai-log-summary-tab-active' : 'ai-log-summary-tab'}
          onClick={() => setActiveTab('details')}
        >
          Log details
        </button>
        <button
          type="button"
          className={activeTab === 'summary' ? 'ai-log-summary-tab ai-log-summary-tab-active' : 'ai-log-summary-tab'}
          onClick={() => setActiveTab('summary')}
        >
          Daily summary
        </button>
      </div>

      <div className="ai-log-summary-panel">
        {loading ? (
          <div className="ai-log-summary-muted">Loading…</div>
        ) : activeTab === 'details' ? (
          <>
            <div className="ai-log-summary-actions">
              <span className="ai-log-summary-muted">
                Showing {paginated.items.length} of {paginated.total} entries
              </span>
            </div>
            <div className="ai-log-summary-table-wrap">
              <table className="ai-log-summary-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Input Tokens</th>
                    <th>Output Tokens</th>
                    <th>Cost</th>
                    <th>Finish Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="ai-log-summary-muted">
                        No log entries yet.
                      </td>
                    </tr>
                  ) : (
                    paginated.items.map((row) => (
                      <tr key={row._id}>
                        <td>{new Date(row.createdAt).toLocaleString()}</td>
                        <td>{formatCell(row.inputTokens)}</td>
                        <td>{formatCell(row.outputTokens)}</td>
                        <td>{formatCost(row.costUsd)}</td>
                        <td>{formatCell(row.finishReason)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="ai-log-summary-pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span>
                Page {page} of {paginated.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= paginated.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
              <label className="ai-log-summary-page-size">
                Rows per page
                <select value={pageSize} onChange={handlePageSizeChange}>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="ai-log-summary-actions">
              <span className="ai-log-summary-muted">{dailyCosts.length} day(s) with activity</span>
            </div>
            <div className="ai-log-summary-table-wrap">
              <table className="ai-log-summary-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Request Count</th>
                    <th>Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyCosts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="ai-log-summary-muted">
                        No cost data yet.
                      </td>
                    </tr>
                  ) : (
                    dailyCosts.map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td>{formatCell(row.requestCount)}</td>
                        <td>{formatCost(row.totalCostUsd)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LogSummaryPage;
