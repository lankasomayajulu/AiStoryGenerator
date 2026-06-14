import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';

const StatusBarContext = createContext(null);

const DEFAULT_AUTO_CLEAR_MS = {
  success: 5000,
  error: 8000,
  info: 5000,
};

export const StatusBarProvider = ({ children }) => {
  const location = useLocation();
  const [message, setMessage] = useState(null);
  const [contextItems, setContextItems] = useState([]);
  const [streamStats, setStreamStats] = useState(null);
  const clearTimerRef = useRef(null);

  const cancelAutoClear = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const clearStatus = useCallback(() => {
    cancelAutoClear();
    setMessage(null);
  }, [cancelAutoClear]);

  const clearStreamStats = useCallback(() => {
    setStreamStats(null);
  }, []);

  const clearAll = useCallback(() => {
    cancelAutoClear();
    setMessage(null);
    setStreamStats(null);
    setContextItems([]);
  }, [cancelAutoClear]);

  const showStatus = useCallback((text, type = 'info', options = {}) => {
    if (!text) {
      clearStatus();
      return;
    }

    cancelAutoClear();
    setMessage({ text, type });

    const { persist = false, autoClearMs } = options;
    if (persist) return;

    const delay =
      autoClearMs !== undefined
        ? autoClearMs
        : DEFAULT_AUTO_CLEAR_MS[type] ?? DEFAULT_AUTO_CLEAR_MS.info;

    if (delay > 0) {
      clearTimerRef.current = setTimeout(() => {
        setMessage(null);
        clearTimerRef.current = null;
      }, delay);
    }
  }, [cancelAutoClear, clearStatus]);

  useEffect(() => {
    clearAll();
  }, [location.pathname, clearAll]);

  useEffect(() => () => cancelAutoClear(), [cancelAutoClear]);

  const value = useMemo(
    () => ({
      message,
      contextItems,
      streamStats,
      showStatus,
      clearStatus,
      clearStreamStats,
      clearAll,
      setContextItems,
      setStreamStats,
    }),
    [
      message,
      contextItems,
      streamStats,
      showStatus,
      clearStatus,
      clearStreamStats,
      clearAll,
    ]
  );

  return (
    <StatusBarContext.Provider value={value}>
      {children}
    </StatusBarContext.Provider>
  );
};

export const useStatusBar = () => {
  const context = useContext(StatusBarContext);
  if (!context) {
    throw new Error('useStatusBar must be used within a StatusBarProvider');
  }
  return context;
};
