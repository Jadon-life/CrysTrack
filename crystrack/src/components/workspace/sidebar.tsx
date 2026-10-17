"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  History,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { navItems, navItemIsActive } from "@/components/navigation/nav-items";
import { ThemeAwareBrandLogo } from "./brand-logo";

function NavigationLink({
  href,
  label,
  active,
  compact,
  onNavigate,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  compact: boolean;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const anchor = useRef<HTMLAnchorElement>(null),
    id = useId();
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  function show() {
    const tablet = window.matchMedia(
      "(min-width: 768px) and (max-width: 1099px)",
    ).matches;
    if (!compact && !tablet) return;
    if (anchor.current?.closest('[role="dialog"]')) return;
    const box = anchor.current?.getBoundingClientRect();
    if (box) setPosition({ left: box.right + 12, top: box.y + box.height / 2 });
  }
  function hide() {
    setPosition(null);
  }
  return (
    <>
      <Link
        ref={anchor}
        href={href}
        onClick={() => {
          hide();
          onNavigate?.();
        }}
        aria-label={label}
        aria-describedby={position ? id : undefined}
        aria-current={active ? "page" : undefined}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(event) => {
          if (event.key === "Escape") hide();
        }}
        className={"workspace-nav-link" + (active ? " is-active" : "")}
      >
        {children}
        <span>{label}</span>
        {active && (
          <span className="workspace-nav-indicator" aria-hidden="true" />
        )}
      </Link>
      {position &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="workspace-sidebar-tooltip"
            style={{ left: position.left, top: position.top }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
export function GlassSidebar({
  onNavigate,
  collapsed = false,
  onToggle,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname(),
    navigationId = useId();
  return (
    <aside className="workspace-sidebar" aria-label="Workspace sidebar">
      <div className="workspace-sidebar-header">
        <Link
          href="/"
          onClick={onNavigate}
          className="workspace-brand-link"
          aria-label="CrysTrack home"
        >
          <ThemeAwareBrandLogo />
        </Link>
        {onToggle && (
          <button
            type="button"
            className="workspace-sidebar-toggle"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-controls={navigationId}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      <div className="workspace-sidebar-caption">Personal workspace</div>
      <nav id={navigationId} aria-label="Primary navigation">
        {navItems.map((item) => (
          <NavigationLink
            key={item.href}
            href={item.href}
            label={item.label}
            active={navItemIsActive(pathname, item)}
            compact={collapsed}
            onNavigate={onNavigate}
          >
            {item.icon}
          </NavigationLink>
        ))}
      </nav>
      <footer>
        <Link
          href="/history"
          onClick={onNavigate}
          className="workspace-history-link"
        >
          <History size={17} />
          <span>Your activity history</span>
          <ArrowUpRight size={14} />
        </Link>
        <p>A little clarity. More room to grow.</p>
      </footer>
    </aside>
  );
}
