/**
 * Video Engine — Script + Scene Pipeline
 *
 * Generates video ad scripts from business context,
 * then breaks them into timed scenes for rendering.
 */

import { llmGenerate, extractJSON } from '../lib/llm';
import { buildBusinessContext } from './business-context';

// ============================================================================
// TYPES
// ============================================================================

export interface VideoScript {
  hook: string;
  body: string[];
  cta: string;
  voiceoverText?: string;
}

export interface VideoScene {
  order: number;
  duration: number;
  text: string;
  imageUrl?: string;
  animation: 'fade' | 'slide-left' | 'zoom' | 'none';
  backgroundColor?: string;
}

export type VideoFormat = '15s' | '30s' | '60s';
export type VideoAspectRatio = '9:16' | '16:9' | '1:1';
export type VideoStatus = 'script' | 'scenes' | 'rendering' | 'ready' | 'failed';

export interface VideoProject {
  id: string;
  companyId: string;
  title: string;
  format: VideoFormat;
  aspectRatio: VideoAspectRatio;
  status: VideoStatus;
  script: VideoScript;
  scenes: VideoScene[];
  outputUrl?: string;
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

const FORMAT_SECONDS: Record<VideoFormat, number> = {
  '15s': 15,
  '30s': 30,
  '60s': 60,
};

const FORMAT_SCENE_COUNT: Record<VideoFormat, string> = {
  '15s': '3-4',
  '30s': '5-6',
  '60s': '6-8',
};

// ============================================================================
// SCRIPT GENERATION
// ============================================================================

export async function generateScript(
  companyId: string,
  options: { format: VideoFormat; aspectRatio: VideoAspectRatio }
): Promise<{ title: string; script: VideoScript }> {
  const ctx = await buildBusinessContext(companyId);
  const seconds = FORMAT_SECONDS[options.format];

  const { text } = await llmGenerate([
    {
      role: 'system',
      content: 'You are a video ad creative director. Create short, punchy scripts for social media ads. Every second counts.',
    },
    {
      role: 'user',
      content: `Create a ${options.format} video ad script.

BUSINESS: ${ctx.fullContext.substring(0, 1200)}

FORMAT: ${options.format} (${seconds} seconds)
ASPECT RATIO: ${options.aspectRatio}

RULES:
- Hook (first 3 seconds): Grab attention with a question, bold statement, or surprising fact
- Body: 2-4 key points, each spoken in 3-5 seconds
- CTA: Clear action in last 3 seconds
- Total duration: exactly ${seconds} seconds
- Every line must be speakable in allocated time
- Use simple, conversational language
- Include visual direction for each section

Return ONLY JSON:
{
  "title": "Video title",
  "hook": "Opening line that grabs attention in 3 seconds",
  "body": ["Point 1 (5 seconds)", "Point 2 (5 seconds)"],
  "cta": "Clear CTA for last 3 seconds",
  "voiceoverText": "Full voiceover script as one paragraph"
}`,
    },
  ], { maxTokens: 1500 });

  const parsed = extractJSON(text) || {};

  return {
    title: parsed.title || `${options.format} Video Ad`,
    script: {
      hook: parsed.hook || 'Did you know?',
      body: parsed.body || ['Key benefit one', 'Key benefit two'],
      cta: parsed.cta || 'Get started today',
      voiceoverText: parsed.voiceoverText,
    },
  };
}

// ============================================================================
// SCENE BREAKDOWN
// ============================================================================

export async function breakIntoScenes(
  script: VideoScript,
  format: VideoFormat
): Promise<VideoScene[]> {
  const seconds = FORMAT_SECONDS[format];
  const sceneCount = FORMAT_SCENE_COUNT[format];

  const scriptText = JSON.stringify({
    hook: script.hook,
    body: script.body,
    cta: script.cta,
    voiceoverText: script.voiceoverText,
  });

  const { text } = await llmGenerate([
    {
      role: 'system',
      content: 'You are a video editor. Break scripts into timed scenes with visual direction.',
    },
    {
      role: 'user',
      content: `Break this video script into timed scenes.

SCRIPT: ${scriptText}
FORMAT: ${seconds} seconds
TOTAL SCENES: ${sceneCount}

Return ONLY JSON array:
[{
  "order": 1,
  "duration": 3,
  "text": "Text shown on screen",
  "animation": "fade|slide-left|zoom|none",
  "visualDirection": "Description of what should be shown",
  "backgroundColor": "#hex color"
}]`,
    },
  ], { maxTokens: 1500 });

  const parsed = extractJSON(text);
  const scenes: VideoScene[] = (Array.isArray(parsed) ? parsed : []).map((s: any, i: number) => ({
    order: s.order || i + 1,
    duration: s.duration || 3,
    text: s.text || '',
    animation: (['fade', 'slide-left', 'zoom', 'none'].includes(s.animation) ? s.animation : 'fade') as VideoScene['animation'],
    backgroundColor: s.backgroundColor || '#1e293b',
  }));

  // Ensure we have at least one scene
  if (scenes.length === 0) {
    scenes.push(
      { order: 1, duration: 3, text: script.hook, animation: 'fade', backgroundColor: '#1e293b' },
      ...script.body.map((b, i) => ({
        order: i + 2,
        duration: Math.floor((seconds - 6) / script.body.length),
        text: b,
        animation: 'slide-left' as const,
        backgroundColor: '#334155',
      })),
      { order: script.body.length + 2, duration: 3, text: script.cta, animation: 'zoom', backgroundColor: '#6366f1' },
    );
  }

  return scenes;
}
