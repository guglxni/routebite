import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Home, LogOut } from "lucide-react";
import type { PortalRole } from "@routebite/shared/types";
import { RouteBiteMark } from "~/components/brand/RouteBiteLogo";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { useAuth } from "~/stores/auth";
import { ReconnectSwiggyBanner } from "~/components/auth/ReconnectSwiggyBanner";

export type RoleNavItem = { to: string; label: string; icon: LucideIcon };

const roleBadge: Record<PortalRole, string> = {
  user: "Traveler",
  rider: "Rider",
  admin: "Admin",
};

type RoleShellProps = {
  role: PortalRole;
  title: string;
  subtitle: string;
  navItems: RoleNavItem[];
};

function navIsActive(itemTo: string, pathname: string, search: string): boolean {
  const [path, qs] = itemTo.split("?");
  const wantTab = new URLSearchParams(qs ?? "").get("tab");
  const curTab = new URLSearchParams(search).get("tab");
  const activePath = pathname === path;
  if (!activePath) return false;
  if (!wantTab) return !curTab;
  // Rider console default is "active" even when ?tab= is omitted.
  if (wantTab === "active") return !curTab || curTab === "active";
  return curTab === wantTab;
}

export function RoleShell({ role, title, subtitle, navItems }: RoleShellProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-border-subtle bg-surface/80">
        <SidebarHeader className="border-b border-border-subtle">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                onClick={() => navigate(navItems[0]?.to ?? "/")}
              >
                <RouteBiteMark size="sm" className="rounded-lg" />
                <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                  <span className="font-bold">{title}</span>
                  <span className="text-xs text-muted-foreground">{subtitle}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigate</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const active = navIsActive(item.to, location.pathname, location.search);
                  return (
                    <SidebarMenuItem key={`${item.to}-${item.label}`}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        onClick={() => navigate(item.to)}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Access</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="px-2">
                <Badge variant="outline" className="justify-start capitalize">
                  {roleBadge[role]} portal
                </Badge>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-border-subtle">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-surface-elevated text-amber">
                    {user?.name?.[0]?.toUpperCase() ?? role[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-medium">{user?.name ?? role}</span>
                  <span className="text-xs text-muted-foreground">
                    @{user?.username ?? role}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={logout} tooltip="Sign out">
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-dvh bg-void">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="min-w-0 flex-1 truncate text-sm text-text-secondary">
            {subtitle}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="hidden shrink-0 border-border-subtle sm:inline-flex"
            render={<Link to="/" />}
          >
            <Home className="size-3.5" data-icon="inline-start" />
            Main page
          </Button>
        </header>
        {role === "user" ? <ReconnectSwiggyBanner /> : null}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
