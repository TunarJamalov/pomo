"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  return (
    <button 
      onClick={() => signOut({ callbackUrl: '/' })}
      className="btn-secondary text-sm px-4 py-2 text-red-400 hover:text-red-300 hover:border-red-400/30"
    >
      <LogOut size={16} /> Logout
    </button>
  );
}
