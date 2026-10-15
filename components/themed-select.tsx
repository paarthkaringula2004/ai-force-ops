"use client";

import { Children, Fragment, isValidElement, type ReactNode, type SelectHTMLAttributes, type ChangeEvent, type RefObject } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

type Option = { value: string; label: string; disabled: boolean };
function plainText(node: ReactNode): string {
  return Children.toArray(node).map((child) => isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : String(child)).join("");
}
function optionsFrom(node: ReactNode): Option[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean; label?: string }>(child)) return [];
    if (child.type === Fragment || child.type === "optgroup") return optionsFrom(child.props.children);
    if (child.type !== "option") return [];
    const label = child.props.label || plainText(child.props.children);
    return [{ value: String(child.props.value ?? label), label, disabled: !!child.props.disabled }];
  });
}

// Preserve existing single-value select handlers and native FormData field names.
export default function ThemedSelect(props: SelectHTMLAttributes<HTMLSelectElement> & { portalContainer?: HTMLElement | RefObject<HTMLElement | null> | null }) {
  const { children, value, defaultValue, onChange, disabled, name, id, required, form, className, style, autoFocus, tabIndex, title, portalContainer } = props;
  const options = optionsFrom(children);
  return <Select.Root<string>
    items={options}
    value={value === undefined ? undefined : String(value)}
    defaultValue={String(defaultValue ?? options[0]?.value ?? "")}
    name={name} id={id} form={form} required={required} disabled={disabled} modal={false}
    onValueChange={(next) => {
      if (next === null) return;
      const field = { value: next, name: name || "", id: id || "" } as HTMLSelectElement;
      onChange?.({ target: field, currentTarget: field } as ChangeEvent<HTMLSelectElement>);
    }}
  >
    <Select.Trigger className={`themed-select ${className || ""}`} style={style} autoFocus={autoFocus} tabIndex={tabIndex} title={title}
      aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]} aria-describedby={props["aria-describedby"]} aria-invalid={props["aria-invalid"]}>
      <Select.Value className="themed-select-value" />
      <Select.Icon className="themed-select-icon"><ChevronDown size={15} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={portalContainer}>
      <Select.Positioner className="themed-select-positioner" sideOffset={7} alignItemWithTrigger={false} align="start">
        <Select.Popup className="themed-select-popup">
          <Select.List className="themed-select-list">
            {options.map((option, index) => <Select.Item key={`${option.value}:${index}`} value={option.value} disabled={option.disabled} className="themed-select-option">
              <Select.ItemText>{option.label}</Select.ItemText>
              <Select.ItemIndicator className="themed-select-check"><Check size={14} /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
}
