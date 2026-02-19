import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ConversationMessage, Sender } from '../types';

// The API key is provided directly as per the user's request for this API-only context.
const API_KEY = 'AIzaSyBUNMEhvezImbrJY8aI9Cf660uwFOi0BKA';

// Create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key.
// For this simulation, it's created once, but the guidance recommends creating it inside the function if the API key
// could change during runtime (e.g., from a user selection dialog).
const createGeminiClient = () => {
  if (!API_KEY) {
    // This should theoretically not be hit as API_KEY is now hardcoded.
    throw new Error("API_KEY is not defined. Please ensure the API key is set.");
  }
  return new GoogleGenAI({ apiKey: API_KEY });
};

/**
 * Calls the Gemini API to generate a response based on the conversation history and a system instruction.
 * @param history The full conversation history.
 * @param latestScammerMessage The most recent message from the scammer.
 * @param systemInstruction A system-level instruction for the AI's behavior.
 * @returns A promise that resolves to the generated text response.
 */
export async function callGemini(
  history: ConversationMessage[],
  latestScammerMessage: string,
  systemInstruction: string,
): Promise<string> {
  try {
    const ai = createGeminiClient();

    // Construct conversation parts for Gemini. The `history` already contains previous turns,
    // and `latestScammerMessage` is the current turn's input.
    const conversationParts = history.map(msg => ({
      text: `${msg.sender}: ${msg.text}`
    }));

    // Add the latest scammer message to the prompt, ensuring it's always from the SCAMMER perspective for the API input.
    conversationParts.push({ text: `${Sender.SCAMMER}: ${latestScammerMessage}` });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-flash-latest', // Using 'gemini-flash-latest' as it's a general alias for the latest flash model.
      contents: {
        parts: conversationParts.map(part => ({ text: part.text }))
      },
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.8, // Slightly creative to keep conversation engaging
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 200, // Limit response length for faster interaction
      },
    });

    const text = response.text;
    if (!text) {
      console.warn("Gemini API returned an empty response text.");
      return "I'm sorry, I seem to be having trouble understanding. Can you please rephrase?";
    }
    return text;
  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    // Graceful error message
    return "I apologize, I encountered an issue. Could you please repeat that?";
  }
}
