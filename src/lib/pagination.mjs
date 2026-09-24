// 使用实际排版测量作为判定；边界以 Unicode 码点为单位，不截断代理对。
export function fitPage(text, anchor, direction, fits) {
  const limit = 65536;
  const from = direction > 0 ? anchor : Math.max(0, anchor - limit);
  const to = direction > 0 ? Math.min(text.length, anchor + limit) : anchor;
  const offsets = [from];
  let offset = from;
  for (const char of text.slice(from, to)) { offset += char.length; offsets.push(offset); }
  const count = offsets.length - 1;
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const sample = direction > 0 ? text.slice(anchor, offsets[middle]) : text.slice(offsets[count - middle], anchor);
    if (fits(sample)) low = middle;
    else high = middle - 1;
  }
  // 极小窗口也至少前进一个字符；正文区域允许滚动兜底。
  const size = Math.max(Math.min(1, count), low);
  return direction > 0 ? offsets[size] : offsets[count - size];
}
