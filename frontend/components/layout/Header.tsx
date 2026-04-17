"use client";

import { Menu } from "@base-ui/react/menu";
import { CreditCard, Footprints, LogOut, Settings, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const popupStyle: React.CSSProperties = {
  width: 224,
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  boxShadow:
    "0px 4px 6px -1px rgba(0,0,0,0.1), 0px 2px 4px -2px rgba(0,0,0,0.1)",
  outline: "none",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  cursor: "pointer",
  textDecoration: "none",
  width: "100%",
  background: "transparent",
  border: "none",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontWeight: 400,
  fontSize: 14,
  color: "var(--foreground)",
  flex: 1,
};

const shortcutStyle: React.CSSProperties = {
  fontWeight: 400,
  fontSize: 12,
  color: "var(--foreground)",
  opacity: 0.5,
};

const dividerStyle: React.CSSProperties = {
  borderTop: "1px solid var(--muted)",
  margin: 0,
};

const NAV_ITEMS = [
  { label: "Profile",  Icon: User,       shortcut: "⇧⌘P" },
  { label: "Billing",  Icon: CreditCard, shortcut: "⌘B"  },
  { label: "Settings", Icon: Settings,   shortcut: "⌘S"  },
] as const;

export function Header() {
  return (
    <header
      className="flex items-center justify-between w-full"
      style={{
        height: 88,
        paddingLeft: 24,
        paddingRight: 24,
        background: "var(--background)",
        borderBottom: "1px solid var(--success)",
      }}
    >
      {/* Left — logo mark + wordmark */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: 9999, background: "var(--primary)" }}
        >
          <Footprints size={18} style={{ color: "var(--primary-foreground)" }} />
        </div>
        <span
          style={{
            fontFamily: "var(--font-brand)",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--primary)",
          }}
        >
          JobInit
        </span>
      </div>

      {/* Right — avatar with dropdown */}
      <Menu.Root>
        <Menu.Trigger
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            borderRadius: 9999,
          }}
        >
          <Avatar>
            <AvatarImage src="https://i.pravatar.cc/40" alt="User avatar" />
            <AvatarFallback>JI</AvatarFallback>
          </Avatar>
        </Menu.Trigger>

        <Menu.Portal>
          {/* sideOffset=24: avatar bottom edge is ~64px from top in an 88px header,
              +24 lands the popup at exactly 88px from the viewport top */}
          <Menu.Positioner side="bottom" align="end" sideOffset={24}>
            <Menu.Popup style={popupStyle}>

              {/* Section 1 — account label */}
              <Menu.Group>
                <Menu.GroupLabel
                  style={{
                    padding: "6px 8px",
                    fontWeight: 600,
                    fontSize: 14,
                    color: "var(--foreground)",
                    display: "block",
                  }}
                >
                  My Account
                </Menu.GroupLabel>
              </Menu.Group>

              <hr style={dividerStyle} />

              {/* Section 2 — nav items */}
              {NAV_ITEMS.map(({ label, Icon, shortcut }) => (
                <Menu.LinkItem key={label} href="" style={rowStyle}>
                  <Icon size={16} style={{ color: "var(--foreground)", flexShrink: 0 }} />
                  <span style={labelStyle}>{label}</span>
                  <span style={shortcutStyle}>{shortcut}</span>
                </Menu.LinkItem>
              ))}

              <hr style={dividerStyle} />

              {/* Section 3 — log out */}
              <Menu.LinkItem href="" style={rowStyle}>
                <LogOut size={16} style={{ color: "var(--foreground)", flexShrink: 0 }} />
                <span style={labelStyle}>Log out</span>
                <span style={shortcutStyle}>⇧⌘Q</span>
              </Menu.LinkItem>

            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </header>
  );
}
