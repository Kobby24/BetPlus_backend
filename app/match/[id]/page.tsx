import { notFound } from "next/navigation";
import { MatchMarkets } from "@/components/MatchMarkets";
import { getMatchById } from "@/lib/mock-data";

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const match = getMatchById(id);

  if (!match) notFound();

  return <MatchMarkets match={match} />;
}
