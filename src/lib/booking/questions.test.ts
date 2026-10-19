import { describe, expect, it } from "vitest";
import { checkAnswers, cleanQuestions, formatAnswers, type Question } from "./questions";

const qs: Question[] = [
  { id: "a", label: "Business name?", type: "short_text", options: [], required: true },
  { id: "b", label: "Tell us more", type: "paragraph", options: [], required: false },
  { id: "c", label: "Services", type: "checkboxes", options: ["Website", "SEO", "Branding"], required: false },
  { id: "d", label: "Budget", type: "single_choice", options: ["Under $5k", "$5k+"], required: true },
];

describe("checkAnswers", () => {
  it("keeps valid answers in question order with the question wording", () => {
    const r = checkAnswers(qs, { a: " Acme ", c: ["SEO", "Hacking", "Website"], d: "$5k+" });
    expect(r).toEqual({
      answers: [
        { question: "Business name?", answer: "Acme" },
        { question: "Services", answer: ["Website", "SEO"] },
        { question: "Budget", answer: "$5k+" },
      ],
    });
  });

  it("requires required questions, and ignores choices that aren't offered", () => {
    expect(checkAnswers(qs, { d: "$5k+" })).toEqual({ error: 'Please answer "Business name?".' });
    expect(checkAnswers(qs, { a: "Acme", d: "$1m" })).toEqual({ error: 'Please answer "Budget".' });
  });

  it("copes with no answers when nothing is required", () => {
    expect(checkAnswers([qs[1]], undefined)).toEqual({ answers: [] });
  });
});

describe("cleanQuestions", () => {
  it("drops blank questions and empty choices", () => {
    const r = cleanQuestions([
      { id: "x", label: "", type: "short_text", options: [], required: false },
      { id: "y", label: " Services ", type: "checkboxes", options: ["Web", " ", "Web", "SEO"], required: true },
      { id: "z", label: "Name", type: "short_text", options: ["leftover"], required: false },
    ]);
    expect(r).toEqual({
      questions: [
        { id: "y", label: "Services", type: "checkboxes", options: ["Web", "SEO"], required: true },
        { id: "z", label: "Name", type: "short_text", options: [], required: false },
      ],
    });
  });

  it("asks for enough choices", () => {
    expect(cleanQuestions([{ id: "y", label: "Budget", type: "single_choice", options: ["One"], required: false }])).toHaveProperty("error");
  });
});

it("formats answers for the calendar", () => {
  expect(formatAnswers([{ question: "Services", answer: ["Web", "SEO"] }, { question: "Name", answer: "Acme" }])).toBe("Services\nWeb, SEO\n\nName\nAcme");
});
