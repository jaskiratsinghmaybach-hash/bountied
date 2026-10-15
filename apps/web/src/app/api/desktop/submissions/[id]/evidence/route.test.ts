
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDesktopUser, mockFindUnique } = vi.hoisted(() => ({
  mockGetDesktopUser: vi.fn(),
  mockFindUnique: vi.fn(),
}));

vi.mock("@/lib/desktop/auth", () => ({
  getDesktopUser: mockGetDesktopUser,
  unauthorized: () =>
    Response.json(
      { error: "Not authenticated" },
      { status: 401 },
    ),
  forbidden: () =>
    Response.json(
      { error: "Not authorized" },
      { status: 403 },
    ),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    submission: {
      findUnique: mockFindUnique,
    },
  },
}));

import { GET } from "./route";

describe("desktop submission evidence route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    mockGetDesktopUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/desktop/submissions/sub-1/evidence"),
      { params: Promise.resolve({ id: "sub-1" }) },
    );

    expect(response.status).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("forbids users who do not own the problem", async () => {
    mockGetDesktopUser.mockResolvedValue({ id: "other-user" });
    mockFindUnique.mockResolvedValue({
      status: "AWAITING_REVIEW",
      isRevealed: false,
      sandboxOutput: "private output",
      sandboxExitCode: 0,
      sandboxError: null,
      sandboxRanAt: new Date(),
      problem: { giverId: "problem-owner" },
    });

    const response = await GET(
      new Request("http://localhost/api/desktop/submissions/sub-1/evidence"),
      { params: Promise.resolve({ id: "sub-1" }) },
    );

    expect(response.status).toBe(403);
  });

  it("does not expose sandbox output before reveal", async () => {
    mockGetDesktopUser.mockResolvedValue({ id: "problem-owner" });
    mockFindUnique.mockResolvedValue({
      status: "AWAITING_REVIEW",
      isRevealed: false,
      sandboxOutput: "private output",
      sandboxExitCode: 0,
      sandboxError: null,
      sandboxRanAt: new Date(),
      problem: { giverId: "problem-owner" },
    });

    const response = await GET(
      new Request("http://localhost/api/desktop/submissions/sub-1/evidence"),
      { params: Promise.resolve({ id: "sub-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      isRevealed: false,
      output: null,
    });
  });

  it("returns sandbox output after reveal", async () => {
    mockGetDesktopUser.mockResolvedValue({ id: "problem-owner" });
    mockFindUnique.mockResolvedValue({
      status: "ACCEPTED",
      isRevealed: true,
      sandboxOutput: "public output",
      sandboxExitCode: 0,
      sandboxError: null,
      sandboxRanAt: new Date(),
      problem: { giverId: "problem-owner" },
    });

    const response = await GET(
      new Request("http://localhost/api/desktop/submissions/sub-1/evidence"),
      { params: Promise.resolve({ id: "sub-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      isRevealed: true,
      output: "public output",
    });
  });
});
