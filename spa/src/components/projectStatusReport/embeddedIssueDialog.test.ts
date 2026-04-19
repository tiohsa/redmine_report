import { describe, expect, it } from 'vitest';
import {
  extractIssueIdFromLocationCandidates,
  findEmbeddedIssueForm,
  normalizeEmbeddedFormActions,
  readEmbeddedIssueHeader,
} from './embeddedIssueDialog';

describe('embeddedIssueDialog helpers', () => {
  it('normalizes cross-origin form actions to same-origin paths', () => {
    const doc = document.implementation.createHTMLDocument('iframe');
    const form = doc.createElement('form');
    form.setAttribute('action', 'https://example.test/issues?foo=1#bar');
    doc.body.appendChild(form);

    normalizeEmbeddedFormActions(doc);

    expect(form.getAttribute('action')).toBe('/issues?foo=1#bar');
  });

  it('finds the first supported embedded issue form', () => {
    const doc = document.implementation.createHTMLDocument('iframe');
    const form = doc.createElement('form');
    form.id = 'edit_issue';
    doc.body.appendChild(form);

    expect(findEmbeddedIssueForm(doc)).toBe(form);
  });

  it('extracts the first issue id from response locations', () => {
    expect(
      extractIssueIdFromLocationCandidates([
        '',
        'https://localhost/issues/42',
        'https://localhost/issues/99',
      ]),
    ).toBe(42);
  });

  it('reads iframe header and subject from embedded issue content', () => {
    const doc = document.implementation.createHTMLDocument('iframe');
    const title = doc.createElement('h2');
    title.textContent = 'Edit issue';
    const subject = doc.createElement('input');
    subject.id = 'issue_subject';
    subject.value = 'Subject line';
    doc.body.append(title, subject);

    expect(readEmbeddedIssueHeader(doc)).toEqual({
      header: 'Edit issue',
      subject: 'Subject line',
    });
  });
});
