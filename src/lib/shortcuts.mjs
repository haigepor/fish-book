const names = { ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', '+': 'Plus' };
export function shortcutFromEvent(event) {
  if (event.isComposing || ['Control', 'Alt', 'Shift', 'Meta', 'Dead', 'Unidentified', 'Process'].includes(event.key)) return '';
  const key = names[event.key] || (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super', key].filter(Boolean).join('+');
}
export function normalizeShortcut(value = '') {
  return value.replace(/\s/g, '').replace(/Arrow(Left|Right|Up|Down)/gi, '$1').toLowerCase();
}
export function shortcutAction(event, config) {
  const chord = shortcutFromEvent(event);
  if (!chord) return undefined;
  return [['key1', 'previous'], ['key2', 'next'], ['key3', 'toggle'], ['key4', 'exit-clean']].find(([key]) => normalizeShortcut(config[key]) === normalizeShortcut(chord))?.[1];
}
