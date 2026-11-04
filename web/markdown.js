/* The Markdown a Field is written in, rendered for a Card, written for this
   page. It lives here rather than on a CDN because the Host serves web/ byte
   for byte and nothing else (FirstMate ADR-0008).

   It covers what a Card holds: paragraphs, headings, lists nested by indent,
   quotes, fenced code, emphasis, code and links, and nothing more. Every
   character of the source is escaped before any Markdown is read, so text
   can never become markup; a link keeps only an http, https or mailto
   address, or a relative one.

   Pure: it defines one global, renderMarkdown(text) → an HTML string, and
   reaches for nothing else, so a test runs these bytes in node:vm. */
'use strict';

(function () {
  function escape(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** An address a link may keep, already escaped, or null for one it may not. */
  function safeAddress(escaped) {
    const plain = escaped.replace(/&amp;/g, '&').trim();
    if (/^(https?:|mailto:)/i.test(plain)) return escaped.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(plain) || plain.startsWith('//')) return null;
    return escaped.trim();
  }

  function link(text, escapedAddress) {
    const address = safeAddress(escapedAddress);
    if (address === null) return text;
    return '<a href="' + address + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
  }

  /** One line of already escaped text, with its inline Markdown read. */
  function inline(escaped) {
    // Code spans first, and out of the way, so nothing inside one is read.
    const codes = [];
    let out = escaped.replace(/`([^`]+)`/g, function (_, code) {
      codes.push('<code>' + code + '</code>');
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    const links = [];
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, text, address) {
      links.push(link(text, address));
      return '\u0001' + (links.length - 1) + '\u0001';
    });
    out = out
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
    out = out.replace(/\u0001(\d+)\u0001/g, function (_, n) {
      return links[Number(n)];
    });
    return out.replace(/\u0000(\d+)\u0000/g, function (_, n) {
      return codes[Number(n)];
    });
  }

  const FENCE = /^\s*```/;
  const HEADING = /^(#{1,6})\s+(.*)$/;
  const QUOTE = /^\s*&gt;\s?(.*)$/;
  const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

  /** How far a line is indented, a tab counting as four spaces. */
  function indentOf(line) {
    return /^\s*/.exec(line)[0].replace(/\t/g, '    ').length;
  }

  /**
   * One list, starting at line i and indented by base. A deeper item nests in
   * the item above it; a shallower one, or a change of bullet at this depth,
   * ends the list. Answers the HTML and the first line it did not read.
   */
  function list(lines, i, base) {
    const ordered = /\d/.test(ITEM.exec(lines[i])[2]);
    const items = [];
    while (i < lines.length) {
      const found = ITEM.exec(lines[i]);
      if (!found) break;
      const depth = indentOf(lines[i]);
      if (depth < base) break;
      if (depth > base && items.length > 0) {
        const nested = list(lines, i, depth);
        items[items.length - 1] += nested.html;
        i = nested.next;
        continue;
      }
      if (/\d/.test(found[2]) !== ordered) break;
      items.push(inline(found[3]));
      i += 1;
    }
    const tag = ordered ? 'ol' : 'ul';
    return {
      html: '<' + tag + '>' + items.map((text) => '<li>' + text + '</li>').join('') + '</' + tag + '>',
      next: i,
    };
  }

  /** Lines of escaped source, as HTML. */
  function blocks(lines) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') {
        i += 1;
        continue;
      }
      if (FENCE.test(line)) {
        const code = [];
        i += 1;
        while (i < lines.length && !FENCE.test(lines[i])) {
          code.push(lines[i]);
          i += 1;
        }
        i += 1;
        out.push('<pre><code>' + code.join('\n') + '</code></pre>');
        continue;
      }
      const heading = HEADING.exec(line);
      if (heading) {
        const level = heading[1].length;
        out.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
        i += 1;
        continue;
      }
      if (RULE.test(line)) {
        out.push('<hr>');
        i += 1;
        continue;
      }
      if (QUOTE.test(line)) {
        const quoted = [];
        while (i < lines.length && QUOTE.test(lines[i])) {
          quoted.push(QUOTE.exec(lines[i])[1]);
          i += 1;
        }
        // Still escaped: the quote is read again as lines of its own.
        out.push('<blockquote>' + blocks(quoted) + '</blockquote>');
        continue;
      }
      if (ITEM.test(line)) {
        const read = list(lines, i, indentOf(line));
        out.push(read.html);
        i = read.next;
        continue;
      }
      const paragraph = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !FENCE.test(lines[i]) &&
        !HEADING.test(lines[i]) &&
        !QUOTE.test(lines[i]) &&
        !ITEM.test(lines[i])
      ) {
        paragraph.push(inline(lines[i]));
        i += 1;
      }
      // A single newline is kept as a line break: a Field is typed, not typeset.
      out.push('<p>' + paragraph.join('<br>') + '</p>');
    }
    return out.join('');
  }

  function renderMarkdown(source) {
    return blocks(escape(String(source || '').replace(/\r\n?/g, '\n')).split('\n'));
  }

  globalThis.renderMarkdown = renderMarkdown;
})();
