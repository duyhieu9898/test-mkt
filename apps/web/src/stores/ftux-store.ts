import { create } from 'zustand';
import type {
  FTUXStep,
  ProcessingStep,
  DetectedInfo,
  DetectedBusinessInfo,
  FTUXAgent,
  FTUXStrategy,
  MasterPlan,
  WebsiteAnalysis,
  InputType,
} from '@/lib/ftux/types';

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface FTUXState {
  // Current step
  step: FTUXStep;
  setStep: (step: FTUXStep) => void;

  // User input
  userPrompt: string;
  setUserPrompt: (prompt: string) => void;
  inputType: InputType;
  setInputType: (type: InputType) => void;
  websiteUrl: string | null;
  setWebsiteUrl: (url: string | null) => void;

  // Processing state
  isProcessing: boolean;
  processingStep: ProcessingStep | null;
  completedSteps: ProcessingStep[];
  progress: number;
  aiThinking: string;
  detectedInfo: DetectedInfo | null;

  // Website analysis
  websiteAnalysis: WebsiteAnalysis | null;
  setWebsiteAnalysis: (analysis: WebsiteAnalysis | null) => void;

  // Business confirmation
  businessConfirmation: DetectedBusinessInfo | null;
  setBusinessConfirmation: (info: DetectedBusinessInfo | null) => void;

  // Results
  company: Company | null;
  agents: FTUXAgent[];
  setAgents: (agents: FTUXAgent[]) => void;
  strategy: FTUXStrategy | null;
  masterPlan: MasterPlan | null;
  setMasterPlan: (plan: MasterPlan | null) => void;

  // Execution
  executionStarted: boolean;
  startExecution: () => void;

  // Error state
  error: string | null;

  // Actions
  startProcessing: () => void;
  updateProcessingStep: (step: ProcessingStep) => void;
  completeProcessingStep: (step: ProcessingStep) => void;
  setAiThinking: (text: string) => void;
  setProgress: (progress: number) => void;
  setDetectedInfo: (info: DetectedInfo) => void;
  updateBusinessDetails: (info: DetectedBusinessInfo) => void;
  setResults: (company: Company, agents: FTUXAgent[], strategy: FTUXStrategy, masterPlan?: MasterPlan, websiteAnalysis?: WebsiteAnalysis) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  step: 'landing' as FTUXStep,
  userPrompt: '',
  inputType: 'text' as InputType,
  websiteUrl: null as string | null,
  isProcessing: false,
  processingStep: null as ProcessingStep | null,
  completedSteps: [] as ProcessingStep[],
  progress: 0,
  aiThinking: '',
  detectedInfo: null as DetectedInfo | null,
  websiteAnalysis: null as WebsiteAnalysis | null,
  businessConfirmation: null as DetectedBusinessInfo | null,
  company: null as Company | null,
  agents: [] as FTUXAgent[],
  strategy: null as FTUXStrategy | null,
  masterPlan: null as MasterPlan | null,
  executionStarted: false,
  error: null as string | null,
};

export const useFTUXStore = create<FTUXState>()((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setUserPrompt: (userPrompt) => set({ userPrompt }),

  setInputType: (inputType) => set({ inputType }),

  setWebsiteUrl: (websiteUrl) => set({ websiteUrl }),

  setWebsiteAnalysis: (websiteAnalysis) => set({ websiteAnalysis }),

  setBusinessConfirmation: (businessConfirmation) => set({ businessConfirmation }),

  setMasterPlan: (masterPlan) => set({ masterPlan }),

  setAgents: (agents) => set({ agents }),

  startExecution: () => set({ executionStarted: true }),

  startProcessing: () =>
    set({
      isProcessing: true,
      step: 'processing',
      processingStep: null,
      completedSteps: [],
      progress: 0,
      aiThinking: '',
      error: null,
    }),

  updateProcessingStep: (processingStep) =>
    set({ processingStep }),

  completeProcessingStep: (step) =>
    set((state) => ({
      completedSteps: state.completedSteps.includes(step)
        ? state.completedSteps
        : [...state.completedSteps, step],
    })),

  setAiThinking: (aiThinking) => set({ aiThinking }),

  setProgress: (progress) => set({ progress }),

  setDetectedInfo: (detectedInfo) => set({ detectedInfo }),

  updateBusinessDetails: (info) =>
    set((state) => ({
      detectedInfo: {
        market: info.market,
        model: info.model,
        strategy: info.strategy,
      },
      businessConfirmation: info,
      company: state.company ? { ...state.company, name: info.companyName } : null,
      websiteAnalysis: state.websiteAnalysis
        ? {
            ...state.websiteAnalysis,
            businessInfo: {
              ...state.websiteAnalysis.businessInfo,
              ...info,
            },
          }
        : null,
    })),

  setResults: (company, agents, strategy, masterPlan, websiteAnalysis) =>
    set({
      company,
      agents,
      strategy,
      masterPlan: masterPlan || null,
      websiteAnalysis: websiteAnalysis || null,
      isProcessing: false,
      progress: 100,
    }),

  setError: (error) =>
    set({
      error,
      isProcessing: false,
    }),

  reset: () => set(initialState),
}));
