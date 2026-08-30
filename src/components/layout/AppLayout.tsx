import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Inbox,
  CalendarDays,
  FileText,
  Receipt,
  Settings,
  LogOut,
  Sparkles,
  Tags,
  Package,
  DollarSign,
  Images,
  Headset,
  Menu,
  ChevronLeft,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useSupportTickets";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DisplaySizeToggle } from "@/components/DisplaySizeToggle";
import { HelpChatWidget } from "@/components/HelpChatWidget";
import { InstallAppButton } from "@/components/InstallAppButton";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/leads", label: "Leads & Requests", icon: Inbox },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/quotes", label: "Quotes", icon: FileText },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/price-book", label: "Price Book", icon: Tags },
  { to: "/materials", label: "Materials", icon: Package },
  { to: "/expenses", label: "Expenses", icon: DollarSign },
  { to: "/files", label: "Files & Media", icon: Images },
  { to: "/settings", label: "Settings", icon: Settings },
];

const ADMIN_NAV_ITEM = { to: "/admin/support", label: "Support Inbox", icon: Headset, end: false };

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: isAdmin } = useIsAdmin(user?.id);
  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  // Close the mobile drawer automatically whenever the route changes (link
  // tap, back button, etc.) so it never lingers open over the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const currentLabel = navItems.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  )?.label;

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="flex min-h-svh w-full flex-col sm:flex-row">
      {/* Mobile top bar — the only nav entry point on small screens, since
          the sidebar below is hidden here. Gives a back button (when not
          on a top-level page) plus a hamburger menu to jump anywhere. */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-card px-2 sm:hidden">
        {location.pathname !== "/dashboard" ? (
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} title="Back">
            <ChevronLeft className="size-5" />
          </Button>
        ) : (
          <Sparkles className="ml-2 size-5 text-primary" />
        )}
        <span className="flex-1 truncate text-center font-medium">
          {currentLabel ?? "Project Flow"}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setMenuOpen(true)} title="Menu">
          <Menu className="size-5" />
        </Button>
      </header>

      {/* Mobile menu drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between gap-2 px-4 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <span className="gradient-text font-semibold">Project Flow</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)} title="Close menu">
                <X className="size-4" />
              </Button>
            </div>
            <nav className="flex-1 space-y-1 px-2">
              {navItems.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )
                  }
                >
                  <Icon className="size-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="px-2 pb-1">
              <InstallAppButton />
            </div>
            <div className="flex items-center gap-2 border-t px-4 py-3">
              <Avatar className="size-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user?.email}</p>
              </div>
              <DisplaySizeToggle />
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card sm:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <Sparkles className="size-5 text-primary" />
          <span className="gradient-text font-semibold">Project Flow</span>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-2 pb-1">
          <InstallAppButton />
        </div>
        <div className="flex items-center gap-2 border-t px-4 py-3">
          <Avatar className="size-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.email}</p>
          </div>
          <DisplaySizeToggle />
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
            <LogOut className="size-4" />
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </div>
      </main>
      <HelpChatWidget />
    </div>
  );
}
