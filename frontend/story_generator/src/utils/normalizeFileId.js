/** Normalize Mongo/file ids for reliable Map lookups and comparisons. */
export const normalizeFileId = (id) => {
  if (id == null) return '';
  if (typeof id === 'object' && typeof id.toString === 'function') {
    const s = id.toString();
    if (s && s !== '[object Object]') return s;
  }
  return String(id);
};

export const resolveContentOverride = (contentOverrides, fileId) => {
  if (!contentOverrides || fileId == null) return undefined;
  const normalized = normalizeFileId(fileId);
  if (Object.prototype.hasOwnProperty.call(contentOverrides, normalized)) {
    return contentOverrides[normalized];
  }
  if (Object.prototype.hasOwnProperty.call(contentOverrides, fileId)) {
    return contentOverrides[fileId];
  }
  return undefined;
};
