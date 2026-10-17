"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { GlassSidebar } from "./sidebar";
import { useSidebarState } from "./use-sidebar-state";
import { TopNavigation } from "@/components/navigation/top-navigation";
import { FloatingIsland } from "@/components/rhythm/floating-island";
import { WorkspaceOverlay } from "./overlay";
import { workspaceRouteTitles } from "@/lib/workspace/design";
export function FloatingAppShell({ children }: { children: ReactNode }) {
  const { collapsed, toggle } = useSidebarState();
  const [navigation, setNavigation] = useState(false),
    pathname = usePathname(),
    scroll = useRef<HTMLDivElement>(null),
    previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    scroll.current?.scrollTo({ top: 0, behavior: "instant" });
    const title = scroll.current?.querySelector<HTMLElement>("h1");
    if (title) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  }, [pathname]);
  return (
    <div
      className="crys-floating-shell"
      data-sidebar-collapsed={collapsed}
      aria-label="CrysTrack workspace"
    >
      <a className="workspace-skip-link" href="#workspace-content">
        Skip to content
      </a>
      <GlassSidebar collapsed={collapsed} onToggle={toggle} />
      <div className="workspace-main">
        <TopNavigation onOpenNavigation={() => setNavigation(true)} />
        <div
          ref={scroll}
          className="workspace-scroll"
          id="workspace-scroll"
          tabIndex={-1}
        >
          <main
            id="workspace-content"
            className="workspace-page"
            data-workspace-route={pathname}
            aria-label={workspaceRouteTitles[pathname] || "Workspace"}
          >
            {children}
          </main>
        </div>
        <div className="workspace-dock">
          <FloatingIsland />
        </div>
      </div>
      <WorkspaceOverlay
        open={navigation}
        onClose={() => setNavigation(false)}
        title="Your workspace"
        position="drawer"
      >
        <GlassSidebar onNavigate={() => setNavigation(false)} />
      </WorkspaceOverlay>
    </div>
  );
}
