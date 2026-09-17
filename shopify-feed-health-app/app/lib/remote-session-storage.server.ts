import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import {
  decryptSessionPayload,
  encryptSessionPayload,
} from "./session-crypto.mjs";

type StoreResponse = {
  ok?: boolean;
  payload?: string | null;
  payloads?: string[];
};

export class RemoteSessionStorage implements SessionStorage {
  constructor(
    private readonly endpoint: string,
    private readonly secret: string,
  ) {
    if (!/^https:\/\//i.test(endpoint)) {
      throw new Error("SESSION_STORE_URL must be an HTTPS URL.");
    }
    if (secret.length < 32) {
      throw new Error("SESSION_STORE_SECRET must be at least 32 characters.");
    }
  }

  private async request(operation: string, body: Record<string, unknown> = {}): Promise<StoreResponse> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ operation, ...body }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Session store request failed with status ${response.status}.`);
    }

    const result = (await response.json()) as StoreResponse;
    if (!result?.ok) throw new Error("Session store rejected the request.");
    return result;
  }

  async storeSession(session: Session): Promise<boolean> {
    const payload = encryptSessionPayload(session.toPropertyArray(), this.secret);
    await this.request("store", {
      id: session.id,
      shop: session.shop,
      payload,
    });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const result = await this.request("load", { id });
    if (!result.payload) return undefined;
    return Session.fromPropertyArray(
      decryptSessionPayload(result.payload, this.secret) as [string, string][],
    );
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.request("delete", { id });
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    await this.request("deleteMany", { ids });
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const result = await this.request("findByShop", { shop });
    return (result.payloads || []).map((payload) =>
      Session.fromPropertyArray(
        decryptSessionPayload(payload, this.secret) as [string, string][],
      ),
    );
  }
}
