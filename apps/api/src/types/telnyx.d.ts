declare module "telnyx" {
  export interface MessageResult {
    data: unknown;
  }

  export interface MessagesCreateParams {
    from: string;
    to: string;
    body: string;
    media_urls?: string[];
  }

  export class Telnyx {
    constructor(apiKey: string);
    messages: {
      create(params: Record<string, string | string[]>): Promise<MessageResult>;
    };
  }
}
