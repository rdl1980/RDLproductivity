"use client";

import {
  ArchiveIcon,
  BarChart3Icon,
  DownloadIcon,
  HistoryIcon,
  LayoutTemplateIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlugIcon,
  SunIcon,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string) {
  const parts = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return (
    parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 1)
  ).toUpperCase();
}

export function UserMenu({ name, signOut }: { name: string; signOut: () => Promise<void> }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Menu utente"
          className="gap-2 rounded-full pr-1 pl-1 md:pr-3"
        >
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-rose-400 text-xs font-semibold text-rose-950"
          >
            {initials(name)}
          </span>
          <span className="hidden max-w-32 truncate md:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/archive">
            <ArchiveIcon />
            Archivio
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/stats">
            <BarChart3Icon />
            Statistiche
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/templates">
            <LayoutTemplateIcon />
            Template
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/activity">
            <HistoryIcon />
            Attività
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/api/export" download>
            <DownloadIcon />
            Esporta backup (JSON)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/connections">
            <PlugIcon />
            Integrazioni
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Tema
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <SunIcon />
            Chiaro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon />
            Scuro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon />
            Sistema
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOutIcon />
          Esci
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
