import { describe, expect, it } from "vitest";
import { buildIcs, buildMime, calendarLinks, emailHtml, meetingVars, renderTemplate, type MeetingInfo } from "./confirmation";

// Wed 21 Oct 2026, 2:30pm Sydney (AEDT, +11:00).
const meeting: MeetingInfo = {
  clientName: "Sam Taylor",
  company: "Taylor Plumbing",
  title: "Website review",
  start: new Date("2026-10-21T03:30:00Z"),
  end: new Date("2026-10-21T04:15:00Z"),
  timezone: "Australia/Sydney",
  location: "Google Meet: https://meet.google.com/abc-defg-hij",
  meetLink: "https://meet.google.com/abc-defg-hij",
  details: "Go through the new homepage; sign off, then launch.",
  ownerName: "Nick",
};

describe("confirmation emails", () => {
  it("fills placeholders in the client's timezone", () => {
    const vars = meetingVars(meeting);
    expect(vars.first_name).toBe("Sam");
    expect(vars.date).toBe("Wednesday 21 October 2026");
    expect(vars.time).toBe("2:30 pm");
    expect(vars.timezone).toBe("AEDT");
    expect(vars.duration).toBe("45 minutes");
    expect(renderTemplate("Hi {{ first_name }}, see you {{date}}. {{unknown}}", vars)).toBe(
      "Hi Sam, see you Wednesday 21 October 2026. {{unknown}}"
    );
  });

  it("drops the gap left by an empty placeholder", () => {
    const vars = meetingVars({ ...meeting, details: null });
    expect(renderTemplate("Where: x\n\n{{details}}\n\nThanks", vars)).toBe("Where: x\n\nThanks");
  });

  it("builds add-to-calendar links in UTC", () => {
    const links = calendarLinks(meeting, "https://app.example/api/calendar/t.ics");
    expect(links.google).toContain("dates=20261021T033000Z%2F20261021T041500Z");
    expect(links.outlook).toContain("startdt=2026-10-21T03%3A30%3A00.000Z");
    expect(links.ics).toBe("https://app.example/api/calendar/t.ics");
  });

  it("writes a valid, folded .ics with escaped text", () => {
    const ics = buildIcs({ ...meeting, uid: "abc@google.com", organizerEmail: "nick@example.com", now: meeting.start });
    expect(ics).toContain("UID:abc@google.com\r\n");
    expect(ics).toContain("DTSTART:20261021T033000Z\r\n");
    expect(ics.replace(/\r\n /g, "")).toContain("homepage\\; sign off\\, then launch.");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it("escapes HTML from the template", () => {
    const links = calendarLinks(meeting, "https://x/t.ics");
    expect(emailHtml("<b>Hi</b> & welcome", links)).toContain("&lt;b&gt;Hi&lt;/b&gt; &amp; welcome");
  });

  it("adds the logo at the bottom when given", () => {
    const links = calendarLinks(meeting, "https://x/t.ics");
    const html = emailHtml("Hi", links, "https://app.example/brand/logo.png");
    expect(html).toContain('<img src="https://app.example/brand/logo.png" alt="Contour Digital" width="150"');
    expect(html.indexOf("<img")).toBeGreaterThan(html.indexOf("Apple Calendar"));
    expect(emailHtml("Hi", links)).not.toContain("<img");
  });

  it("encodes non-ASCII subjects and attaches the invite", () => {
    const mime = buildMime({
      from: { name: "Nick", email: "nick@example.com" },
      to: { name: "Zoë", email: "zoe@example.com" },
      subject: "Confirmed – see you soon",
      text: "hi",
      html: "<p>hi</p>",
      ics: "BEGIN:VCALENDAR",
      boundary: "b",
    });
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain("To: =?UTF-8?B?");
    expect(mime).toContain('Content-Disposition: attachment; filename="invite.ics"');
    expect(mime.trimEnd().endsWith("--b--")).toBe(true);
  });
});
