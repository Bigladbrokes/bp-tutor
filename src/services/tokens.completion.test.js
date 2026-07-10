import { doc, setDoc } from "firebase/firestore";
import { markSessionCompleted } from "./tokens";

// Firestore is mocked in this file only, so tokens.test.js keeps loading the
// real firebase module graph. jest.mock is hoisted above the imports;
// implementations live in the test body because CRA's resetMocks clears
// factory-defined implementations before each test.
jest.mock("../config/firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  setDoc: jest.fn(),
}));

// The flag must MERGE into /students/{uid}: a plain set here would wipe
// tokenBalance, role, and every other completedSessions entry.
test("markSessionCompleted merges the session flag into /students/{uid}", async () => {
  doc.mockImplementation((_db, ...path) => path.join("/"));
  setDoc.mockResolvedValue(undefined);
  await markSessionCompleted("stu1", "sessA");
  expect(setDoc).toHaveBeenCalledTimes(1);
  expect(setDoc).toHaveBeenCalledWith(
    "students/stu1",
    { completedSessions: { sessA: true } },
    { merge: true }
  );
});
