import { Link, useLocation, useRouter } from "@tanstack/react-router";
import {
  Book,
  Box,
  CreditCard,
  ExternalLink,
  Github,
  LogIn,
  MessageCircle,
  Rss,
  Search,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Icon } from "./icon-word";

const guestLinks = [
  {
    title: "Explore",
    url: "/explore",
    icon: Search,
    internal: true,
  },
  {
    title: "Docs",
    url: "https://docs.comfydeploy.com",
    icon: Book,
  },
  {
    title: "Discord",
    url: "https://discord.com/invite/c222Cwyget",
    icon: MessageCircle,
  },
  {
    title: "Demo",
    url: "https://demo2.comfydeploy.com",
    icon: Box,
  },
  {
    title: "GitHub",
    url: "https://github.com/BennyKok/comfyui-deploy",
    icon: Github,
  },
  {
    title: "Blog",
    url: "https://www.comfydeploy.com/blog",
    icon: Rss,
  },
];

function PublicShareSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/" className="flex flex-row items-start justify-between">
          <img
            src="/morfeo-icon-light.svg"
            alt="Morfeo Deploy"
            className="ml-0.5 h-7 w-7 dark:hidden"
          />
          <img
            src="/morfeo-icon.svg"
            alt="Morfeo Deploy"
            className="ml-0.5 hidden h-7 w-7 dark:block"
          />
        </Link>
      </SidebarHeader>
    </Sidebar>
  );
}

export function GuestSidebar() {
  const router = useRouter();
  const location = useLocation();
  const { setOpen } = useSidebar();
  const isSharePage = location.pathname.startsWith("/share/");

  useEffect(() => {
    setOpen(!isSharePage);
  }, [isSharePage, setOpen]);

  if (isSharePage) {
    return <PublicShareSidebar />;
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex flex-row items-start justify-between">
          <a
            href="https://morfeodeploy.com"
            className="flex flex-row items-start justify-between"
          >
            <Icon />
          </a>
        </div>

        <div className="space-y-3 px-2">
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => router.navigate({ to: "/auth/sign-in" })}
              className="w-full"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign In
            </Button>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {guestLinks.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {location.pathname === item.url && item.internal && (
                    <div className="absolute top-[5px] left-0 z-10 h-[20px] w-[2px] rounded-r-full bg-primary" />
                  )}
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      "transition-colors dark:hover:bg-zinc-700/40",
                      item.internal &&
                        item.url === location.pathname &&
                        "dark:bg-zinc-800/40",
                    )}
                  >
                    {item.internal ? (
                      <Link to={item.url as "/explore"}>
                        <item.icon
                          className={cn(
                            "transition-colors dark:text-gray-400",
                            item.internal &&
                              item.url === location.pathname &&
                              "dark:text-white",
                          )}
                        />
                        <span
                          className={cn(
                            "transition-colors dark:text-gray-400",
                            item.internal &&
                              item.url === location.pathname &&
                              "dark:text-white",
                          )}
                        >
                          {item.title}
                        </span>
                      </Link>
                    ) : (
                      <a href={item.url} target="_blank" rel="noreferrer">
                        <item.icon className="transition-colors dark:text-gray-400" />
                        <span className="transition-colors dark:text-gray-400">
                          {item.title}
                        </span>
                        <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
                      </a>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-4">
        <div className="px-2">
          <a
            href="/pricing"
            className="flex w-full items-center justify-between rounded-lg border bg-gradient-to-r from-blue-50 to-purple-50 p-3 transition-colors hover:from-blue-100 hover:to-purple-100 dark:from-blue-950/50 dark:to-purple-950/50 dark:hover:from-blue-900/50 dark:hover:to-purple-900/50"
          >
            <div>
              <p className="font-medium text-sm text-foreground">
                View Pricing
              </p>
              <p className="text-muted-foreground text-xs">
                Start free, scale as you grow
              </p>
            </div>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
