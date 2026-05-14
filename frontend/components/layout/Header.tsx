"use client";

import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { CreditCard, Footprints, LogOut, Settings, User } from "lucide-react";
import { type User as SupabaseUser } from "@supabase/supabase-js";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/auth/actions";

const NAV_ITEMS = [
  { label: "Profile",  Icon: User,       shortcut: "⇧⌘P" },
  { label: "Billing",  Icon: CreditCard, shortcut: "⌘B"  },
  { label: "Settings", Icon: Settings,   shortcut: "⌘S"  },
] as const;

function getInitials(user: SupabaseUser | null): string {
  if (!user) return "JI";
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (name) {
    const parts = (name as string).trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]) return parts[0][0].toUpperCase();
  }
  return user.email ? user.email[0].toUpperCase() : "JI";
}

export function Header() {
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const initials = getInitials(user);

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between w-full h-[88px] px-6 bg-background border-b border-success">

      {/* Left — logo mark + wordmark */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary shrink-0">
          <Footprints size={18} className="text-primary-foreground" />
        </div>
        <span className="font-brand font-bold text-sm text-primary">
          JobInit
        </span>
      </div>

      {/* Right — avatar with dropdown */}
      <Menu.Root>
        <Menu.Trigger className="bg-transparent border-0 p-0 cursor-pointer rounded-full">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={24} className="z-50">
            <Menu.Popup
              className="w-[224px] bg-card border border-border rounded-[6px] outline-none"
              style={{
                boxShadow: "0px 4px 6px -1px rgba(0,0,0,0.1), 0px 2px 4px -2px rgba(0,0,0,0.1)",
              }}
            >

              {/* Section 1 — account label */}
              <Menu.Group>
                <Menu.GroupLabel className="block py-1.5 px-2 text-sm font-semibold text-foreground">
                  {user?.email ?? "My Account"}
                </Menu.GroupLabel>
              </Menu.Group>

              <hr className="border-t border-muted m-0" />

              {/* Section 2 — nav items */}
              {NAV_ITEMS.map(({ label, Icon, shortcut }) => (
                <Menu.LinkItem
                  key={label}
                  href=""
                  className="flex items-center gap-2 py-1.5 px-2 no-underline w-full bg-transparent border-0 outline-none cursor-pointer"
                >
                  <Icon size={16} className="text-foreground shrink-0" />
                  <span className="text-foreground text-sm font-normal flex-1">{label}</span>
                  <span className="text-foreground text-xs font-normal opacity-50">{shortcut}</span>
                </Menu.LinkItem>
              ))}

              <hr className="border-t border-muted m-0" />

              {/* Section 3 — log out */}
              <Menu.Item
                onClick={() => signOut()}
                className="flex items-center gap-2 py-1.5 px-2 w-full bg-transparent border-0 outline-none cursor-pointer"
              >
                <LogOut size={16} className="text-foreground shrink-0" />
                <span className="text-foreground text-sm font-normal flex-1">Log out</span>
                <span className="text-foreground text-xs font-normal opacity-50">⇧⌘Q</span>
              </Menu.Item>

            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </header>
  );
}
