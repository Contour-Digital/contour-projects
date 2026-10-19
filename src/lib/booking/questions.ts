// Pre-meeting questions a meeting type asks on its booking page.

export type QuestionType = "short_text" | "paragraph" | "checkboxes" | "single_choice";

export type Question = {
  id: string;
  label: string;
  type: QuestionType;
  /** Choices for checkboxes and single_choice; empty otherwise. */
  options: string[];
  required: boolean;
};

/** Saved on the booking, with the question's wording at the time. */
export type Answer = { question: string; answer: string | string[] };

export const QUESTION_TYPES: Record<QuestionType, string> = {
  short_text: "Short text",
  paragraph: "Paragraph",
  checkboxes: "Tickboxes (pick any)",
  single_choice: "Single choice (pick one)",
};

export const hasOptions = (t: QuestionType) => t === "checkboxes" || t === "single_choice";

/** Tidies questions from the meeting type form before saving; returns an error if one isn't usable. */
export function cleanQuestions(questions: Question[]): { questions: Question[] } | { error: string } {
  const out: Question[] = [];
  for (const q of questions) {
    const label = q.label.trim();
    const options = hasOptions(q.type) ? q.options.map((o) => o.trim()).filter(Boolean) : [];
    if (!label && !options.length) continue; // an untouched blank question
    if (!label) return { error: "Every question needs some wording." };
    if (hasOptions(q.type) && options.length < (q.type === "single_choice" ? 2 : 1)) {
      return { error: `Add ${q.type === "single_choice" ? "at least two choices" : "at least one tickbox"} to "${label}".` };
    }
    out.push({ id: q.id, label: label.slice(0, 300), type: q.type, options: [...new Set(options)].map((o) => o.slice(0, 200)), required: q.required });
  }
  return { questions: out };
}

/**
 * Checks a booker's answers (keyed by question id) against the meeting type's
 * questions. Unknown questions and choices that aren't offered are ignored.
 */
export function checkAnswers(questions: Question[], raw: unknown): { answers: Answer[] } | { error: string } {
  const given = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const answers: Answer[] = [];
  for (const q of questions) {
    const value = given[q.id];
    let answer: string | string[];
    if (q.type === "checkboxes") {
      answer = Array.isArray(value) ? q.options.filter((o) => value.includes(o)) : [];
    } else if (q.type === "single_choice") {
      answer = typeof value === "string" && q.options.includes(value) ? value : "";
    } else {
      answer = typeof value === "string" ? value.trim().slice(0, q.type === "paragraph" ? 4000 : 500) : "";
    }
    const empty = Array.isArray(answer) ? answer.length === 0 : !answer;
    if (empty && q.required) return { error: `Please answer "${q.label}".` };
    if (!empty) answers.push({ question: q.label, answer });
  }
  return { answers };
}

export const answerText = (a: Answer) => (Array.isArray(a.answer) ? a.answer.join(", ") : a.answer);

/** Plain-text Q&A for the calendar event and email. */
export function formatAnswers(answers: Answer[] | null | undefined): string {
  return (answers ?? []).map((a) => `${a.question}\n${answerText(a)}`).join("\n\n");
}
