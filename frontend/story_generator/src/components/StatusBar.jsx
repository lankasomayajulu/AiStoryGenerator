import React from 'react';
import { useStatusBar } from '../context/StatusBarContext';
import './StatusBar.css';

const StatusBar = () => {
  const { message, contextItems } = useStatusBar();

  const hasContext = contextItems.length > 0;
  const hasMessage = message?.text;

  return (
    <footer className="status-bar" role="status" aria-live="polite">
      <div className={`status-bar-message ${hasMessage ? `status-${message.type}` : 'status-empty'}`}>
        {hasMessage ? message.text : '\u00A0'}
      </div>

      {hasContext && (
        <div className="status-bar-meta">
          {contextItems.map((item) => (
            <span key={item.label} className="status-item">
              <strong>{item.label}:</strong> {item.value}
            </span>
          ))}
        </div>
      )}
    </footer>
  );
};

export default StatusBar;
