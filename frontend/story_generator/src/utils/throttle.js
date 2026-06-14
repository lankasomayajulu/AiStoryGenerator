/**
 * Returns a throttled function that invokes `fn` at most once per `waitMs`.
 * The latest arguments are always used on the trailing call.
 */
export function throttle(fn, waitMs) {
  let timeoutId = null;
  let pendingArgs = null;

  const flush = () => {
    timeoutId = null;
    if (!pendingArgs) return;
    const args = pendingArgs;
    pendingArgs = null;
    fn(...args);
  };

  const throttled = (...args) => {
    pendingArgs = args;
    if (timeoutId !== null) return;
    timeoutId = setTimeout(flush, waitMs);
  };

  throttled.flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    flush();
  };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    pendingArgs = null;
  };

  return throttled;
}
