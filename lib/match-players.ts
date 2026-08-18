import type { Match } from "./types";

export interface MatchPlayer {
  id: string;
  name: string;
  team: "home" | "away";
  anytimeOdds: number;
  firstOdds: number;
  lastOdds: number;
  score2Odds: number;
  score3Odds: number;
  cardOdds: number;
}

const SQUADS: Record<string, string[]> = {
  Arsenal: ["B. Saka", "G. Jesus", "M. Martinelli", "M. Ødegaard", "K. Havertz", "D. Rice"],
  Chelsea: ["C. Palmer", "N. Jackson", "R. Sterling", "E. Fernández", "N. Madueke", "C. Nkunku"],
  Liverpool: ["M. Salah", "D. Núñez", "L. Diaz", "C. Gakpo", "D. Szoboszlai", "A. Mac Allister"],
  "Manchester City": ["E. Haaland", "J. Doku", "J. Alvarez", "P. Foden", "B. Silva", "K. De Bruyne"],
  "Manchester United": ["M. Rashford", "R. Højlund", "A. Garnacho", "B. Fernandes", "M. Mount", "A. Diallo"],
  Tottenham: ["H. Son", "R. Bentancur", "D. Kulusevski", "J. Maddison", "R. Sánchez", "P. Sarr"],
  "Real Madrid": ["V. Júnior", "J. Bellingham", "R. Rodrygo", "K. Mbappé", "F. Valverde", "J. Musiala"],
  Barcelona: ["R. Lewandowski", "L. Yamal", "R. Raphinha", "F. Torres", "P. Gavi", "I. Gündogan"],
  "Inter Milan": ["L. Martínez", "M. Thuram", "N. Barella", "H. Çalhanoğlu", "F. Acerbi", "D. Dumfries"],
  "AC Milan": ["O. Giroud", "R. Leão", "T. Reijnders", "R. Pulisic", "M. Loftus-Cheek", "Y. Fofana"],
  "Bayern Munich": ["H. Kane", "S. Gnabry", "L. Sané", "J. Musiala", "S. Olise", "K. Coman"],
  "Borussia Dortmund": ["S. Haller", "J. Malen", "M. Reus", "J. Bellingham", "K. Adeyemi", "M. Sabitzer"],
  Nigeria: ["V. Osimhen", "A. Lookman", "S. Chukwueze", "A. Iwobi", "K. Onuachu", "T. Simon"],
  Ghana: ["M. Kudus", "J. Ayew", "I. Williams", "A. Semenyo", "C. Bissouma", "E. Kyei"],
  Senegal: ["S. Mané", "N. Jackson", "I. Sarr", "P. Gueye", "I. Ndiaye", "E. Camara"],
  Cameroon: ["V. Aboubakar", "K. Toko Ekambi", "A. Onana", "B. Mbeumo", "F. Anguissa", "C. Bassogog"],
  Benfica: ["A. Pavlidis", "V. Guedes", "O. Di María", "A. Silva", "F. Aursnes", "N. Otamendi"],
  Nice: ["T. Moffi", "G. Laborde", "M. Boudaoui", "M. Sanson", "A. Mendy", "D. Barcola"],
  Angola: ["Geraldo", "M. Mabululu", "Zito", "Fredy", "Show", "Milson"],
  "Atletico Madrid": ["A. Griezmann", "J. Álvarez", "A. Sørloth", "M. Llorente", "K. Koke", "R. De Paul"],
  Sevilla: ["I. Romero", "Suso", "J. Ocampos", "L. Agoumé", "D. Acuña", "Y. En-Nesyri"],
  "FC Tokyo": ["K. Ogawa", "Y. Kubo", "K. Nagai", "S. Miyashiro", "H. Nakamura", "R. Kajikawa"],
  "Cerezo Osaka": ["B. Yamasaki", "H. Nakamura", "R. Doan", "T. Inui", "C. Mochida", "S. Kawasaki"],
};

const FALLBACK_FIRST = ["João Silva", "Kwame Mensah", "Carlos Ruiz", "Ahmed Diallo", "Lucas Santos"];
const FALLBACK_LAST = ["Pierre Dubois", "Samuel Osei", "Marco Rossi", "Youssef Ali", "Diego Lopez"];

function squadForTeam(teamName: string, side: "home" | "away", count = 6): string[] {
  if (SQUADS[teamName]) return SQUADS[teamName].slice(0, count);
  const pool = side === "home" ? FALLBACK_FIRST : FALLBACK_LAST;
  return pool.slice(0, count).map((n, i) => `${teamName.split(" ")[0]} ${n.split(" ")[0]}`);
}

function r(n: number) {
  return Math.round(n * 100) / 100;
}

function oddsForRole(index: number, base: number) {
  const mult = 1 + index * 0.35;
  return r(base * mult);
}

export function getMatchPlayers(match: Match): MatchPlayer[] {
  const homeNames = squadForTeam(match.homeTeam, "home");
  const awayNames = squadForTeam(match.awayTeam, "away");
  const homeBase = r(2.2 / Math.sqrt(match.odds.home));
  const awayBase = r(2.5 / Math.sqrt(match.odds.away));

  const homePlayers: MatchPlayer[] = homeNames.map((name, i) => ({
    id: `h-${i}`,
    name,
    team: "home" as const,
    anytimeOdds: oddsForRole(i, homeBase),
    firstOdds: oddsForRole(i, homeBase * 2.2),
    lastOdds: oddsForRole(i, homeBase * 2.3),
    score2Odds: oddsForRole(i, homeBase * 3.5),
    score3Odds: oddsForRole(i, homeBase * 10),
    cardOdds: oddsForRole(i, 3.2),
  }));

  const awayPlayers: MatchPlayer[] = awayNames.map((name, i) => ({
    id: `a-${i}`,
    name,
    team: "away" as const,
    anytimeOdds: oddsForRole(i, awayBase),
    firstOdds: oddsForRole(i, awayBase * 2.2),
    lastOdds: oddsForRole(i, awayBase * 2.3),
    score2Odds: oddsForRole(i, awayBase * 3.5),
    score3Odds: oddsForRole(i, awayBase * 10),
    cardOdds: oddsForRole(i, 3.4),
  }));

  return [...homePlayers, ...awayPlayers];
}

export function getPlayersByTeam(players: MatchPlayer[]) {
  return {
    home: players.filter((p) => p.team === "home"),
    away: players.filter((p) => p.team === "away"),
  };
}
