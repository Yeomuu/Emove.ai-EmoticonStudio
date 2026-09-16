import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../server/firebase-storage", () => ({
  firebaseStorageConfigurationError: vi.fn(() => null),
  readFirebaseJson: vi.fn(), writeFirebaseJson: vi.fn(),
  listFirebaseJson: vi.fn(), deleteFirebaseJson: vi.fn(),
}));
import { readFirebaseJson, writeFirebaseJson } from "../server/firebase-storage";
import { saveLibraryRecord } from "../server/library-store";

const record = { id: "base", kind: "characters", payload: { name: "updated" } };
beforeEach(() => vi.resetAllMocks());
describe("canonical character persistence", () => {
  it("does not overwrite a revised base character when an older project saves", async () => {
    vi.mocked(readFirebaseJson).mockResolvedValue({ objectName: "base", value: { createdAt: "2026-01-01", updatedAt: "2026-09-16" } });
    expect(await saveLibraryRecord({ ...record, createOnly: true })).toMatchObject({ enabled: true, syncedAt: "2026-09-16" });
    expect(writeFirebaseJson).not.toHaveBeenCalled();
  });
  it("allows an explicit character revision and retains creation time", async () => {
    vi.mocked(readFirebaseJson).mockResolvedValue({ objectName: "base", value: { createdAt: "2026-01-01" } });
    vi.mocked(writeFirebaseJson).mockResolvedValue({ path: "base", size: 10 });
    expect(await saveLibraryRecord(record)).toMatchObject({ enabled: true });
    expect(writeFirebaseJson).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ createdAt: "2026-01-01", payload: record.payload }), undefined);
  });
  it("uses an atomic create precondition and handles concurrent creation", async () => {
    vi.mocked(readFirebaseJson).mockResolvedValue(null);
    vi.mocked(writeFirebaseJson).mockRejectedValue({ code: 412 });
    expect(await saveLibraryRecord({ ...record, createOnly: true })).toMatchObject({ enabled: true });
    expect(writeFirebaseJson).toHaveBeenCalledWith(expect.any(String), expect.any(Object), true);
  });
  it("does not hide other storage failures", async () => {
    vi.mocked(readFirebaseJson).mockResolvedValue(null);
    vi.mocked(writeFirebaseJson).mockRejectedValue(new Error("unavailable"));
    expect(await saveLibraryRecord({ ...record, createOnly: true })).toMatchObject({ enabled: false });
  });
});
