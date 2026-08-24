/**
 * PREMIUM TEMPLATES — polished, ready-to-edit document starters for
 * NEXUS Studio. Each template is complete professional content (not an
 * outline) that AI can then edit, enhance, convert or extend.
 */

export interface StudioTemplate {
  id: string
  label: string
  category: 'Business' | 'Personal' | 'Marketing' | 'Reports'
  icon: 'file' | 'pitch' | 'brief' | 'chart' | 'letter' | 'resume' | 'news' | 'plan' | 'contract' | 'notes' | 'case' | 'press'
  premium?: boolean
  markdown: string
}

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'blank',
    label: 'Blank document',
    category: 'Business',
    icon: 'file',
    markdown: '# Untitled\n\nStart writing, or use the AI tools above…',
  },
  {
    id: 'pitch-deck',
    label: 'Pitch deck brief',
    category: 'Business',
    icon: 'pitch',
    premium: true,
    markdown: `# [Company Name] — Seed Round Pitch

## The Problem
[Describe the painful, expensive problem your target customers face today. Quantify it: how much time or money is lost?]

## The Solution
[One paragraph explaining what you built and why it's 10x better. Lead with the magic moment.]

## Market
- **TAM:** [$X B — the total market]
- **SAM:** [$Y M — the segment you serve first]
- **SOM:** [$Z M — what you can win in 3 years]

## Traction
| Metric | 6 months ago | Today |
|--------|-------------|-------|
| Users | | |
| Revenue (MRR) | | |
| Retention | | |

## Business Model
[How you make money: pricing, unit economics, CAC vs LTV.]

## Competition
[2-3 alternatives and your unfair advantage over each.]

## Team
- **[Name]** — [Role]: [one-line credibility]
- **[Name]** — [Role]: [one-line credibility]

## The Ask
We're raising **$[X]M** to [milestone 1], [milestone 2], and [milestone 3] over the next [N] months.`,
  },
  {
    id: 'business-plan',
    label: 'Business plan',
    category: 'Business',
    icon: 'plan',
    premium: true,
    markdown: `# [Company Name] Business Plan

## Executive Summary
[Company Name] is a [industry] company that [one-sentence value proposition]. We are seeking [amount] to [use of funds].

## Company Description
- **Founded:** [year] by [founders]
- **Location:** [city, country]
- **Legal structure:** [LLC / Corporation]

## Products & Services
[Describe your offering in detail — what it is, how it's delivered, and the pricing tiers.]

## Market Analysis
**Target customer:** [persona description]
**Market size:** [numbers with source]
**Trends:** [2-3 trends that make now the right time]

## Strategy & Roadmap
1. **Phase 1 (Months 1-6):** [goal]
2. **Phase 2 (Months 7-12):** [goal]
3. **Phase 3 (Year 2):** [goal]

## Financial Projections
| | Year 1 | Year 2 | Year 3 |
|---|--------|--------|--------|
| Revenue | | | |
| Costs | | | |
| Net | | | |

## Risks & Mitigation
- **[Risk]:** [mitigation]`,
  },
  {
    id: 'proposal',
    label: 'Project proposal',
    category: 'Business',
    icon: 'brief',
    premium: true,
    markdown: `# Project Proposal: [Project Name]

**Prepared for:** [Client]
**Prepared by:** [Your name]
**Date:** [date]

## Objective
[What will this project achieve, in one measurable sentence?]

## Scope of Work
1. **[Work stream 1]** — [deliverables and acceptance criteria]
2. **[Work stream 2]** — [deliverables and acceptance criteria]
3. **[Work stream 3]** — [deliverables and acceptance criteria]

## Timeline
| Milestone | Deliverable | Due |
|----------|-------------|-----|
| Kickoff | Project plan | Week 1 |
| Draft | [deliverable] | Week [N] |
| Review | Feedback round | Week [N] |
| Delivery | Final handoff | Week [N] |

## Investment
**Total: [$X]** — [what's included]
- [Line item 1]: [$a]
- [Line item 2]: [$b]

## Terms
- 50% deposit, 50% on delivery
- [N] revision rounds included
- Valid for 30 days`,
  },
  {
    id: 'resume',
    label: 'Resume / CV',
    category: 'Personal',
    icon: 'resume',
    premium: true,
    markdown: `# [Your Name]
[City] · [email] · [phone] · [LinkedIn]

## Professional Summary
[2-3 lines: who you are, years of experience, and your strongest specialism with a proof point.]

## Experience

### [Job Title] — [Company]
*[Start date] – [End date]*
- [Achievement with a number: grew X by Y%, saved $Z, led a team of N]
- [Achievement]
- [Achievement]

### [Previous Job Title] — [Previous Company]
*[Dates]*
- [Achievement]
- [Achievement]

## Education
**[Degree]** — [University], [year]

## Skills
**Core:** [skill 1] · [skill 2] · [skill 3]
**Tools:** [tool 1] · [tool 2] · [tool 3]
**Languages:** [language (level)]`,
  },
  {
    id: 'cover-letter',
    label: 'Cover letter',
    category: 'Personal',
    icon: 'letter',
    markdown: `# Cover Letter

[Your name]
[Address] · [email] · [phone]

[Date]

Dear [Hiring manager name],

I'm applying for the **[Position]** role at [Company]. [One sentence: why this company specifically — mention something real about them.]

In my current role as [current title], I [strongest relevant achievement with a number]. Before that, I [second achievement]. I'm particularly proud of [a story that shows the exact skill they need].

What draws me to [Company] is [specific reason — a product, value, or challenge]. I'd bring [concrete skill] plus [soft skill], and I'd be excited to [what you'd do in the first 90 days].

I'd love to discuss how I can help [team/goal]. Thank you for your consideration.

Sincerely,
[Your name]`,
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    category: 'Marketing',
    icon: 'news',
    premium: true,
    markdown: `# [Newsletter Name]
**Issue #[N] · [Date]**

## 🎯 This week's big idea
[One paragraph: the single insight readers should remember.]

## 📰 The news that matters
- **[Headline 1]** — [why it matters in 2 lines]
- **[Headline 2]** — [why it matters]
- **[Headline 3]** — [why it matters]

## 🛠️ Tool of the week
**[Tool name]** ([link]) — [what it does and who it's for]. Best for: [use case].

## 💡 Worth your time
- [Article/video recommendation with one-line pitch]
- [Recommendation]

## 👋 Sign-off
[One personal line.]
— [Your name]

*Reply to this email — I read everything.*`,
  },
  {
    id: 'press-release',
    label: 'Press release',
    category: 'Marketing',
    icon: 'press',
    premium: true,
    markdown: `# FOR IMMEDIATE RELEASE

## [Company] Launches [Product] — [One-line news hook]

**[City, Date]** — [Company], [one-line description], today announced [product], [what it is in one sentence].

"[Quote from CEO — something with an opinion, not marketing fluff]," said [Name], [title] of [Company]. "[Second sentence of quote.]"

[Product] addresses [problem] by [how it works]. Key capabilities include:

- **[Capability 1]** — [benefit]
- **[Capability 2]** — [benefit]
- **[Capability 3]** — [benefit]

[Paragraph: market context and why now.]

[Paragraph: availability, pricing, and where to get it.]

**About [Company]**
[Two lines about the company.]

**Media contact:**
[Name] · [email] · [phone]`,
  },
  {
    id: 'quarterly-report',
    label: 'Quarterly report',
    category: 'Reports',
    icon: 'chart',
    premium: true,
    markdown: `# [Company] — Q[N] [Year] Report

## Executive Summary
[N] highlights from the quarter, [one positive headline metric], and [one challenge being addressed].

## Key Metrics
| Metric | Target | Actual | Δ |
|--------|--------|--------|---|
| Revenue | | | |
| New customers | | | |
| Churn | | | |
| NPS | | | |

## What Went Well
1. **[Win 1]** — [impact]
2. **[Win 2]** — [impact]

## What Didn't
1. **[Miss 1]** — [root cause]
2. **[Miss 2]** — [root cause]

## Next Quarter Priorities
- [Priority 1 with owner and target]
- [Priority 2]
- [Priority 3]

## Ask / Decisions Needed
- [Decision the reader must make]`,
  },
  {
    id: 'case-study',
    label: 'Case study',
    category: 'Marketing',
    icon: 'case',
    premium: true,
    markdown: `# Case Study: How [Customer] Achieved [Result]

## The Customer
[Company] is [description, size, industry] based in [location].

## The Challenge
[2-3 sentences on the problem they faced and what it cost them.]

## The Solution
[How your product/service was implemented — timeline, rollout, key features used.]

> "[Best customer quote about the experience]" — [Name], [Title]

## The Results
- **[Metric 1]:** [before] → [after] ([%] improvement)
- **[Metric 2]:** [result]
- **[Metric 3]:** [result]

## Key Takeaways
1. [Lesson]
2. [Lesson]

**Ready to get similar results?** [CTA — contact / demo link]`,
  },
  {
    id: 'sop',
    label: 'Process / SOP',
    category: 'Business',
    icon: 'contract',
    markdown: `# Standard Operating Procedure: [Process Name]

**SOP #:** [ID] · **Version:** 1.0 · **Owner:** [name] · **Last updated:** [date]

## Purpose
[One sentence: what this procedure achieves.]

## Scope
[When this applies and to whom.]

## Procedure
1. **[Step 1]** — [detail, including who and any tools]
2. **[Step 2]** — [detail]
3. **[Step 3]** — [detail]
4. **[Step 4]** — [detail]

## Quality Checklist
- [ ] [Check 1]
- [ ] [Check 2]
- [ ] [Check 3]

## Exceptions & Escalation
If [exception], then [action]. Escalate to [role] when [condition].

## Revision History
| Version | Date | Change | Author |
|---------|------|--------|--------|
| 1.0 | | Initial | |`,
  },
  {
    id: 'meeting-notes',
    label: 'Meeting notes',
    category: 'Business',
    icon: 'notes',
    markdown: `# Meeting Notes — [Topic]

**Date:** [date] · **Time:** [time]
**Attendees:** [names]
**Absent:** [names]

## Agenda
1. [Topic 1]
2. [Topic 2]

## Discussion
### [Topic 1]
[Summary of what was covered and key points raised.]

### [Topic 2]
[Summary.]

## Decisions
- **[Decision 1]** — [rationale]

## Action Items
| Task | Owner | Due |
|------|-------|-----|
| | | |

## Next Meeting
[date/time and planned topic]`,
  },
]

export const TEMPLATE_CATEGORIES: Array<StudioTemplate['category'] | 'All'> = [
  'All',
  'Business',
  'Personal',
  'Marketing',
  'Reports',
]
