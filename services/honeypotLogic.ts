import { callGemini } from './geminiService';
import {
  ConversationMessage,
  ExtractedIntelligence,
  FinalOutput,
  Scenario,
  Sender,
  MessagePart
} from '../types';
import { SCAM_KEYWORDS, SYSTEM_INSTRUCTION } from '../constants';

/**
 * Regex patterns for extracting intelligence.
 * These patterns are designed to be generic to avoid hardcoding for specific examples.
 */
const PHONE_NUMBER_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g;
const BANK_ACCOUNT_REGEX = /\b(?:\d{9,18}|[A-Z]{4}\d{7}[A-Z]\d{6})\b/g; // 9-18 digits, or common IFSC+account format
const UPI_ID_REGEX = /\b[a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+\b/g;
const PHISHING_LINK_REGEX = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*))/g;
const EMAIL_ADDRESS_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const GENERIC_ID_REGEX = /\b(?:ID|Ref|Code|No)\s*[:#]\s*([a-zA-Z0-9]{4,15})\b/gi; // Generic ID patterns


/**
 * Detects if a message contains keywords commonly associated with scams.
 * @param message The text of the message to analyze.
 * @param currentScamDetected Current detection status.
 * @returns True if a scam keyword is found or if scam was already detected, false otherwise.
 */
export function detectScam(message: string, currentScamDetected: boolean): boolean {
  if (currentScamDetected) {
    return true; // Once detected, always remains detected for the session
  }
  const lowerCaseMessage = message.toLowerCase();
  return SCAM_KEYWORDS.some(keyword => lowerCaseMessage.includes(keyword.toLowerCase()));
}

/**
 * Extracts various types of intelligence from a message using regex patterns.
 * @param message The text of the message to extract from.
 * @returns A partial ExtractedIntelligence object with any found data.
 */
export function extractIntelligence(message: string): Partial<ExtractedIntelligence> {
  const extracted: Partial<ExtractedIntelligence> = {
    phoneNumbers: new Set(),
    bankAccounts: new Set(),
    upiIds: new Set(),
    phishingLinks: new Set(),
    emailAddresses: new Set(),
    otherIds: new Set(),
  };

  let match;

  // Phone Numbers
  while ((match = PHONE_NUMBER_REGEX.exec(message)) !== null) {
    extracted.phoneNumbers?.add(match[0].replace(/[-\s()]/g, '')); // Normalize
  }

  // Bank Accounts
  while ((match = BANK_ACCOUNT_REGEX.exec(message)) !== null) {
    extracted.bankAccounts?.add(match[0]);
  }

  // UPI IDs
  while ((match = UPI_ID_REGEX.exec(message)) !== null) {
    extracted.upiIds?.add(match[0]);
  }

  // Phishing Links
  while ((match = PHISHING_LINK_REGEX.exec(message)) !== null) {
    extracted.phishingLinks?.add(match[0]);
  }

  // Email Addresses
  while ((match = EMAIL_ADDRESS_REGEX.exec(message)) !== null) {
    extracted.emailAddresses?.add(match[0]);
  }

  // Other Generic IDs (e.g., "ID: 12345", "Ref#ABC")
  while ((match = GENERIC_ID_REGEX.exec(message)) !== null) {
    extracted.otherIds?.add(match[1]);
  }


  return extracted;
}

/**
 * Generates a honeypot's reply using the Gemini AI.
 * @param conversationHistory The current conversation history.
 * @param latestScammerMessage The most recent message from the scammer.
 * @param extractedIntelligence The intelligence extracted so far (can be used to prompt the AI to ask for more).
 * @returns A promise that resolves to the generated reply text.
 */
export async function generateHoneypotReply(
  conversationHistory: ConversationMessage[],
  latestScammerMessage: string,
  // extractedIntelligence: ExtractedIntelligence // Not directly used in prompt, but could be for complex logic
): Promise<string> {
  const historyForGemini = conversationHistory.filter(msg => msg.sender !== Sender.USER); // Filter out internal API user messages

  // Gemini model takes `contents` as parts. We need to construct this.
  // The `chat` API might be more natural for this, but the `models.generateContent` with system instruction is also viable.
  // For `models.generateContent`, the `contents` array needs to be structured correctly for multi-turn.
  // The guidance states "when using generate content for text answers, do not define the model first and call generate content later. You must use ai.models.generateContent to query GenAI with both the model name and prompt."
  // And "Generate content with multiple parts, for example, by sending an image and a text prompt to the model."
  // So, we'll build the prompt by concatenating the history for `contents: { parts: [{text: fullPrompt}] }` or `contents: fullPrompt`.
  // However, the `chat.sendMessage` is more appropriate for multi-turn conversations without explicit image/tool parts.
  // Let's re-evaluate based on the `chat` guidance. "Starts a chat and sends a message to the model."
  // "let response: GenerateContentResponse = await chat.sendMessage({ message: "Tell me a story in 100 words." });"
  // This implies the `chat` object maintains history. For this problem, we are simulating an API endpoint,
  // so each request will contain the full history. Thus, `ai.models.generateContent` is more fitting,
  // where we feed the whole conversation.

  const fullConversationContext = historyForGemini
    .map(msg => `${msg.sender === Sender.SCAMMER ? 'Scammer' : 'Honeypot'}: ${msg.text}`)
    .join('\n');

  const currentPrompt = `Conversation so far:\n${fullConversationContext}\nScammer: ${latestScammerMessage}\nHoneypot:`;

  try {
    const reply = await callGemini(
      historyForGemini, // Pass filtered history
      latestScammerMessage, // Pass the latest message as a distinct part or in the prompt
      SYSTEM_INSTRUCTION
    );
    return reply;
  } catch (error) {
    console.error("Error generating honeypot reply:", error);
    return "I am experiencing some technical difficulties. Could you please provide that information again?";
  }
}

/**
 * Constructs the final output object based on the conversation and extracted data.
 * @param sessionId The unique session identifier.
 * @param conversationHistory The complete list of messages exchanged.
 * @param scamDetected Whether a scam was detected.
 * @param finalExtractedIntelligence The accumulated extracted intelligence.
 * @param engagementDurationSeconds The total duration of the conversation.
 * @param agentNotes Any additional notes from the honeypot agent.
 * @returns The FinalOutput object.
 */
export function createFinalOutput(
  sessionId: string,
  conversationHistory: ConversationMessage[],
  scamDetected: boolean,
  finalExtractedIntelligence: ExtractedIntelligence,
  engagementDurationSeconds: number,
  agentNotes: string,
  scenario: Scenario // Pass the scenario to get fakeData for evaluation
): FinalOutput {
  const totalMessagesExchanged = conversationHistory.length;

  return {
    sessionId,
    scamDetected,
    totalMessagesExchanged,
    extractedIntelligence: {
      phoneNumbers: Array.from(finalExtractedIntelligence.phoneNumbers),
      bankAccounts: Array.from(finalExtractedIntelligence.bankAccounts),
      upiIds: Array.from(finalExtractedIntelligence.upiIds),
      phishingLinks: Array.from(finalExtractedIntelligence.phishingLinks),
      emailAddresses: Array.from(finalExtractedIntelligence.emailAddresses),
      otherIds: Array.from(finalExtractedIntelligence.otherIds),
    },
    engagementMetrics: {
      totalMessagesExchanged,
      engagementDurationSeconds,
    },
    agentNotes,
  };
}


/**
 * Placeholder for evaluating the final output against fake data (as per documentation example).
 * This function would typically be on the evaluator's side, but we can simulate it for display purposes.
 * @param finalOutput The generated final output.
 * @param scenario The original scenario data.
 * @param conversationHistory The full conversation history.
 * @returns A score breakdown object.
 */
export function evaluateFinalOutput(
  finalOutput: FinalOutput,
  scenario: Scenario,
  conversationHistory: ConversationMessage[]
): {
  scamDetection: number;
  intelligenceExtraction: number;
  engagementQuality: number;
  responseStructure: number;
  total: number;
} {
  const score = {
    scamDetection: 0,
    intelligenceExtraction: 0,
    engagementQuality: 0,
    responseStructure: 0,
    total: 0,
  };

  // 1. Scam Detection (20 points)
  if (finalOutput.scamDetected) {
    score.scamDetection = 20;
  }

  // 2. Intelligence Extraction (40 points)
  const extracted = finalOutput.extractedIntelligence;
  const fakeData = scenario.fakeData;

  const keyMapping: { [key: string]: keyof ExtractedIntelligence } = {
    bankAccount: 'bankAccounts',
    upiId: 'upiIds',
    phoneNumber: 'phoneNumbers',
    phishingLink: 'phishingLinks',
    emailAddress: 'emailAddresses',
    // 'otherIds' might not have a direct fakeData key, but can be generally matched
  };

  for (const [fakeKey, fakeValue] of Object.entries(fakeData)) {
    if (fakeValue) { // Ensure fakeValue is not undefined
      const outputKey = keyMapping[fakeKey] || fakeKey as keyof ExtractedIntelligence; // Use fakeKey directly if not mapped
      const extractedValues = extracted[outputKey] || [];

      if (extractedValues.some(v => String(v).includes(fakeValue))) {
        score.intelligenceExtraction += 10;
      }
    }
  }
  score.intelligenceExtraction = Math.min(score.intelligenceExtraction, 40);


  // 3. Engagement Quality (20 points)
  const metrics = finalOutput.engagementMetrics;
  const duration = metrics.engagementDurationSeconds || 0;
  const messages = metrics.totalMessagesExchanged || 0;

  if (duration > 0) score.engagementQuality += 5;
  if (duration > 60) score.engagementQuality += 5;
  if (messages > 0) score.engagementQuality += 5;
  if (messages >= 5) score.engagementQuality += 5;

  // 4. Response Structure (20 points) - Simplified for frontend display as the API ensures this
  // In a real scenario, this would check the structure of the *API response*, not the finalOutput itself.
  // For the purpose of simulating the evaluation, we'll check the final output structure.
  const requiredFields: Array<keyof FinalOutput> = ['sessionId', 'scamDetected', 'extractedIntelligence', 'engagementMetrics', 'totalMessagesExchanged'];
  const optionalFields: Array<keyof FinalOutput> = ['agentNotes'];

  for (const field of requiredFields) {
    if (field in finalOutput) {
      score.responseStructure += 5;
    }
  }
  for (const field of optionalFields) {
    if (field in finalOutput && finalOutput[field]) { // Check if field exists and has a value
      score.responseStructure += 2.5;
    }
  }
  score.responseStructure = Math.min(score.responseStructure, 20);

  // Calculate total
  score.total =
    score.scamDetection +
    score.intelligenceExtraction +
    score.engagementQuality +
    score.responseStructure;

  return score;
}
