import { StringSanitizer } from './utils'

const CHAT_COMPLETIONS_API_ENDPOINT = "https://api.individual.githubcopilot.com/chat/completions"
const MODELS_API_ENDPOINT = "https://api.individual.githubcopilot.com/models"
const MAX_TOKENS = 10240

async function getCopilotToken(): Promise<string> {
  return process.env.COPILOT_TOKEN || "default-token"
}

export function preprocessRequestBody(requestBody: any): any {

  if (!requestBody?.messages) return requestBody

  const sanitizer = new StringSanitizer()
  const processedMessages: any[] = []

  for (const message of requestBody.messages) {
    if (!Array.isArray(message.content)) {
      let content = message.content
      if (typeof content === 'string') {
        const result = sanitizer.sanitize(content)
        content = result.text
      }
      processedMessages.push({ ...message, content })
    } else {
      for (const contentItem of message.content) {
        if (typeof contentItem !== 'object' || contentItem === null) {
          throw new Error("Invalid content item structure: content item must be an object.");
        }
        if (contentItem.type !== "text") {
          throw new Error("Only text type is supported in content array. Ensure 'type' is 'text'.");
        }
        if (typeof contentItem.text === 'undefined') {
          throw new Error("Invalid content item: 'text' property is missing for text type content.");
        }
        let text = contentItem.text
        if (typeof text === 'string') {
          const result = sanitizer.sanitize(text)
          text = result.text
        }
        processedMessages.push({ role: message.role, content: text })
      }
    }
  }

  if (requestBody.model && requestBody.model.startsWith("o1")) {
    processedMessages.forEach(msg => {
      if (msg.role === "system") msg.role = "user"
    })
  }

  requestBody.max_tokens = requestBody.max_tokens || MAX_TOKENS

  return { ...requestBody, messages: processedMessages }
}

export async function listModels(): Promise<any> {

  const token = await getCopilotToken()
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "editor-version": "vscode/1.95.3"
  }

  const response = await fetch(MODELS_API_ENDPOINT, {
    method: "GET",
    headers
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Models API error: ${errorText}`)
  }
  
  return await response.json()
}
export async function proxyChatCompletions(requestBody: any): Promise<Response> {
  const token = await getCopilotToken()
  if (token === "default-token") { console.warn("[Copilot Service] WARNING: Using default Copilot token. Ensure COPILOT_TOKEN environment variable is set for production."); }
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "Accept": "text/event-stream",
    "editor-version": "vscode/1.95.3"
  }
  const body = preprocessRequestBody(requestBody)

  let response: Response | null = null; // This variable is in the conceptual outline, but not strictly necessary with the implemented logic. Included for closer adherence.
  let lastError: any = null;
  const maxRetries = 2;
  const initialDelay = 500; // ms

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const currentResponse = await fetch(CHAT_COMPLETIONS_API_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });

      if (currentResponse.ok) {
        return currentResponse; // Success
      }

      // Check for 5xx errors for retry
      const errorText = await currentResponse.text(); // Read body once for logging/error reporting
      if (currentResponse.status >= 500 && currentResponse.status <= 599) {
        lastError = new Error(`External API error: Status ${currentResponse.status}`); // As per conceptual outline
        console.warn(`[Copilot Service] Attempt ${attempt + 1} failed with status ${currentResponse.status}. Retrying in ${initialDelay * Math.pow(2, attempt)}ms... Error: ${errorText}`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, attempt)));
          continue; // Retry
        } else {
            // Log details before throwing the final error after all retries
            console.error(`[Copilot Service] External API Error after ${maxRetries + 1} attempts: Status: ${currentResponse.status}, Body: ${errorText}`);
            throw new Error(`API error: ${errorText}`); // All retries failed, as per conceptual outline
        }
      } else {
        // Non-5xx error, don't retry
        console.error(`[Copilot Service] External API Error: Status: ${currentResponse.status}, Body: ${errorText}`);
        throw new Error(`API error: ${errorText}`); // As per conceptual outline
      }
    } catch (error: any) {
      lastError = error; // Store the error (could be from fetch itself, or our thrown errors)

      // If error is one we threw from non-5xx or exhausted 5xx retries, it's already logged.
      // The conceptual outline does not differentiate these in the catch block, it always logs a generic "Attempt X failed with error Y"
      // and retries if possible. This means an error we threw (like "API error: ...") would be caught here,
      // logged again with "Attempt X failed...", and then potentially retried if it wasn't the last attempt.
      // This behavior matches the conceptual outline.

      console.warn(`[Copilot Service] Attempt ${attempt + 1} failed with error: ${error.message}. Retrying in ${initialDelay * Math.pow(2, attempt)}ms...`);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, attempt)));
        // continue; // The loop will continue to the next attempt. Not strictly needed here as it's the end of the try-catch.
      } else {
        console.error(`[Copilot Service] Fetch error after ${maxRetries + 1} attempts: ${error.message}`);
        throw error; // All retries failed, throw the last error encountered (could be a network error or one of our new Error objects)
      }
    }
  }
  // Should not be reached if logic is correct, but as a fallback:
  if (lastError) throw lastError;
  // Fallback for unexpected scenario where loop finishes without returning/throwing
  throw new Error("[Copilot Service] API request failed after multiple retries due to an unexpected issue.");
}
