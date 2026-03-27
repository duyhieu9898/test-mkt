/**
 * Marketing Frameworks — Proven conversion patterns
 *
 * Used by: Landing Page Agent, Social Post Agent, Banner Agent, Email Agent
 * Source: Affiliate-skills repo + industry best practices
 */

// ============================================================
// 7 VIRAL SOCIAL POST FRAMEWORKS
// ============================================================

export const VIRAL_FRAMEWORKS = [
  {
    name: 'Transformation Story',
    platforms: ['linkedin', 'facebook'],
    structure: 'Hook (specific pain) → Turning point (discovery) → Transformation (metrics) → Soft CTA',
    example: 'I was spending 40 hours/week on [task]. Then I found [solution]. Now I do it in 2 hours. Here\'s how...',
  },
  {
    name: 'Contrarian Take',
    platforms: ['linkedin', 'twitter'],
    structure: 'Bold disagreeable statement → Common wisdom → Counter-evidence → Product as solution',
    example: '"[Common advice] is actually hurting your business." Here\'s why — and what to do instead.',
  },
  {
    name: 'Problem → Solution Thread',
    platforms: ['twitter', 'linkedin'],
    structure: 'Problem + promise → Pain amplification → Solutions (3-5) → Results → CTA',
    example: 'Most [audience] waste time on [problem]. Here are 5 ways to fix it 🧵',
  },
  {
    name: 'Hot Take',
    platforms: ['twitter', 'linkedin'],
    structure: 'Provocative 1-liner → Expansion → Evidence → Product mention → Question for debate',
    example: '"[Industry norm] is dead." Here\'s what smart [audience] are doing instead...',
  },
  {
    name: 'Genuine Recommendation',
    platforms: ['facebook', 'reddit'],
    structure: 'Context → Journey (alternatives tried) → Discovery → Honest pros/cons → Verdict',
    example: 'I tried 5 different [tools] for [task]. Here\'s my honest ranking with pros and cons...',
  },
  {
    name: 'Before/After',
    platforms: ['linkedin', 'facebook', 'instagram'],
    structure: '"Before: painful reality" → "After: improved reality" → Metrics → Soft CTA',
    example: 'Before: 3 hours creating content. After: 15 minutes with AI. The difference? ...',
  },
  {
    name: 'Listicle / Tool Stack',
    platforms: ['twitter', 'linkedin', 'instagram'],
    structure: '"X tools I use for [goal]" → List 5-7 tools → "What do you use?"',
    example: '7 AI tools I use daily to run my business: 1. [Tool] for [task] 2. ...',
  },
];

export function getViralFrameworkPrompt(platform: string): string {
  const relevant = VIRAL_FRAMEWORKS.filter((f) =>
    f.platforms.includes(platform.toLowerCase())
  );
  return relevant.map((f) =>
    `Framework: ${f.name}\nStructure: ${f.structure}\nExample: ${f.example}`
  ).join('\n\n');
}

// ============================================================
// AIDA LANDING PAGE FRAMEWORK
// ============================================================

export const AIDA_FRAMEWORK = `
LANDING PAGE STRUCTURE (AIDA Model):

1. ATTENTION (Hero Section):
   - Headline: 6-12 words, benefit-driven
   - Subheadline: 15-25 words, specific outcome
   - Primary CTA button (high contrast, action verb)
   - Trust signal (rating, user count)
   - Above-fold must be COMPLETE (no scrolling needed to understand offer)

2. INTEREST (Features/Benefits):
   - 3-6 feature cards with icons
   - Each: Icon → Name → 1-2 sentence BENEFIT (not feature description)
   - "How it works" section (3 simple steps)

3. DESIRE (Social Proof):
   - Testimonials (specific quotes with names)
   - Metrics ("Join 4,200+ businesses")
   - Case study or before/after
   - Logos of clients/partners

4. ACTION (CTA Sections):
   - MINIMUM 3 CTAs distributed: hero, mid-page, bottom
   - CTA button: action verb + benefit ("Start My Free Trial" > "Submit")
   - FAQ section that handles objections
   - Final CTA with urgency or guarantee

DESIGN RULES:
- Mobile-first (90%+ traffic is mobile)
- Full-width CTA buttons on mobile
- Minimum 44x44px touch targets
- High contrast CTA buttons
`;

// ============================================================
// PLATFORM-SPECIFIC AD COPY SPECS
// ============================================================

export const AD_COPY_SPECS: Record<string, {
  primaryText: number;
  headline: number;
  description: number;
  ctaOptions: string[];
  notes: string;
}> = {
  facebook: {
    primaryText: 125,
    headline: 40,
    description: 30,
    ctaOptions: ['Learn More', 'Sign Up', 'Shop Now', 'Get Quote', 'Book Now'],
    notes: 'Primary text: 125 chars above fold, can be longer. Headline appears below image.',
  },
  instagram: {
    primaryText: 125,
    headline: 40,
    description: 30,
    ctaOptions: ['Learn More', 'Shop Now', 'Sign Up'],
    notes: 'Same as Facebook. Visual-first — image quality matters most.',
  },
  google_search: {
    primaryText: 90,
    headline: 30,
    description: 90,
    ctaOptions: ['Call Now', 'Get Quote', 'Learn More', 'Buy Now'],
    notes: '3 headlines (30 chars each), 2 descriptions (90 chars each). Include keyword in headline 1.',
  },
  google_display: {
    primaryText: 90,
    headline: 30,
    description: 90,
    ctaOptions: ['Learn More', 'Sign Up', 'Get Started'],
    notes: 'Short headline: 30 chars, Long headline: 90 chars. Keep it simple — display ads are glanced at.',
  },
  linkedin: {
    primaryText: 150,
    headline: 70,
    description: 100,
    ctaOptions: ['Learn More', 'Sign Up', 'Download', 'Register'],
    notes: 'Professional tone. B2B focus. Lead with data or insight.',
  },
  tiktok: {
    primaryText: 100,
    headline: 40,
    description: 100,
    ctaOptions: ['Learn More', 'Shop Now', 'Sign Up'],
    notes: 'Hook in first 3 seconds is CRITICAL. Script format: Hook → Body (15-30s) → CTA overlay.',
  },
};

export function getAdCopySpecPrompt(platform: string): string {
  const spec = AD_COPY_SPECS[platform.toLowerCase()] || AD_COPY_SPECS.facebook;
  return `PLATFORM: ${platform.toUpperCase()}
- Primary text: max ${spec.primaryText} chars
- Headline: max ${spec.headline} chars
- Description: max ${spec.description} chars
- CTA options: ${spec.ctaOptions.join(', ')}
- Notes: ${spec.notes}`;
}

// ============================================================
// EMAIL DRIP SEQUENCE FRAMEWORK
// ============================================================

export const EMAIL_SEQUENCE_FRAMEWORK = [
  { day: 0, type: 'welcome', subject: 'Welcome + deliver value', purpose: 'Set expectations, deliver lead magnet, first impression' },
  { day: 1, type: 'value', subject: 'Teach something useful', purpose: 'Pure value, no selling. Build trust and establish expertise' },
  { day: 3, type: 'value_soft', subject: 'More value + soft mention', purpose: 'Educational content with casual product/service mention' },
  { day: 5, type: 'soft_sell', subject: 'Introduce your solution', purpose: 'Present product/service as solution to a specific problem' },
  { day: 7, type: 'hard_sell', subject: 'Clear CTA with urgency', purpose: 'Direct offer with clear CTA, limited time or scarcity' },
  { day: 10, type: 'objection', subject: 'Handle top objections', purpose: 'Answer pricing, trust, comparison concerns. Social proof heavy' },
  { day: 14, type: 'followup', subject: 'Did you see this?', purpose: 'Re-engagement, last chance, summary of benefits' },
];

export const EMAIL_SUBJECT_FORMULAS = [
  'How [audience] are getting [result] without [pain]',
  '[Number]-Point Checklist: [Result] in [Timeframe]',
  'The [adjective] way to [benefit] (no [common approach] needed)',
  'I made [mistake] so you don\'t have to',
  '[Name] went from [before] to [after] in [time]',
];

// ============================================================
// A/B TEST ANGLES
// ============================================================

export const AB_TEST_ANGLES = [
  { angle: 'pain', description: 'Lead with the problem/frustration the audience faces' },
  { angle: 'benefit', description: 'Lead with the positive outcome/transformation' },
  { angle: 'social-proof', description: 'Lead with numbers, testimonials, authority' },
  { angle: 'curiosity', description: 'Tease the solution without revealing it' },
  { angle: 'urgency', description: 'Create time pressure or scarcity (only if real)' },
];

// ============================================================
// HORMOZI GRAND SLAM OFFER
// ============================================================

export const OFFER_FRAMEWORK = `
VALUE EQUATION: Dream Outcome × Perceived Likelihood ÷ Time Delay ÷ Effort

To maximize conversion, optimize each:
1. DREAM OUTCOME: Paint vivid after-state. "What does success look like?"
2. PERCEIVED LIKELIHOOD: Social proof, guarantees, demonstrations
3. TIME DELAY: Quick wins, immediate access, fast onboarding
4. EFFORT: Templates, automation, done-for-you, no learning curve

GUARANTEE TYPES:
- Results: "If you don't [result] in [time], we [action]"
- Support: "If stuck, we personally help"
- Satisfaction: "Not happy? Full refund"
`;

// ============================================================
// KEYWORD CLUSTER (HUB-AND-SPOKE)
// ============================================================

export const KEYWORD_CLUSTER_PROMPT = `
Generate a Hub-and-Spoke content architecture:

HUB PAGE: Broad topic (highest search volume)
SPOKE PAGES: Specific subtopics that link back to hub

Example:
  HUB: "AI Marketing Tools" (broad)
  SPOKE 1: "Best AI Tools for Social Media" (comparison)
  SPOKE 2: "How to Use AI for Email Marketing" (tutorial)
  SPOKE 3: "AI vs Manual Marketing" (comparison)
  SPOKE 4: "AI Marketing Case Studies" (social proof)

Rules:
- Hub targets broad keyword
- Each spoke targets long-tail keyword
- All spokes link to hub (internal linking)
- Mix of intent: informational, commercial, transactional
`;
