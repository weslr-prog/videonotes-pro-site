(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeUrl(rawUrl) {
    if (!rawUrl) return '';

    try {
      const trimmed = String(rawUrl).trim();
      const parsed = new URL(trimmed, 'https://example.com');
      const protocol = parsed.protocol.toLowerCase();
      if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'mailto:') {
        return '';
      }

      if (parsed.hostname === 'example.com' && !/^https?:|^mailto:/i.test(trimmed)) {
        return '';
      }

      return parsed.href;
    } catch (error) {
      return '';
    }
  }

  function applyInlineFormatting(text) {
    if (!text) return '';

    const escaped = escapeHtml(text);
    const codeTokens = [];

    const codeProtected = escaped.replace(/`([^`]+)`/g, function (_, codeValue) {
      const token = `__CODE_TOKEN_${codeTokens.length}__`;
      codeTokens.push(`<code>${codeValue}</code>`);
      return token;
    });

    const linked = codeProtected.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, href) {
      const safeHref = sanitizeUrl(href);
      const safeLabel = label || href;
      if (!safeHref) {
        return safeLabel;
      }
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
    });

    const formatted = linked
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');

    return formatted.replace(/__CODE_TOKEN_(\d+)__/g, function (_, index) {
      return codeTokens[Number(index)] || '';
    });
  }

  function flushParagraph(buffer, blocks) {
    if (buffer.length === 0) return;
    const text = buffer.join(' ').trim();
    if (!text) {
      buffer.length = 0;
      return;
    }
    blocks.push(`<p>${applyInlineFormatting(text)}</p>`);
    buffer.length = 0;
  }

  function render(markdownText) {
    const source = String(markdownText || '');
    if (!source.trim()) return '';

    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    const paragraphBuffer = [];
    let inCodeFence = false;
    let codeLines = [];
    let listType = null;

    function closeList() {
      if (!listType) return;
      blocks.push(listType === 'ol' ? '</ol>' : '</ul>');
      listType = null;
    }

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      if (line.startsWith('```')) {
        flushParagraph(paragraphBuffer, blocks);
        closeList();

        if (inCodeFence) {
          blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
          codeLines = [];
          inCodeFence = false;
        } else {
          inCodeFence = true;
        }
        continue;
      }

      if (inCodeFence) {
        codeLines.push(rawLine);
        continue;
      }

      if (!line) {
        flushParagraph(paragraphBuffer, blocks);
        closeList();
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph(paragraphBuffer, blocks);
        closeList();
        const level = headingMatch[1].length;
        blocks.push(`<h${level}>${applyInlineFormatting(headingMatch[2])}</h${level}>`);
        continue;
      }

      const quoteMatch = line.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        flushParagraph(paragraphBuffer, blocks);
        closeList();
        blocks.push(`<blockquote>${applyInlineFormatting(quoteMatch[1])}</blockquote>`);
        continue;
      }

      const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
      if (orderedMatch) {
        flushParagraph(paragraphBuffer, blocks);
        if (listType !== 'ol') {
          closeList();
          blocks.push('<ol>');
          listType = 'ol';
        }
        blocks.push(`<li>${applyInlineFormatting(orderedMatch[1])}</li>`);
        continue;
      }

      const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);
      if (unorderedMatch) {
        flushParagraph(paragraphBuffer, blocks);
        if (listType !== 'ul') {
          closeList();
          blocks.push('<ul>');
          listType = 'ul';
        }

        const itemText = unorderedMatch[1];
        const taskMatch = itemText.match(/^\[( |x|X)\]\s+(.+)$/);
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === 'x';
          blocks.push(`<li class="md-task"><input type="checkbox" disabled ${checked ? 'checked' : ''}> <span>${applyInlineFormatting(taskMatch[2])}</span></li>`);
        } else {
          blocks.push(`<li>${applyInlineFormatting(itemText)}</li>`);
        }
        continue;
      }

      closeList();
      paragraphBuffer.push(line);
    }

    if (inCodeFence) {
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }

    flushParagraph(paragraphBuffer, blocks);
    closeList();

    return blocks.join('');
  }

  window.MarkdownReader = {
    render: render
  };
})();
