import React from 'react';
import { LayoutDashboard, Layers3, Wallet, BrainCircuit, Settings } from 'lucide-react';

export interface NavItemData {
  label: string;
  href: string;
  icon: React.ReactNode;
  matches?: string[];
}

export const navItems: NavItemData[] = [
  { label: 'Today', href: '/', icon: <LayoutDashboard className="w-5 h-5" />, matches: ['/'] },
  { label: 'Plan', href: '/plan', icon: <Layers3 className="w-5 h-5" />, matches: ['/plan', '/tasks', '/goals', '/assignments'] },
  { label: 'Money', href: '/finance', icon: <Wallet className="w-5 h-5" />, matches: ['/finance'] },
  { label: 'Insights', href: '/insights', icon: <BrainCircuit className="w-5 h-5" />, matches: ['/insights', '/history'] },
  { label: 'Settings', href: '/settings', icon: <Settings className="w-5 h-5" />, matches: ['/settings'] },
];

export const mobileNavItems = navItems;

export function navItemIsActive(pathname: string, item: NavItemData) {
  const matches = item.matches || [item.href];
  return matches.some((match) => match === '/' ? pathname === '/' : pathname === match || pathname.startsWith(`${match}/`));
}
