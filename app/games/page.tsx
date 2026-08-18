import { Suspense } from "react";
import { GamesContent } from "@/components/GamesContent";

export default function GamesPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-muted">
          Loading games...
        </div>
      }
    >
      <GamesContent />
    </Suspense>
  );
}
