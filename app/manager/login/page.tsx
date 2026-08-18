"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Manager access is via Profile → Manager Mode — no public login page. */
export default function ManagerLoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/account");
  }, [router]);

  return null;
}
