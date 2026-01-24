/**
 * AI Resilience Core Types
 */

export type ThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AIRequestOptions {
    thinkingLevel: ThinkingLevel;
    prompt: string;
    temperature?: number;
    systemInstruction?: string;
    jsonSchema?: any; // For structured output
}

export interface ModelConfig {
    id: string; // e.g. 'gemini-1.5-flash'
    name: string; // Display name
    maxOutputTokens: number;
    description: string;
}

// Model Mapping (The "Giro")
// Maps abstract levels to concrete models available in Google AI Studio
export const MODEL_STRATEGY: Record<ThinkingLevel, string[]> = {
    // LOW: efficiency, OCR, formatting
    // Strategy: Use the fastest/cheapest models
    LOW: [
        'gemini-1.5-flash-8b', // "2.5-flash-lite" equivalent in current API
        'gemini-1.5-flash',
        'gemini-1.5-flash-001'
    ],

    // MEDIUM: standard Q&A, logic
    // Strategy: Balanced approach
    MEDIUM: [
        'gemini-1.5-flash-002', // Stable, good reasoning
        'gemini-1.5-flash',
        'gemini-2.0-flash-exp'  // Fallback to exp if stable fails
    ],

    // HIGH: architecture, complex reasoning
    // Strategy: Best available reasoning power
    HIGH: [
        'gemini-2.0-flash-exp', // "Gemini 3" equivalent (Current SOTA in API)
        'gemini-1.5-pro',
        'gemini-1.5-pro-002'
    ]
};
