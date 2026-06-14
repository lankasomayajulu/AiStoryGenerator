// Convert HTML to plain text, preserving structure
export const htmlToText = (html) => {
  if (!html) return '';
  
  // Create a temporary DOM element
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Extract text content
  return tempDiv.textContent || tempDiv.innerText || '';
};

