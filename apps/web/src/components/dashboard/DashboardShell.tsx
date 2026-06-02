import { Link, Outlet } from "react-router-dom";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import { Button } from "~/components/ui/button";
import { Home } from "lucide-react";
import { AppSidebar } from "./AppSidebar";

export function DashboardShell() {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset className="bg-void min-h-dvh">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="min-w-0 flex-1 text-sm text-text-secondary truncate">
            Route-aware food ordering
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
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
