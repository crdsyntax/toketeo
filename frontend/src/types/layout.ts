import type React from 'react';

export interface NavItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  perkId: string | null;
}

export interface AppHeaderProps {
  onOpenGamification: () => void;
  onOpenShortcuts?: () => void;
}

export interface OnboardingStep {
  title: string;
  description: string;
  target: string;
  icon: string;
}

export interface OnboardingTourProps {
  onClose: () => void;
}

export interface ConnectionErrorModalState {
  connectionId: string;
  connectionName: string;
  error: string;
}
