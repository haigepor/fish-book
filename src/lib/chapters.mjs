// 使用原始字符串偏移，不裁剪整篇文本，确保 CRLF 和中文章节跳转精确。
export function parseChapters(text) {
  const result = [];
  const pattern = /^(?:第[零〇一二三四五六七八九十百千万两\d]+[章回节卷部篇](?:\s.*|[^\s]{0,40})|chapter\s+\d+\b.*|序章|序言|前言|尾声|后记)$/i;
  let offset = 0;
  for (const line of text.split('\n')) {
    const title = line.trim();
    if (title.length <= 80 && pattern.test(title)) result.push({ title, start: offset });
    offset += line.length + 1;
  }
  return result;
}

export function currentChapter(chapters, start) {
  return chapters.filter(chapter => chapter.start <= start).at(-1)?.title || '正文';
}
