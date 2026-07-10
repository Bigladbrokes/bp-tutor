import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SessionGate from "./SessionGate";
import { getSessionById } from "../services/firestore";

jest.mock("../services/firestore", () => ({
  getSessionById: jest.fn(),
  markSessionJoin: jest.fn(() => Promise.resolve()),
  // StudentPage imports these; they are never called in these tests because
  // the "active" state (which renders StudentPage) is not exercised here.
  subscribeActiveSession: jest.fn(() => () => {}),
  getQuestionsByIds: jest.fn(() => Promise.resolve([])),
}));

const user = { uid: "student-1", displayName: "Test Student" };

test("shows a clear message when the session has ended", async () => {
  getSessionById.mockResolvedValue({ id: "s1", isActive: false });
  render(
    <MemoryRouter>
      <SessionGate user={user} sessionId="s1" />
    </MemoryRouter>
  );
  expect(await screen.findByText(/this session has ended/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /go to the app/i })).toBeInTheDocument();
});

test("shows a clear message when the session id does not exist", async () => {
  getSessionById.mockResolvedValue(null);
  render(
    <MemoryRouter>
      <SessionGate user={user} sessionId="missing" />
    </MemoryRouter>
  );
  expect(await screen.findByText(/session not found/i)).toBeInTheDocument();
});

test("a lookup failure degrades to not-found instead of crashing", async () => {
  getSessionById.mockRejectedValue(new Error("network"));
  render(
    <MemoryRouter>
      <SessionGate user={user} sessionId="s2" />
    </MemoryRouter>
  );
  expect(await screen.findByText(/session not found/i)).toBeInTheDocument();
});
