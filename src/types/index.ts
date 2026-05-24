export type PetState = 'idle' | 'walk' | 'sleep' | 'happy' | 'click' | 'type' | 'follow';

export interface PetPosition {
  x: number;
  y: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Reminder {
  id: string;
  content: string;
  triggerAt: number;
  repeat: 'once' | 'daily' | 'weekly';
  enabled: boolean;
}

export interface AppConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  petSize: number;
  activityLevel: 'quiet' | 'normal' | 'active';
  autoStart: boolean;
}

export interface AIResponse {
  content: string;
  error?: string;
  action?: {
    action: string;
    target?: string;
    content?: string;
    minutes?: number;
  };
}
