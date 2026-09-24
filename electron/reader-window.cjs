const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function readerGestureBounds(origin, start, current, edge = '') {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  if (!edge) return {
    x: Math.round(origin.x + dx),
    y: Math.round(origin.y + dy),
    width: origin.width,
    height: origin.height,
  };

  let { x, y, width, height } = origin;
  if (edge.includes('e')) width = clamp(origin.width + dx, 100, 1600);
  if (edge.includes('s')) height = clamp(origin.height + dy, 100, 900);
  if (edge.includes('w')) {
    width = clamp(origin.width - dx, 100, 1600);
    x = origin.x + origin.width - width;
  }
  if (edge.includes('n')) {
    height = clamp(origin.height - dy, 100, 900);
    y = origin.y + origin.height - height;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

module.exports = { readerGestureBounds };
