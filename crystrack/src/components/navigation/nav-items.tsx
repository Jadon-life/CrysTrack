import React from 'react';
import { BarChart3, CalendarDays, CircleDollarSign, Layers3, Sparkles } from 'lucide-react';

export interface NavItemData {
  label: string;
  href: string;
  icon: React.ReactNode;
  match?: string[];
}

export const navItems: NavItemData[] = [
  { label: 'Today', href: '/', icon: <Sparkles className="w-4 h-4" />, match: ['/'] },
  { label: 'Plan', href: '/plan', icon: <Layers3 className="w-4 h-4" />, match: ['/plan', '/tasks', '/goals', '/assignments'] },
  { label: 'Money', href: '/finance', icon: <CircleDollarSign className="w-4 h-4" />, match: ['/finance'] },
  { label: 'Insights', href: '/insights', icon: <BarChart3 className="w-4 h-4" />, match: ['/insights', '/history'] },
  { label: 'Calendar', href: '/calendar', icon: <CalendarDays className="w-4 h-4" />, match: ['/calendar'] },
];

export function navItemIsActive(pathname: string, item: NavItemData) {
  if (item.href === '/') return pathname === '/';
  return (item.match || [item.href]).some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const mobileNavItems = navItems;
