import { computeSessionStats } from "./sessionStats";

describe("sessionStats smoke tests", () => {
  const mockSession = { questionIds: ["q1", "q2"] };
  const mockQuestions = [
    { id: "q1", type: "mc", difficulty: "Easy" }, // 1 token
    { id: "q2", type: "mc", difficulty: "Medium" } // 5 tokens, maxSessionTokens = 6
  ];

  it("excludes zero-attempt students from class averages", () => {
    // Two students joined
    const joins = [
      { id: "studentA", studentName: "Alice", joinedAt: 1000 },
      { id: "studentB", studentName: "Bob", joinedAt: 2000 }
    ];
    
    // Only Alice has answered anything (got 1 question correct)
    const results = [
      {
        studentUid: "studentA",
        studentName: "Alice",
        questionId: "q1",
        mode: "guided",
        correct: true,
        attempts: 1,
        timestamp: { toMillis: () => 3000 }
      }
    ];

    const stats = computeSessionStats(mockSession, mockQuestions, results, joins);
    
    // Both students should be in studentRows
    expect(stats.summary.totalStudents).toBe(2);
    expect(stats.studentRows.length).toBe(2);
    
    const aliceRow = stats.studentRows.find(r => r.uid === "studentA");
    const bobRow = stats.studentRows.find(r => r.uid === "studentB");
    
    // Alice's progress is 1/2 (50%) and score is 1/6 (~17%)
    expect(aliceRow.progress.x).toBe(1);
    
    // Bob has 0 attempts
    expect(bobRow.progress.x).toBe(0);
    
    // Class averages should reflect ONLY Alice (since Bob has 0 attempts)
    // Avg Score: Alice got 1 token out of 6 (16.666...%) -> Math.round is 17%
    // Class Progress: Alice is 50%, Bob is ignored -> Avg Progress = 50%
    expect(stats.summary.avgScorePct).toBe(17);
    expect(stats.summary.classProgressPct).toBe(50);
  });

  it("handles all-unattempted session without throwing (returns 0%)", () => {
    // Two students joined, NO results yet
    const joins = [
      { id: "studentA", studentName: "Alice", joinedAt: 1000 },
      { id: "studentB", studentName: "Bob", joinedAt: 2000 }
    ];
    
    const stats = computeSessionStats(mockSession, mockQuestions, [], joins);
    
    expect(stats.summary.totalStudents).toBe(2);
    expect(stats.summary.avgScorePct).toBe(0);
    expect(stats.summary.classProgressPct).toBe(0);
    expect(stats.studentRows.length).toBe(2);
  });
});
