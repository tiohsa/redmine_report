import { Marked } from 'marked';

const marked = new Marked({
    breaks: true,
    gfm: true
});

/**
 * Markdown文字列をサニタイズ済みHTMLに変換する。
 * scriptタグやイベントハンドラ等のXSS危険要素を除去する。
 */
export function renderMarkdown(markdown: string | null | undefined): string {
    if (!markdown || markdown.trim() === '') return '';

    const raw = marked.parse(markdown);
    if (typeof raw !== 'string') return '';

    return sanitizeHtml(raw);
}

/**
 * 簡易HTMLサニタイズ: scriptタグ、onXXXイベントハンドラ、javascript:スキームを除去
 */
function sanitizeHtml(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/\s+on\w+\s*=\s*\S+/gi, '')
        .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
        .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src=""');
}
