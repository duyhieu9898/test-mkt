import type { ProcessingStep, ProcessingTimeline } from './types';

export const PROCESSING_TIMELINE: ProcessingTimeline[] = [
  {
    step: 'understanding',
    duration: 3000,
    thinkingTexts: [
      'Reading your business idea...',
      'Identifying target market...',
      'Analyzing business model...',
      'Understanding your goals...',
    ],
  },
  {
    step: 'creating_ceo',
    duration: 2500,
    thinkingTexts: [
      'Designing CEO agent personality...',
      'Configuring strategic capabilities...',
      'Setting up decision frameworks...',
    ],
  },
  {
    step: 'creating_marketing',
    duration: 2500,
    thinkingTexts: [
      'Building marketing team structure...',
      'Assigning growth responsibilities...',
      'Connecting team communication...',
    ],
  },
  {
    step: 'creating_operations',
    duration: 2000,
    thinkingTexts: [
      'Setting up operational workflows...',
      'Configuring automation rules...',
      'Establishing quality standards...',
    ],
  },
  {
    step: 'generating_strategy',
    duration: 3000,
    thinkingTexts: [
      'Analyzing market opportunities...',
      'Creating launch timeline...',
      'Prioritizing first actions...',
      'Finalizing growth plan...',
    ],
  },
  {
    step: 'setting_up_brand',
    duration: 2000,
    thinkingTexts: [
      'Extracting brand identity...',
      'Preparing brand voice...',
      'Saving company defaults...',
    ],
  },
];

export const WEBSITE_ANALYSIS_STEP: ProcessingTimeline = {
  step: 'analyzing_website',
  duration: 4000,
  thinkingTexts: [
    'Crawling your website...',
    'Analyzing SEO structure...',
    'Detecting competitors...',
    'Finding social media profiles...',
    'Identifying keyword opportunities...',
    'Running SEO audit...',
  ],
};

export function getProcessingTimeline(hasWebsite: boolean): ProcessingTimeline[] {
  if (hasWebsite) {
    return [
      PROCESSING_TIMELINE[0], // understanding
      WEBSITE_ANALYSIS_STEP,   // analyzing_website
      ...PROCESSING_TIMELINE.slice(1), // rest
    ];
  }
  return PROCESSING_TIMELINE;
}

export const STEP_LABELS: Record<ProcessingStep, string> = {
  understanding: 'Understanding your company',
  analyzing_website: 'Analyzing your website',
  creating_ceo: 'Creating CEO agent',
  creating_marketing: 'Building marketing team',
  creating_operations: 'Setting up operations',
  generating_strategy: 'Generating growth strategy',
  setting_up_brand: 'Setting up brand identity',
};

export function getTotalDuration(hasWebsite = false): number {
  const timeline = getProcessingTimeline(hasWebsite);
  return timeline.reduce((sum, step) => sum + step.duration, 0);
}

export function getProgressAtStep(currentStep: ProcessingStep, hasWebsite = false): number {
  const timeline = getProcessingTimeline(hasWebsite);
  let progress = 0;
  for (const step of timeline) {
    if (step.step === currentStep) {
      return progress + 50 / timeline.length;
    }
    progress += 100 / timeline.length;
  }
  return 100;
}

export function getStepIndex(step: ProcessingStep, hasWebsite = false): number {
  const timeline = getProcessingTimeline(hasWebsite);
  return timeline.findIndex((s) => s.step === step);
}
