import type React from 'react';
import type { DbRow, DbValue } from './database';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

export type CardElevation = 'flat' | 'raised' | 'overlay';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: CardElevation;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  error?: string;
}

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type WindowState = 'normal' | 'minimized' | 'maximized';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: DialogSize;
  children: React.ReactNode;
  className?: string;
  disableWindowControls?: boolean;
}

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  children: React.ReactNode;
  content: string;
  side?: TooltipSide;
}

export interface Tab {
  id: string;
  label: string;
  badge?: string | number;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export type ScrollAreaOrientation = 'both' | 'vertical' | 'horizontal';

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: ScrollAreaOrientation;
}

export type SeparatorOrientation = 'horizontal' | 'vertical';

export interface SeparatorProps {
  orientation?: SeparatorOrientation;
  className?: string;
}

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  variant?: 'default' | 'destructive';
  onClick: () => void;
  disabled?: boolean;
}

export interface ContextMenuGroup {
  title?: string;
  items: ContextMenuItem[];
  collapsible?: boolean;
  dropdown?: boolean;
  initiallyOpen?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  groups: ContextMenuGroup[];
  onDismiss: () => void;
}

export interface ContextualTipProps {
  id: string;
  message: string;
  className?: string;
  onAction?: () => void;
  actionLabel?: string;
}

export interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export interface ReviewChangePanelProps {
  column: string;
  columnType?: string;
  prevValue: DbValue;
  nextValue: DbValue;
  onConfirm: () => void;
  onDiscard: () => void;
  position?: { top: number; left: number } | null;
}

export interface JsonResultsViewProps {
  rows: DbRow[];
}
