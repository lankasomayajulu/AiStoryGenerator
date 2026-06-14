import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MarkdownBlock = ({ text }) => {
  if (!text) return null;
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>;
};

const MarkdownPreview = ({ content = '', segments = null, className = '' }) => {
  if (segments?.length) {
    return (
      <div className={`markdown-preview ${className}`.trim()}>
        {segments.map((segment, index) => {
          if (!segment.text) return null;
          const wrapperClass =
            segment.type === 'highlight' ? 'md-generating-content' : 'md-segment';
          return (
            <span key={index} className={wrapperClass}>
              <MarkdownBlock text={segment.text} />
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`markdown-preview ${className}`.trim()}>
      <MarkdownBlock text={content} />
    </div>
  );
};

export default MarkdownPreview;
