import React, { useState } from 'react';

const PlanningSessionBarV2 = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession
}) => {
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const title = newSessionTitle.trim();
    if (!title) return;
    try {
      setCreating(true);
      await onCreateSession(title);
      setNewSessionTitle('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="planning-panel planning-session-panel">
      <h2>Planning Sessions</h2>
      <div className="session-create-row">
        <input
          value={newSessionTitle}
          onChange={(e) => setNewSessionTitle(e.target.value)}
          placeholder="New session title"
        />
        <button onClick={handleCreate} disabled={creating || !newSessionTitle.trim()}>
          {creating ? 'Creating...' : 'Create'}
        </button>
      </div>
      <div className="session-list">
        {sessions.length === 0 ? (
          <p className="muted">No planning sessions yet.</p>
        ) : (
          sessions.map((session) => (
            <button
              key={session._id}
              className={`session-item ${activeSessionId === session._id ? 'active' : ''}`}
              onClick={() => onSelectSession(session._id)}
            >
              <div>{session.title}</div>
              <small>{session.status}</small>
            </button>
          ))
        )}
      </div>
    </section>
  );
};

export default PlanningSessionBarV2;
