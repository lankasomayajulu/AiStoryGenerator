import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiLogsApi } from '../services/api';
import { formatCell } from '../utils/logFormat';
import {
  createWorkbookFromSheets,
  downloadWorkbook,
  formatExportDate,
  formatExportNumber,
  toExcelCellText,
} from '../utils/excelExport';
import { useStatusBar } from '../context/StatusBarContext';
import './AiLogsPage.css';

const monthKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
};

const pickImageUrl = (img) => {
  if (!img || typeof img !== 'object') return null;
  return (
    img.image_url?.url ||
    img.image_url?.data ||
    img.imageUrl?.url ||
    img.imageUrl?.data ||
    null
  );
};

const collectImageUrlsFromMessage = (message) => {
  const urls = [];
  if (!message || typeof message !== 'object') return urls;
  if (Array.isArray(message.images)) {
    for (const img of message.images) {
      const u = pickImageUrl(img);
      if (typeof u === 'string' && u.trim()) urls.push(u.trim());
    }
  }
  const content = message.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      if (part.type === 'image_url' && part.image_url) {
        const u = typeof part.image_url === 'string' ? part.image_url : part.image_url.url || part.image_url.data;
        if (typeof u === 'string' && u.trim()) urls.push(u.trim());
      }
    }
  }
  return urls;
};

const extractAssistantPlainText = (response) => {
  if (response == null) return '';
  if (typeof response === 'string') return response;
  if (typeof response !== 'object') return String(response);

  const c0 = Array.isArray(response.choices) ? response.choices[0] : null;
  const msg = c0?.message;
  if (!msg) return '';

  const content = msg.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textParts = [];
    for (const part of content) {
      if (typeof part === 'string') textParts.push(part);
      else if (part && typeof part === 'object') {
        if (part.type === 'text' && typeof part.text === 'string') textParts.push(part.text);
        else if (typeof part.text === 'string') textParts.push(part.text);
      }
    }
    return textParts.join('\n').trim();
  }
  return '';
};

const classifyCompleteResponse = (response) => {
  if (response == null) return { kind: 'none' };
  const imageUrls = [];
  if (typeof response === 'object') {
    const c0 = Array.isArray(response.choices) ? response.choices[0] : null;
    if (c0?.message) imageUrls.push(...collectImageUrlsFromMessage(c0.message));
  }
  const uniqueImages = [...new Set(imageUrls)];
  if (uniqueImages.length > 0) return { kind: 'images', urls: uniqueImages, raw: response };

  const text = extractAssistantPlainText(response);
  if (text && text.trim()) return { kind: 'text', text, raw: response };

  if (typeof response === 'object' && Object.keys(response).length > 0) {
    return { kind: 'json', raw: response };
  }
  return { kind: 'none' };
};

const AiLogsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const { showStatus, clearStatus } = useStatusBar();
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingMonth, setDeletingMonth] = useState(null);
  const [exporting, setExporting] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of items) {
      const k = monthKey(row.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(row);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  }, [items]);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      clearStatus();
      showStatus('Loading logs…', 'info', { persist: true });
      const response = await aiLogsApi.list();
      const next = response.data.items || [];
      setItems(next);
      setSelectedId((prev) => {
        if (prev && next.some((x) => x._id === prev)) return prev;
        return next[0]?._id || null;
      });
      clearStatus();
    } catch (err) {
      showStatus(err.response?.data?.error || err.message || 'Failed to load logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [clearStatus, showStatus]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setDetailLoading(true);
        const res = await aiLogsApi.getById(selectedId);
        if (!cancelled) setDetail(res.data);
      } catch (err) {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleDeleteOne = async (id) => {
    if (!window.confirm('Delete this log entry permanently?')) return;
    try {
      await aiLogsApi.delete(id);
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
      }
      await loadList();
    } catch (err) {
      showStatus(err.response?.data?.error || err.message, 'error');
    }
  };

  const handleDeleteMonth = async (key) => {
    const [y, m] = key.split('-');
    const label = monthLabel(key);
    if (!window.confirm(`Delete ALL logs for ${label}? This cannot be undone.`)) return;
    try {
      setDeletingMonth(key);
      await aiLogsApi.deleteMonthYear(y, m);
      setSelectedId(null);
      setDetail(null);
      await loadList();
    } catch (err) {
      showStatus(err.response?.data?.error || err.message, 'error');
    } finally {
      setDeletingMonth(null);
    }
  };

  const writeClipboardText = async (text, successMessage) => {
    try {
      await navigator.clipboard.writeText(text);
      showStatus(successMessage, 'success');
    } catch (err) {
      showStatus(err?.message || 'Failed to copy to clipboard', 'error');
    }
  };

  const handleCopyFullRequest = async () => {
    if (!detail) return;
    const requestText =
      typeof detail.request === 'object'
        ? JSON.stringify(detail.request, null, 2)
        : String(detail.request ?? '');
    await writeClipboardText(requestText, 'Copied full request JSON to clipboard');
  };

  const handleCopyRequestContent = async () => {
    if (!detail) return;
    const request = detail.request;
    let content = '';

    if (request && typeof request === 'object') {
      if (Array.isArray(request.messages)) {
        content = request.messages
          .map((msg) => {
            if (!msg || typeof msg !== 'object') return '';
            const role = msg.role ? `[${msg.role}] ` : '';
            if (typeof msg.content === 'string') return `${role}${msg.content}`;
            if (Array.isArray(msg.content)) {
              return `${role}${msg.content
                .map((part) => {
                  if (typeof part === 'string') return part;
                  if (part && typeof part === 'object') {
                    if (typeof part.text === 'string') return part.text;
                    return JSON.stringify(part);
                  }
                  return '';
                })
                .filter(Boolean)
                .join('\n')}`;
            }
            if (msg.content != null) return `${role}${JSON.stringify(msg.content)}`;
            return '';
          })
          .filter(Boolean)
          .join('\n\n');
      } else if (typeof request.prompt === 'string') {
        content = request.prompt;
      } else if (typeof request.content === 'string') {
        content = request.content;
      } else if (request.input != null) {
        content = typeof request.input === 'string' ? request.input : JSON.stringify(request.input, null, 2);
      }
    } else {
      content = String(request ?? '');
    }

    await writeClipboardText(content || '', 'Copied request content to clipboard');
  };

  const handleCopyFullResponse = async () => {
    if (!detail || detail.response == null) return;
    const text =
      typeof detail.response === 'object'
        ? JSON.stringify(detail.response, null, 2)
        : String(detail.response);
    await writeClipboardText(text, 'Copied full response JSON to clipboard');
  };

  const handleCopyResponseText = async () => {
    if (!detail) return;
    const text = extractAssistantPlainText(detail.response);
    await writeClipboardText(text, 'Copied response text to clipboard');
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      clearStatus();
      showStatus('Exporting logs to Excel…', 'info', { persist: true });
      const response = await aiLogsApi.exportAll();
      const rows = response.data.items || [];

      const header = [
        'Date & Time',
        'Request Type',
        'Operation',
        'Model',
        'Input Tokens',
        'Output Tokens',
        'Total Tokens',
        'Cost (USD)',
        'Finish Reason',
        'Error',
        'Request (JSON)',
        'Response (JSON)',
        'Trimmed Input',
        'Trimmed Output',
      ];

      const dataRows = rows.map((row) => {
        const requestCell = toExcelCellText(row.request);
        const responseCell = toExcelCellText(row.response);
        const errorCell = toExcelCellText(row.errorMessage);
        return [
          formatExportDate(row.createdAt),
          row.requestType ?? '',
          row.operation ?? '',
          row.model ?? '',
          formatExportNumber(row.inputTokens),
          formatExportNumber(row.outputTokens),
          formatExportNumber(row.totalTokens),
          formatExportNumber(row.costUsd),
          row.finishReason ?? '',
          errorCell.text,
          requestCell.text,
          responseCell.text,
          requestCell.trimmed,
          responseCell.trimmed,
        ];
      });

      const workbook = createWorkbookFromSheets([
        { name: 'AI Logs', data: [header, ...dataRows] },
      ]);

      const stamp = new Date().toISOString().slice(0, 10);
      downloadWorkbook(workbook, `ai-logs-${stamp}.xlsx`);
      showStatus('Excel export downloaded', 'success');
    } catch (err) {
      showStatus(err.response?.data?.error || err.message || 'Failed to export Excel', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="ai-logs-page">
      <div className="ai-logs-toolbar">
        <button type="button" className="btn-back-logs" onClick={() => navigate('/main')}>
          ← Back to main
        </button>
        <h1>OpenRouter AI Logs</h1>
        <button type="button" className="btn-nav-summary" onClick={() => navigate('/log-summary')}>
          Log summary
        </button>
        <button
          type="button"
          className="btn-export-logs"
          onClick={handleExportExcel}
          disabled={exporting || loading}
        >
          {exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
        <button type="button" className="btn-refresh-logs" onClick={loadList}>
          Refresh
        </button>
      </div>
      <p className="ai-logs-intro">
        Left: entries grouped by month. Select a row to decrypt the saved request and complete response on the right.
        Payloads are stored encrypted in MongoDB (<code>AI Logs</code>).
      </p>

      <div className="ai-logs-split">
        <aside className="ai-logs-left" aria-label="Log entries by month">
          {grouped.length === 0 && !loading ? (
            <div className="ai-logs-muted">No log entries yet.</div>
          ) : (
            grouped.map(([key, rows]) => (
              <div key={key} className="ai-logs-month-block">
                <div className="ai-logs-month-head">
                  <span>{monthLabel(key)}</span>
                  <button
                    type="button"
                    className="btn-delete-month"
                    disabled={!!deletingMonth}
                    onClick={() => handleDeleteMonth(key)}
                  >
                    Delete month
                  </button>
                </div>
                <ul className="ai-logs-list">
                  {rows.map((row) => (
                    <li key={row._id}>
                      <button
                        type="button"
                        className={
                          selectedId === row._id ? 'ai-log-row ai-log-row-active' : 'ai-log-row'
                        }
                        onClick={() => setSelectedId(row._id)}
                      >
                        <span className="ai-log-row-time">{new Date(row.createdAt).toLocaleString()}</span>
                        <span className="ai-log-row-op">{formatCell(row.requestType)}</span>
                        <span className="ai-log-row-sub">{formatCell(row.operation)}</span>
                      </button>
                      <button
                        type="button"
                        className="btn-delete-one"
                        title="Delete this log"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOne(row._id);
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </aside>

        <main className="ai-logs-right" aria-label="Log detail">
          {detailLoading && <div className="ai-logs-muted">Decrypting detail…</div>}
          {!detailLoading && !detail && (
            <div className="ai-logs-muted">Select an entry from the left to load the decrypted request.</div>
          )}
          {!detailLoading && detail && (
            <div className="ai-log-detail-card">
              <div className="ai-log-detail-grid">
                <div>
                  <div className="dl-label">Time</div>
                  <div>{new Date(detail.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <div className="dl-label">Request type</div>
                  <div>{formatCell(detail.requestType)}</div>
                </div>
                <div>
                  <div className="dl-label">Operation</div>
                  <div>{formatCell(detail.operation)}</div>
                </div>
                <div>
                  <div className="dl-label">Model</div>
                  <div className="wrap">{formatCell(detail.model)}</div>
                </div>
                <div>
                  <div className="dl-label">Input tokens</div>
                  <div>{formatCell(detail.inputTokens)}</div>
                </div>
                <div>
                  <div className="dl-label">Output tokens</div>
                  <div>{formatCell(detail.outputTokens)}</div>
                </div>
                <div>
                  <div className="dl-label">Cost (API)</div>
                  <div>{formatCell(detail.costUsd)}</div>
                </div>
                <div>
                  <div className="dl-label">Finish reason</div>
                  <div>{formatCell(detail.finishReason)}</div>
                </div>
                <div className="span-2">
                  <div className="dl-label">Error</div>
                  <div className="wrap">{detail.errorMessage ? detail.errorMessage : '—'}</div>
                </div>
              </div>
              <div className="dl-label mt">Decrypted request (JSON)</div>
              <div className="ai-logs-copy-actions">
                <button type="button" className="btn-copy-request" onClick={handleCopyFullRequest}>
                  Copy full request
                </button>
                <button type="button" className="btn-copy-request" onClick={handleCopyRequestContent}>
                  Copy content
                </button>
              </div>
              <pre className="ai-logs-json-block">
                {typeof detail.request === 'object'
                  ? JSON.stringify(detail.request, null, 2)
                  : String(detail.request)}
              </pre>

              <div className="dl-label mt">Complete response</div>
              {(() => {
                const disp = classifyCompleteResponse(detail.response);
                if (disp.kind === 'none') {
                  return (
                    <div className="ai-logs-response-empty">
                      {detail.response == null
                        ? 'No complete response was stored for this entry (older logs, or the response was not captured).'
                        : 'Response is empty or has no displayable assistant text or images.'}
                    </div>
                  );
                }
                if (disp.kind === 'images') {
                  return (
                    <div className="ai-logs-response-panel">
                      <div className="ai-logs-response-kind">Image / media response</div>
                      <p className="ai-logs-response-note">
                        Showing generated image URLs or inline data from the decrypted completion. This is not a
                        plain-text assistant message.
                      </p>
                      <div className="ai-logs-response-images">
                        {disp.urls.map((url, idx) => (
                          <figure key={`${idx}-${url.slice(0, 64)}`} className="ai-logs-response-figure">
                            <img src={url} alt="Logged model output" className="ai-logs-response-img" />
                            <figcaption className="ai-logs-img-url wrap">{url}</figcaption>
                          </figure>
                        ))}
                      </div>
                      <div className="ai-logs-copy-actions">
                        <button type="button" className="btn-copy-request" onClick={handleCopyFullResponse}>
                          Copy full response JSON
                        </button>
                      </div>
                      <pre className="ai-logs-json-block ai-logs-response-json">
                        {JSON.stringify(disp.raw, null, 2)}
                      </pre>
                    </div>
                  );
                }
                if (disp.kind === 'text') {
                  return (
                    <div className="ai-logs-response-panel">
                      <div className="ai-logs-response-kind">Text response</div>
                      <div className="ai-logs-copy-actions">
                        <button type="button" className="btn-copy-request" onClick={handleCopyResponseText}>
                          Copy response text
                        </button>
                        <button type="button" className="btn-copy-request" onClick={handleCopyFullResponse}>
                          Copy full response JSON
                        </button>
                      </div>
                      <pre className="ai-logs-json-block ai-logs-response-text-block">{disp.text}</pre>
                    </div>
                  );
                }
                return (
                  <div className="ai-logs-response-panel">
                    <div className="ai-logs-response-kind">Structured JSON (non-image)</div>
                    <div className="ai-logs-copy-actions">
                      <button type="button" className="btn-copy-request" onClick={handleCopyFullResponse}>
                        Copy full response JSON
                      </button>
                    </div>
                    <pre className="ai-logs-json-block ai-logs-response-json">
                      {JSON.stringify(disp.raw, null, 2)}
                    </pre>
                  </div>
                );
              })()}

              <button type="button" className="btn-delete-detail" onClick={() => handleDeleteOne(detail._id)}>
                Delete this entry
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AiLogsPage;
