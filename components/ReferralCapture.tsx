"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { setPendingReferralCode } from "@/lib/referral-store";

function ReferralCaptureInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) setPendingReferralCode(ref);
  }, [searchParams]);

  return null;
}

/** Persists ?ref= manager code until the user registers. */
export function ReferralCapture() {
  return (
    <Suspense fallback={null}>
      <ReferralCaptureInner />
    </Suspense>
  );
}
