import React, { useState } from 'react';

const StageDiscussV2 = ({ activeSession, discussionMessages, onSendMessage }) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || !activeSession) return;
    try {
      setSending(true);
      await onSendMessage(trimmed);
      setMessage('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="discuss-stage">
      <div className="discuss-header-row">
        <h3>Discuss Next Chapter</h3>
      </div>

      <div className="discuss-log">
        {discussionMessages.length === 0 ? (
          <p className="muted">
            Start by asking what should happen in the next chapter, or ask for options by tone/conflict.
          </p>
        ) : (
          discussionMessages.map((item, index) => (
            <div key={`${item.role}-${index}`} className={`chat-bubble ${item.role}`}>
              <strong>{item.role === 'assistant' ? 'Planner' : 'You'}:</strong> {item.content}
            </div>
          ))
        )}
      </div>

      <div className="discuss-input-row">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Discuss what should happen in the next chapter..."
        />
        <button onClick={handleSend} disabled={sending || !message.trim() || !activeSession}>
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default StageDiscussV2;
