import React from 'react';
import './Spinner.css';

const Spinner = ({ message = 'Loading...' }) => {
  return (
    <div className="spinner-overlay">
      <div className="spinner-container">
        <div className="spinner"></div>
        <div className="spinner-message">{message}</div>
      </div>
    </div>
  );
};

export default Spinner;

