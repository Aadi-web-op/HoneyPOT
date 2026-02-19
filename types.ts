export enum Sender {
  SCAMMER = 'scammer',
  HONEYPOT = 'honeypot',
  USER = 'user' // For API Request simulation
}

export interface MessagePart {
  sender: Sender;
  text: string;
  timestamp: string;
}

export interface Metadata {
  channel: string;
  language: string;
  locale: string;
  [key: string]: any; // Allow for other metadata fields
}

export interface APIRequest {
  sessionId: string;
  message: MessagePart;
  conversationHistory: MessagePart[];
  metadata: Metadata;
}

export interface APIResponse {
  status: 'success' | 'error';
  reply?: string;
  message?: string; // Alternative to reply, per docs
  text?: string;    // Alternative to reply, per docs
  error?: string;
}

export interface ConversationMessage extends MessagePart {
  type: Sender; // To distinguish between honeypot's own replies and external user's (for chat display)
}

export interface ExtractedIntelligence {
  phoneNumbers: Set<string>;
  bankAccounts: Set<string>;
  upiIds: Set<string>;
  phishingLinks: Set<string>;
  emailAddresses: Set<string>;
  // Add other IDs as needed for the 'Any other identifying information'
  otherIds: Set<string>;
}

export interface EngagementMetrics {
  totalMessagesExchanged: number;
  engagementDurationSeconds: number;
}

export interface FinalOutput {
  sessionId: string;
  scamDetected: boolean;
  totalMessagesExchanged: number;
  extractedIntelligence: {
    phoneNumbers: string[];
    bankAccounts: string[];
    upiIds: string[];
    phishingLinks: string[];
    emailAddresses: string[];
    otherIds: string[];
  };
  engagementMetrics: EngagementMetrics;
  agentNotes: string;
}

export interface FakeData {
  bankAccount?: string;
  upiId?: string;
  phoneNumber?: string;
  phishingLink?: string;
  emailAddress?: string;
  [key: string]: string | undefined; // Allow for other fake data fields
}

export interface Scenario {
  scenarioId: string;
  name: string;
  description: string;
  scamType: string;
  initialMessage: string;
  metadata: Metadata;
  weight: number;
  maxTurns: number;
  fakeData: FakeData;
}
