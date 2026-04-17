import { Footprints } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9999,
            background: "var(--primary)",
          }}
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

      <Avatar>
        <AvatarImage src="https://i.pravatar.cc/40" alt="User avatar" />
        <AvatarFallback>JI</AvatarFallback>
      </Avatar>
    </header>
  );
}
