import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { ProspectraLogo } from "@/components/brand/ProspectraLogo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { appNavSections } from "@/constants/navigation";
import { NotificationMenu } from "@/features/notifications/NotificationMenu";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { authService } from "@/services/auth-service";
import { cn } from "@/lib/utils";

export function AuthenticatedLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[16rem_1fr]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-card transition-transform md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center border-b border-border px-4">
          <Link to="/app">
            <ProspectraLogo size="sm" />
          </Link>
        </div>
        <nav className="space-y-6 overflow-y-auto p-4" aria-label="Application">
          {appNavSections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      to={item.href}
                      end={item.href === "/app"}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "block rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                          isActive && "bg-accent font-medium text-foreground",
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-brand-navy/40 md:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search prospects, campaigns…" aria-label="Global search" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="max-w-[8rem] truncate">{activeWorkspace?.name ?? "Workspace"}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {workspaces.length === 0 ? (
                  <DropdownMenuItem asChild>
                    <Link to="/onboarding">Create workspace</Link>
                  </DropdownMenuItem>
                ) : (
                  workspaces.map((workspace) => (
                    <DropdownMenuItem key={workspace.id} onClick={() => setActiveWorkspaceId(workspace.id)}>
                      {workspace.name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <NotificationMenu />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Account menu">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/app/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/admin">Platform admin</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/app/team">Team</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await authService.signOut();
                    } catch {
                      // If Supabase is unconfigured, still leave the protected area.
                    }
                    navigate("/login");
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
