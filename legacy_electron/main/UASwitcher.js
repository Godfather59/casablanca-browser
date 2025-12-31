/* Use the same user agent as Chrome to improve site compatibility and increase fingerprinting resistance */

// NOTE: Electron 40 is based on Chromium 133.
// We should match the version to avoid feature detection mismatches (e.g. StorageAccessAPI)

// Hardcoded Chrome 133 UA for Windows 11
const standardUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

if (typeof app !== 'undefined') {
  app.userAgentFallback = standardUserAgent;
}
