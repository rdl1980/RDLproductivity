import { describe, expect, it } from "vitest";

import { readThrough, volumeNumber } from "./kdp-series";

describe("volumeNumber", () => {
  it("reads the usual spellings", () => {
    expect(volumeNumber("Delitti del borgo - Libro 2")).toBe(2);
    expect(volumeNumber("Football Tactics Vol. 3: Pressing")).toBe(3);
    expect(volumeNumber("Il Quaderno, Volume III")).toBe(3);
    expect(volumeNumber("Soccer IQ Book 1")).toBe(1);
    expect(volumeNumber("Nostalgia anni '50 Parte 2")).toBe(2);
    expect(volumeNumber("Enigmistica #4")).toBe(4);
    expect(volumeNumber("Diario di un giovane calciatore 2")).toBe(2);
    expect(volumeNumber("Diario di un giovane calciatore 2: la finale")).toBe(2);
  });

  it("ignores years and plain titles", () => {
    expect(volumeNumber("Oroscopo 2027")).toBeNull();
    expect(volumeNumber("Narratologia Essenziale")).toBeNull();
    expect(volumeNumber("300 Questions for Young Players")).toBeNull();
  });
});

describe("readThrough", () => {
  const book = (key: string, volume: number | null, series = "Delitti del borgo") => ({
    key,
    title: `${series} ${volume ?? ""}`,
    account: "main" as const,
    series,
    volume,
  });

  it("chains the volumes of a series", () => {
    const reports = readThrough(
      [
        book("a", 1),
        book("b", 2),
        book("c", 3),
        book("solo", 1, "Altra"),
        book("x", null, "Senza"),
      ],
      new Map([
        ["a", 100],
        ["b", 60],
        ["c", 30],
      ]),
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].volumes.map((v) => [v.volume, v.units, v.readThrough])).toEqual([
      [1, 100, null],
      [2, 60, 60],
      [3, 30, 50],
    ]);
    expect(reports[0].overall).toBe(30);
  });

  it("copes with a volume that sold nothing", () => {
    const [report] = readThrough([book("a", 1), book("b", 2), book("c", 3)], new Map([["b", 5]]));
    expect(report.volumes.map((v) => v.readThrough)).toEqual([null, null, 0]);
    expect(report.overall).toBeNull();
  });
});
