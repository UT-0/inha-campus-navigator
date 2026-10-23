/**
 * App settings that are meant to be changed by whoever runs the site.
 */

/**
 * Where "Report a mistake" sends people.
 * - { type: 'github', repo: 'owner/name' } opens a pre-filled GitHub issue.
 * - { type: 'email', address: 'someone@example.com' } opens an email draft.
 */
export const REPORT_TARGET = { type: 'github', repo: 'UT-0/inha-campus-navigator' };

/**
 * Builds the "Report a mistake" link.
 * @param {string} subject
 * @param {string} body
 * @param {typeof REPORT_TARGET} [target]
 * @returns {string}
 */
export function reportUrl(subject, body, target = REPORT_TARGET) {
  // Keep links well under the length browsers and GitHub accept.
  const text = body.length > 5000 ? `${body.slice(0, 5000)}\n…` : body;
  if (target.type === 'email') {
    return `mailto:${target.address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  }
  const params = new URLSearchParams({ title: subject, body: text, labels: 'data' });
  return `https://github.com/${target.repo}/issues/new?${params}`;
}
