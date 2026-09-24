import { Select } from 'radix-ui';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

// 复用现有 Radix 基础，弹层颜色不受操作系统原生 select 菜单限制。
export function BookSelect({ label, value, placeholder, options, disabled, onChange }) {
  return <div className="book-select-field"><span>{label}</span><Select.Root value={value} onValueChange={onChange} disabled={disabled}>
    <Select.Trigger className="book-select-trigger" aria-label={label}><Select.Value placeholder={placeholder} /><Select.Icon><ChevronDown size={16} /></Select.Icon></Select.Trigger>
    <Select.Portal><Select.Content className="book-select-menu" position="popper" sideOffset={6} collisionPadding={12}><Select.ScrollUpButton className="book-select-scroll"><ChevronUp size={14} /></Select.ScrollUpButton><Select.Viewport>{options.map(option => <Select.Item className="book-select-option" key={option.value} value={option.value}><Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator><Check size={14} /></Select.ItemIndicator></Select.Item>)}</Select.Viewport><Select.ScrollDownButton className="book-select-scroll"><ChevronDown size={14} /></Select.ScrollDownButton></Select.Content></Select.Portal>
  </Select.Root></div>;
}
