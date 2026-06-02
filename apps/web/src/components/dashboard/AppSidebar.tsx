import { Link, useLocation } from "react-router-dom";
import {
  Home,
  LayoutDashboard,
  MapPinned,
  Package,
  Route,
  LogOut,
} from "lucide-react";
import { RouteBiteLogo, RouteBiteMark } from "~/components/brand/RouteBiteLogo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { useAuth } from "~/stores/auth";

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/routes/new", label: "Plan Route", icon: Route },
  { to: "/intercepts", label: "Intercepts", icon: MapPinned },
  { to: "/orders", label: "Orders", icon: Package },
];

export function AppSidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-border-subtle bg-surface/80">
      <SidebarHeader className="border-b border-border-subtle">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/dashboard" />}>
              <RouteBiteMark size="sm" className="rounded-lg" />
              <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="font-bold">RouteBite</span>
                <span className="text-xs text-muted-foreground">Journey dashboard</span>
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
                const active =
                  item.to === "/"
                    ? false
                    : location.pathname === item.to ||
                      (item.to !== "/dashboard" && location.pathname.startsWith(item.to));
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      render={<Link to={item.to} />}
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
          <SidebarGroupLabel>Live stack</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-2 flex flex-col gap-2">
              <Badge variant="outline" className="justify-start border-emerald/30 text-emerald">
                Maps · Google Routes
              </Badge>
              <Badge variant="outline" className="justify-start border-amber/30 text-amber">
                Swiggy · Mock MCP
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
                  {user?.name?.[0]?.toUpperCase() ?? "R"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">{user?.name ?? "RouteBite user"}</span>
                <span className="text-xs text-muted-foreground">ID {user?.id ?? "—"}</span>
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
  );
}
