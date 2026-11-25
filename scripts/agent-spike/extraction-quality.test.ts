import { describe, expect, it } from "vitest";

import { classifyExtraction } from "./extraction-quality.js";

const terms = [
  "Cabo flexível 6mm²",
  "Cabo flexível 10mm²",
  "Cabo PP 4x4mm²",
  "Terminal compressão",
  "Multímetro digital",
];

const goodText = `ORDEM DE COMPRA
1  Cabo flexível 6mm² 750V   30 RL
2  Cabo flexível 10mm² 750V  20 RL
3  Cabo PP 4x4mm²            500 m
4  Terminal compressão 10mm² 15 cx
5  Multímetro digital        4 un`;

describe("classifyExtraction", () => {
  it("classifies a PDF without text as empty", () => {
    const result = classifyExtraction({
      text: "  \n 12 \n",
      pageCount: 1,
      expectedTerms: terms,
    });

    expect(result.classe).toBe("empty");
    expect(result.charsPerPage).toBe(2);
  });

  it("measures characters per page across pages", () => {
    const result = classifyExtraction({
      text: "a".repeat(30),
      pageCount: 2,
      expectedTerms: terms,
    });

    expect(result.charsPerPage).toBe(15);
    expect(result.classe).toBe("empty");
  });

  it("classifies text with the terms in order as good", () => {
    const result = classifyExtraction({
      text: goodText,
      pageCount: 1,
      expectedTerms: terms,
    });

    expect(result).toMatchObject({
      classe: "good",
      termsFound: 5,
      termsExpected: 5,
      inOrder: true,
    });
  });

  it("ignores case, accents, and spacing when finding terms", () => {
    const result = classifyExtraction({
      text: goodText.toUpperCase().replaceAll(" ", "   "),
      pageCount: 1,
      expectedTerms: terms,
    });

    expect(result.termsFound).toBe(5);
  });

  it("accepts any alternative of a term", () => {
    const result = classifyExtraction({
      text: `Contrato CF-2025-014, vigência até 30/11/2026. ${"x".repeat(40)}`,
      pageCount: 1,
      expectedTerms: ["CF-2025-014", ["2026-11-30", "30/11/2026"]],
    });

    expect(result).toMatchObject({ classe: "good", termsFound: 2 });
  });

  it("classifies text missing most terms as scrambled", () => {
    const result = classifyExtraction({
      text: `${"Cabo flexível 6mm² ".repeat(3)} 30 20 500 15 4 RL RL m cx un`,
      pageCount: 1,
      expectedTerms: terms,
    });

    expect(result).toMatchObject({ classe: "scrambled", termsFound: 1 });
  });

  it("classifies text with the terms out of order as scrambled", () => {
    const shuffled = [...goodText.split("\n")].reverse().join("\n");
    const result = classifyExtraction({
      text: shuffled,
      pageCount: 1,
      expectedTerms: terms,
    });

    expect(result).toMatchObject({
      classe: "scrambled",
      termsFound: 5,
      inOrder: false,
    });
  });

  it("requires 80% of the terms to be good", () => {
    const fourOfFive = goodText.replace("Multímetro digital", "Item");

    expect(
      classifyExtraction({
        text: fourOfFive,
        pageCount: 1,
        expectedTerms: terms,
      }).classe,
    ).toBe("good");

    const threeOfFive = fourOfFive.replace("Terminal compressão", "Item");

    expect(
      classifyExtraction({
        text: threeOfFive,
        pageCount: 1,
        expectedTerms: terms,
      }).classe,
    ).toBe("scrambled");
  });
});
