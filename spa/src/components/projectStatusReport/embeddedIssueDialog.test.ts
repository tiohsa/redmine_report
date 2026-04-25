import { describe, expect, it } from 'vitest';
import {
  applyEmbeddedLinkTargetBlank,
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

  it('sets target blank on wiki links', () => {
    const doc = document.implementation.createHTMLDocument('iframe');
    doc.body.innerHTML = '<div class="wiki"><a href="/issues/1">Issue</a></div>';
    const link = doc.querySelector<HTMLAnchorElement>('.wiki a');

    applyEmbeddedLinkTargetBlank(doc);

    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('does not modify non-wiki operation links', () => {
    const doc = document.implementation.createHTMLDocument('iframe');
    doc.body.innerHTML = '<div class="contextual"><a href="/issues/1/edit">Edit</a></div>';
    const link = doc.querySelector<HTMLAnchorElement>('.contextual a');

    applyEmbeddedLinkTargetBlank(doc);

    expect(link?.hasAttribute('target')).toBe(false);
    expect(link?.hasAttribute('rel')).toBe(false);
  });

  it('ignores empty, hash-only, and javascript wiki links', () => {
    const doc = document.implementation.createHTMLDocument('iframe');
    doc.body.innerHTML = `
      <div class="wiki">
        <a href="">Empty</a>
        <a href="#anchor">Anchor</a>
        <a href="javascript:alert(1)">Script</a>
      </div>
    `;

    applyEmbeddedLinkTargetBlank(doc);

    doc.querySelectorAll<HTMLAnchorElement>('.wiki a').forEach((link) => {
      expect(link.hasAttribute('target')).toBe(false);
      expect(link.hasAttribute('rel')).toBe(false);
    });
  });
});
