import { useLayoutEffect, useRef, useState } from 'react';
import { fitPage } from '@/lib/pagination.mjs';

export function useReaderPagination(textRef, content, start, config) {
  const automatic = config.paginationMode !== 'fixed';
  const [page, setPage] = useState({ start: -1, end: 0, layout: '' });
  const measure = useRef(null);
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || !automatic || !content) return undefined;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(probe);
    let frame;
    let active = true;
    const layout = () => {
      if (!active) return;
      const style = getComputedStyle(element);
      probe.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;height:auto;margin:0;border:0;';
      for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textAlign', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'tabSize']) probe.style[key] = style[key];
      probe.style.width = `${element.clientWidth}px`;
      const fits = value => { probe.textContent = value; return probe.getBoundingClientRect().height <= element.clientHeight + 0.5; };
      const signature = [element.clientWidth, element.clientHeight, style.font, style.lineHeight, style.letterSpacing, style.padding, style.textAlign].join('|');
      measure.current = (anchor, direction) => fitPage(content, anchor, direction, fits);
      const end = measure.current(start, 1);
      setPage(old => old.start === start && old.end === end && old.layout === signature ? old : { start, end, layout: signature });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    document.fonts?.addEventListener('loadingdone', schedule);
    layout();
    return () => { active = false; cancelAnimationFrame(frame); observer.disconnect(); document.fonts?.removeEventListener('loadingdone', schedule); probe.remove(); measure.current = null; };
  }, [textRef, automatic, content, start, config.fontSize, config.fontFamily, config.lineHeight, config.letterSpacing, config.readerPadding, config.textAlign, config.cleanMode]);
  return { automatic, end: automatic ? (page.start === start ? page.end : start) : Math.min(content.length, start + config.wordsPerPage), layout: page.layout, previous: () => measure.current?.(start, -1) ?? Math.max(0, start - config.wordsPerPage) };
}
