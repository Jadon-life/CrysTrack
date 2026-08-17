export interface NavItemData {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

import {
  LayoutDashboard,
  CheckSquare,
  Target,
  ClipboardList,
  Wallet,
  History,
  BrainCircuit,
  Settings,
} from 'lucide-react';

export const navItems: NavItemData[] = [
  { label: 'Dashboard', href: '/', icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: 'Tasks', href: '/tasks', icon: <CheckSquare className="w-5 h-5" /> },
  { label: 'Goals', href: '/goals', icon: <Target className="w-5 h-5" /> },
  { label: 'Assignments', href: '/assignments', icon: <ClipboardList className="w-5 h-5" /> },
  { label: 'Finance', href: '/finance', icon: <Wallet className="w-5 h-5" /> },
  { label: 'History', href: '/history', icon: <History className="w-5 h-5" /> },
  { label: 'Insights', href: '/insights', icon: <BrainCircuit className="w-5 h-5" /> },
  { label: 'Settings', href: '/settings', icon: <Settings className="w-5 h-5" /> },
];

export const mobileNavItems: NavItemData[] = [
  { label: 'Dashboard', href: '/', icon: <LayoutDashboard className="w-6 h-6" /> },
  { label: 'Tasks', href: '/tasks', icon: <CheckSquare className="w-6 h-6" /> },
  { label: 'Goals', href: '/goals', icon: <Target className="w-6 h-6" /> },
  { label: 'Finance', href: '/finance', icon: <Wallet className="w-6 h-6" /> },
  { label: 'More', href: '/settings', icon: <Settings className="w-6 h-6" /> },
];
