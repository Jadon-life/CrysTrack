import React from 'react';
import {
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Layers3,
  Sparkles,
  WalletCards,
  CheckSquare,
  Target,
  GraduationCap,
  Settings,
} from 'lucide-react';
export interface NavItemData {
  label: string;
  href: string;
  icon: React.ReactNode;
  match?: string[];
}
export const navItems: NavItemData[] = [
  { label: 'Today', href: '/', icon: <Sparkles size={18} /> },
  { label: 'Plan', href: '/plan', icon: <Layers3 size={18} /> },
  { label: 'Tasks', href: '/tasks', icon: <CheckSquare size={18} /> },
  { label: 'Goals', href: '/goals', icon: <Target size={18} /> },
  {
    label: 'Assignments',
    href: '/assignments',
    icon: <GraduationCap size={18} />,
  },
  { label: 'Calendar', href: '/calendar', icon: <CalendarDays size={18} /> },
  { label: 'Wealth', href: '/finance', icon: <WalletCards size={18} /> },
  {
    label: 'Insights',
    href: '/insights',
    icon: <BarChart3 size={18} />,
    match: ['/insights', '/history'],
  },
  { label: 'AI', href: '/ai', icon: <BrainCircuit size={18} /> },
  { label: 'Settings', href: '/settings', icon: <Settings size={18} /> },
];
export function navItemIsActive(pathname: string, item: NavItemData) {
  if (item.href === '/') return pathname === '/';
  return (item.match || [item.href]).some(
    (path) => pathname === path || pathname.startsWith(path + '/'),
  );
}
export const mobileNavItems = navItems;
