"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect legacy bet-history route to my-bets */
export default function BetHistoryRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/my-bets");
  }, [router]);
  return null;
}
