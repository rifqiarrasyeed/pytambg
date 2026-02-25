import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/utils/api-error";
import { assertAttachmentsOwned, linkAttachments } from "../src/services/attachment-link-service";

describe("attachment-link-service", () => {
  it("accepts attachments owned by active sppg", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: "att-1" }, { id: "att-2" }],
        rowCount: 2
      })
    };

    const ids = await assertAttachmentsOwned(client, {
      sppgId: "sppg-a",
      attachmentIds: ["att-1", "att-2"]
    });

    expect(ids).toEqual(["att-1", "att-2"]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("rejects attachments outside active sppg", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: "att-1" }],
        rowCount: 1
      })
    };

    await expect(
      assertAttachmentsOwned(client, {
        sppgId: "sppg-a",
        attachmentIds: ["att-1", "att-2"]
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("links attachment rows for entity", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: "att-1" }],
          rowCount: 1
        })
        .mockResolvedValue({
          rows: [],
          rowCount: 1
        })
    };

    await linkAttachments(client, {
      sppgId: "sppg-a",
      entityTable: "receipts",
      entityId: "rec-1",
      attachmentIds: ["att-1"],
      actorUserId: "user-1"
    });

    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
