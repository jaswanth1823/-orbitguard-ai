import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SpacecraftStatus, AnomalySeverity } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUTC(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function getStatusColor(status: SpacecraftStatus): string {
  switch (status) {
    case 'nominal': return 'text-emerald-400';
    case 'warning': return 'text-amber-400';
    case 'critical': return 'text-red-400';
    case 'offline': return 'text-slate-400';
    case 'maintenance': return 'text-blue-400';
  }
}

export function getStatusBg(status: SpacecraftStatus): string {
  switch (status) {
    case 'nominal': return 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400';
    case 'warning': return 'bg-amber-400/10 border-amber-400/30 text-amber-400';
    case 'critical': return 'bg-red-400/10 border-red-400/30 text-red-400';
    case 'offline': return 'bg-slate-400/10 border-slate-400/30 text-slate-400';
    case 'maintenance': return 'bg-blue-400/10 border-blue-400/30 text-blue-400';
  }
}

export function getSeverityColor(severity: AnomalySeverity): string {
  switch (severity) {
    case 'low': return 'text-blue-400';
    case 'medium': return 'text-amber-400';
    case 'high': return 'text-orange-400';
    case 'critical': return 'text-red-400';
  }
}

export function getSeverityBg(severity: AnomalySeverity): string {
  switch (severity) {
    case 'low': return 'bg-blue-400/10 border-blue-400/30 text-blue-400';
    case 'medium': return 'bg-amber-400/10 border-amber-400/30 text-amber-400';
    case 'high': return 'bg-orange-400/10 border-orange-400/30 text-orange-400';
    case 'critical': return 'bg-red-400/10 border-red-400/30 text-red-400';
  }
}

export function getHealthColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

export function getHealthBg(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

export function formatValue(value: number, unit: string, decimals: number = 1): string {
  return `${value.toFixed(decimals)}${unit}`;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.*$)/gm, '<h3 class="text-sm font-semibold text-slate-200 mt-3 mb-1">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-base font-semibold text-slate-100 mt-4 mb-2">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-lg font-bold text-white mt-4 mb-2">$1</h1>')
    .replace(/^• (.*$)/gm, '<li class="ml-3 text-slate-300">$1</li>')
    .replace(/^\- (.*$)/gm, '<li class="ml-3 text-slate-300">$1</li>')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/\n/g, '<br/>');
}
