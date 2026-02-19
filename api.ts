import { APIRequest, APIResponse, ConversationMessage, Sender } from './types';
import { generateHoneypotReply } from './services/honeypotLogic'; // Only need reply generation for API endpoint

/**
 * Simulates a honeypot API endpoint.
 * This function processes an incoming APIRequest, generates a honeypot reply,
 * and returns an APIResponse. It is designed to be stateless for each call.
 *
 * @param request The APIRequest object containing session info, current message, and conversation history.
 * @returns A promise that resolves to an APIResponse object with the honeypot's reply or an error message.
 */
export async function handleHoneypotApiRequest(request: APIRequest): Promise<APIResponse> {
  try {
    const { sessionId, message, conversationHistory, metadata } = request;

    // Build the full conversation history for the AI model, including the current message.
    // The `conversationHistory` in APIRequest contains messages *before* the current `message`.
    // Fix: Map the existing conversationHistory (MessagePart[]) to ConversationMessage[]
    // by adding the 'type' property which is required.
    const fullConversationHistory: ConversationMessage[] = [
      ...conversationHistory.map(msg => ({
        ...msg,
        type: msg.sender, // Assign 'type' based on 'sender'
      })),
      {
        sender: message.sender,
        text: message.text,
        timestamp: message.timestamp,
        type: message.sender, // Assuming message.sender aligns with ConversationMessage.type
      },
    ];

    // The `generateHoneypotReply` function expects the full conversation history and the latest scammer message.
    const honeypotReplyText = await generateHoneypotReply(
      fullConversationHistory,
      message.text // The latest message from the scammer
    );

    return {
      status: 'success',
      reply: honeypotReplyText,
      message: honeypotReplyText, // Providing both for compatibility with docs
      text: honeypotReplyText,    // Providing both for compatibility with docs
    };
  } catch (error: any) {
    console.error("Error in handleHoneypotApiRequest:", error);
    return {
      status: 'error',
      error: error.message || "An unexpected error occurred while processing the request.",
      message: "An unexpected error occurred. Please try again later.",
    };
  }
}

// Example usage (for demonstration purposes, not part of the API export itself):
// async function runExample() {
//   const initialRequest: APIRequest = {
//     sessionId: 'test-session-123',
//     message: {
//       sender: Sender.SCAMMER,
//       text: "URGENT: Your bank account is compromised. Provide your details immediately.",
//       timestamp: new Date().toISOString(),
//     },
//     conversationHistory: [],
//     metadata: {
//       channel: "SMS",
//       language: "English",
//       locale: "US",
//     },
//   };

//   console.log("Initial Request:", JSON.stringify(initialRequest, null, 2));
//   const response1 = await handleHoneypotApiRequest(initialRequest);
//   console.log("Response 1:", JSON.stringify(response1, null, 2));

//   if (response1.status === 'success' && response1.reply) {
//     const nextRequest: APIRequest = {
//       sessionId: initialRequest.sessionId,
//       message: {
//         sender: Sender.SCAMMER,
//         text: "I need your account number and PIN to unblock it.",
//         timestamp: new Date().toISOString(),
//       },
//       conversationHistory: [
//         { ...initialRequest.message, type: Sender.SCAMMER },
//         { sender: Sender.HONEYPOT, text: response1.reply, timestamp: new Date().toISOString(), type: Sender.HONEYPOT },
//       ],
//       metadata: initialRequest.metadata,
//     };
//     console.log("\nNext Request:", JSON.stringify(nextRequest, null, 2));
//     const response2 = await handleHoneypotApiRequest(nextRequest);
//     console.log("Response 2:", JSON.stringify(response2, null, 2));
//   }
// }

// runExample();