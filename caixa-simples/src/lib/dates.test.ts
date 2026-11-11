import { describe, expect, it } from "vitest";
import { addDaysISO, endOfMonthISO, formatDateBR, formatDateTimeBR, presetRange, todayISO } from "./dates";

describe("datas em America/Sao_Paulo", () => {
  it("meia-noite UTC ainda é o dia anterior em Brasília", () => {
    expect(todayISO(new Date("2026-03-05T01:30:00Z"))).toBe("2026-03-04");
    expect(todayISO(new Date("2026-03-05T03:00:00Z"))).toBe("2026-03-05");
  });
  it("formata no padrão brasileiro", () => {
    expect(formatDateBR("2026-03-05")).toBe("05/03/2026");
    expect(formatDateTimeBR("2026-03-05T15:07:00Z")).toBe("05/03/2026 12:07");
    expect(formatDateBR(null)).toBe("—");
  });
  it("aritmética de dias e meses", () => {
    expect(addDaysISO("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(endOfMonthISO("2028-02-10")).toBe("2028-02-29");
  });
  it("períodos pré-definidos", () => {
    expect(presetRange("7d", "2026-03-10")).toEqual({ from: "2026-03-04", to: "2026-03-10" });
    expect(presetRange("month", "2026-03-10")).toEqual({ from: "2026-03-01", to: "2026-03-10" });
    expect(presetRange("last-month", "2026-03-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("semana e ano", () => {
  it("semana começa na segunda-feira", () => {
    expect(presetRange("week", "2026-11-04")).toEqual({ from: "2026-11-02", to: "2026-11-04" }); // quarta
    expect(presetRange("week", "2026-11-08")).toEqual({ from: "2026-11-02", to: "2026-11-08" }); // domingo
    expect(presetRange("week", "2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-02" }); // segunda
  });
  it("ano do dia 1º de janeiro até hoje", () => {
    expect(presetRange("year", "2026-11-04")).toEqual({ from: "2026-01-01", to: "2026-11-04" });
  });
});
